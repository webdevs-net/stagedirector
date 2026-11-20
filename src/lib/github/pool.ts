// One connection pool for every HTTP request Stage Director sends to GitHub.
//
// The gateway (gateway.ts) counts what the dashboard *asked* for. Some requests
// never pass through it: the GitHub App's installation-token requests, calls made
// with a person's own token (approvals, live pushes), and anything a library sends
// on its own. This pool sits under all of them, at the wire, so /usage can show
// exactly what went to GitHub:
//  - every request sent, by identity (app, app sign-in, person, token) and endpoint,
//  - the answer's status, and GitHub's own count from the x-ratelimit-* headers,
//  - how many TCP/TLS connections were opened vs reused (keep-alive),
//  - git fetch / ls-remote traffic from the local copies (localgit.ts), shown apart:
//    git over HTTPS does not use the REST API's hourly limit.
// The last hour is saved to a small temporary Float32 file (see "Saved counts"
// below) so a restart keeps it. STAGEDIRECTOR_CALLS_FILE overrides the path;
// "off" keeps memory only.
import { Agent, fetch as undiciFetch } from "undici";

export type Identity = "app" | "app-auth" | "person" | "token" | "git";

export interface WireCall { at: number; identity: Identity; method: string; route: string; status: number | null; resource?: string }
export interface Budget { limit: number; remaining: number; used: number; resetAt: number; seenAt: number }

const WINDOW = 60 * 60_000;

// ---- Saved counts ---------------------------------------------------------------
// <tmp>/stagedirector/github-calls.f32: Float32 values (machine byte order).
//   header: [magic 0x5344 ("SD"), version 1, baseHi, baseLo, count]
//           base = baseHi * 65536 + baseLo, whole seconds (both halves exact in float32)
//   then `count` records of 4 floats: [secondsAfterBase, identity, route, status]
//           identity = index in IDENTITIES, route = index in the routes list, status 0 = no answer.
// Route names live next to it in github-calls.routes.json. 16 bytes a call: an hour of
// polling is a few kilobytes. Temporary by design: losing it only loses the counts.
const IDENTITIES: Identity[] = ["app", "app-auth", "person", "token", "git"];
const MAGIC = 0x5344;

function callsFile(): string | null {
  const f = process.env.STAGEDIRECTOR_CALLS_FILE;
  if (f === "off") return null;
  if (f) return f;
  if (process.env.VITEST) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("node:os") as typeof import("node:os");
  return `${os.tmpdir()}/stagedirector/github-calls.f32`;
}

const routesFileFor = (file: string) => file.replace(/\.f32$/, "") + ".routes.json";

/** Calls to Float32 bytes plus the route list. */
export function encodeCalls(calls: WireCall[]): { bytes: Buffer; routes: string[] } {
  const base = calls.length ? Math.floor(calls[0].at / 1000) : 0;
  const routes: string[] = [];
  const idx = new Map<string, number>();
  const f = new Float32Array(5 + calls.length * 4);
  f.set([MAGIC, 1, Math.floor(base / 65536), base % 65536, calls.length]);
  calls.forEach((c, i) => {
    const key = `${c.method} ${c.route}`;
    let r = idx.get(key);
    if (r === undefined) {
      r = routes.push(key) - 1;
      idx.set(key, r);
    }
    f.set([c.at / 1000 - base, IDENTITIES.indexOf(c.identity), r, c.status ?? 0], 5 + i * 4);
  });
  return { bytes: Buffer.from(f.buffer), routes };
}

/** Float32 bytes plus route list back to calls; [] when the file is not ours. */
export function decodeCalls(bytes: Buffer, routes: string[]): WireCall[] {
  if (bytes.length < 20 || bytes.length % 4) return [];
  const f = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  if (f[0] !== MAGIC || f[1] !== 1) return [];
  const base = f[2] * 65536 + f[3];
  const n = Math.min(f[4], (f.length - 5) / 4);
  const out: WireCall[] = [];
  for (let i = 0; i < n; i++) {
    const [dt, id, r, st] = f.subarray(5 + i * 4, 9 + i * 4);
    const identity = IDENTITIES[id];
    const key = routes[r];
    if (!identity || typeof key !== "string") continue;
    const sp = key.indexOf(" ");
    out.push({ at: Math.round((base + dt) * 1000), identity, method: key.slice(0, sp), route: key.slice(sp + 1), status: st ? st : null });
  }
  return out;
}

/** Turn a GitHub API URL into an endpoint label without ids, shas or names ("GET /repos/{owner}/{repo}/deployments/{id}/statuses"). */
export function routeOf(method: string, url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split("?")[0];
  }
  const parts = path.split("/").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const prev = out[out.length - 1];
    if (prev === "repos" && i + 1 < parts.length) {
      out.push("{owner}", "{repo}");
      i++;
    } else if (/^[0-9a-f]{40}$/i.test(p)) out.push("{sha}");
    else if (/^\d+$/.test(p)) out.push("{id}");
    else if (prev === "collaborators" || prev === "users") out.push("{username}");
    else if (prev === "contents") {
      out.push("{path}");
      break;
    } else if (prev === "ref" || prev === "refs" || prev === "commits" || prev === "statuses" || prev === "status") {
      out.push("{ref}");
      break;
    } else out.push(p);
  }
  return `${method.toUpperCase()} /${out.join("/")}`;
}

