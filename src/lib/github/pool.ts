// One connection pool for every HTTP request Stage Director sends to GitHub.
//
// The gateway (gateway.ts) counts what the dashboard *asked* for. Some requests
// never pass through it: the GitHub App's installation-token requests, calls made
// with a person's own token (approvals, live pushes), and anything a library sends
// on its own. This pool sits under all of them, at the wire, so /usage can show
// exactly what went to GitHub:
//  - every request sent, by identity (app, app sign-in, person, token) and endpoint,
//  - the answer's status, and GitHub's own count from the x-ratelimit-* headers,
//  - how many TCP/TLS connections were opened vs reused (keep-alive).
import { Agent, fetch as undiciFetch } from "undici";

export type Identity = "app" | "app-auth" | "person" | "token";

export interface WireCall { at: number; identity: Identity; method: string; route: string; status: number | null; resource?: string }
export interface Budget { limit: number; remaining: number; used: number; resetAt: number; seenAt: number }

const WINDOW = 60 * 60_000;

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

  constructor(private now: () => number = Date.now) {
    this.startedAt = now();
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

  /** Record one call (exported for tests). */
  note(identity: Identity, method: string, url: string, status: number | null, headers?: Headers) {
    const at = this.now();
    const resource = headers?.get("x-ratelimit-resource") ?? undefined;
    this.calls.push({ at, identity, method, route: routeOf(method, url), status, resource });
    const cutoff = at - WINDOW;
    while (this.calls.length && (this.calls[0].at < cutoff || this.calls.length > 50_000)) this.calls.shift();
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
    for (const c of this.calls) {
      if (c.at < since) continue;
      const k = `${c.identity}|${c.route}`;
      const r = rows.get(k) ?? { identity: c.identity, route: c.route, sent: 0, notModified: 0, failed: 0 };
      r.sent++;
      sent++;
      if (c.status === 304) {
        r.notModified++;
        notModified++;
      } else if (c.status === null || c.status >= 400) r.failed++;
      rows.set(k, r);
    }
    const lastMinute = this.calls.filter((c) => c.at >= this.now() - 60_000).length;
    const budgets = [...this.budgets.entries()].map(([key, b]) => ({ key, ...b }));
    return {
      rows: [...rows.values()].sort((a, b) => b.sent - a.sent),
      sent,
      // 304 answers to conditional requests do not count against GitHub's limit.
      counted: sent - notModified,
      notModified,
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