export class Pool {
  readonly calls: WireCall[] = [];
  /** GitHub's own numbers per identity and resource ("core", "graphql"), from the latest answer. */
  readonly budgets = new Map<string, Budget>();
  connectionsOpened = 0;
  requests = 0;
  readonly startedAt: number;
  readonly agent: Agent;

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private now: () => number = Date.now, private file: string | null = callsFile()) {
    this.startedAt = now();
    this.load();
    this.agent = new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 10 * 60_000, connections: 8 });
    this.agent.on("connect", () => {
      this.connectionsOpened++;
    });
  }

  /** A fetch that sends through this pool and records the call as `identity`. */
  fetchAs(identity: Identity): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
      this.requests++;
      try {
        const res = await undiciFetch(input as never, { ...(init as object), dispatcher: this.agent } as never);
        this.note(identity, method, url, res.status, res.headers as unknown as Headers);
        return res as unknown as Response;
      } catch (e) {
        this.note(identity, method, url, null);
        throw e;
      }
    }) as typeof fetch;
  }

  private load() {
    if (!this.file) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("node:fs") as typeof import("node:fs");
      const routes = JSON.parse(fs.readFileSync(routesFileFor(this.file), "utf8")) as string[];
      const cutoff = this.now() - WINDOW;
      for (const c of decodeCalls(fs.readFileSync(this.file), routes)) if (c.at >= cutoff) this.calls.push(c);
    } catch {
      /* no saved file yet, or unreadable: start empty */
    }
  }

  /** Write the last hour to disk, at most every 2 s. */
  private save() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 2000);
    this.saveTimer.unref?.();
  }

  /** Write now (tests, shutdown). */
  flush() {
    if (!this.file) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("node:fs") as typeof import("node:fs");
      fs.mkdirSync(this.file.replace(/\/[^/]*$/, ""), { recursive: true });
      const { bytes, routes } = encodeCalls(this.calls);
      const routesFile = routesFileFor(this.file);
      fs.writeFileSync(`${routesFile}.tmp`, JSON.stringify(routes));
      fs.writeFileSync(`${this.file}.tmp`, bytes);
      fs.renameSync(`${routesFile}.tmp`, routesFile);
      fs.renameSync(`${this.file}.tmp`, this.file);
    } catch {
      /* disk trouble: memory still counts */
    }
  }

  /** Record a git network operation (fetch, ls-remote) against github.com. */
  noteGit(op: string, repo: string, ok: boolean) {
    this.push({ at: this.now(), identity: "git", method: "GIT", route: `GIT ${op} {owner}/{repo}`, status: ok ? 200 : null });
    void repo;
  }

  private push(c: WireCall) {
    this.calls.push(c);
    const cutoff = c.at - WINDOW;
    while (this.calls.length && (this.calls[0].at < cutoff || this.calls.length > 50_000)) this.calls.shift();
    this.save();
  }

  /** Record one call (exported for tests). */
  note(identity: Identity, method: string, url: string, status: number | null, headers?: Headers) {
    const at = this.now();
    const resource = headers?.get("x-ratelimit-resource") ?? undefined;
    this.push({ at, identity, method, route: routeOf(method, url), status, resource });
    const limit = Number(headers?.get("x-ratelimit-limit"));
    const remaining = Number(headers?.get("x-ratelimit-remaining"));
    const used = Number(headers?.get("x-ratelimit-used"));
    const reset = Number(headers?.get("x-ratelimit-reset"));
    if (headers && Number.isFinite(limit) && Number.isFinite(remaining)) {
      this.budgets.set(`${identity}:${resource ?? "core"}`, {
        limit, remaining, used: Number.isFinite(used) ? used : limit - remaining,
        resetAt: Number.isFinite(reset) ? reset * 1000 : 0, seenAt: at,
      });
    }
  }

  /** What went over the wire in the last `ms`, for /usage. */
  summary(ms = WINDOW) {
    const since = this.now() - ms;
    const rows = new Map<string, { identity: Identity; route: string; sent: number; notModified: number; failed: number }>();
    let sent = 0;
    let notModified = 0;
    let git = 0;
    for (const c of this.calls) {
      if (c.at < since) continue;
      if (c.identity === "git") git++;
      const k = `${c.identity}|${c.route}`;
      const r = rows.get(k) ?? { identity: c.identity, route: c.route, sent: 0, notModified: 0, failed: 0 };
      r.sent++;
      if (c.identity !== "git") sent++;
      if (c.status === 304) {
        r.notModified++;
        notModified++;
      } else if (c.status === null || c.status >= 400) r.failed++;
      rows.set(k, r);
    }
    const lastMinute = this.calls.filter((c) => c.at >= this.now() - 60_000 && c.identity !== "git").length;
    const budgets = [...this.budgets.entries()].map(([key, b]) => ({ key, ...b }));
    return {
      rows: [...rows.values()].sort((a, b) => b.sent - a.sent),
      sent,
      // 304 answers to conditional requests do not count against GitHub's limit.
      counted: sent - notModified,
      notModified,
      git,
      lastMinute,
      connectionsOpened: this.connectionsOpened,
      requests: this.requests,
      startedAt: this.startedAt,
      budgets,
    };
  }
}

const g = globalThis as unknown as { __sdPool?: Pool };
/** The one pool (survives dev hot reloads). */
export const pool: Pool = (g.__sdPool ??= new Pool());
