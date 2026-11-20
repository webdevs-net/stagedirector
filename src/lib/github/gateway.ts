// The one door every GitHub REST call goes through (installed on the Octokit in
// client.ts). It:
//  - counts calls per endpoint, per caller and per result (for /usage),
//  - shares one ETag cache (304s are free against GitHub's limit),
//  - shares identical GETs that are already in flight,
//  - caps background calls (pages, polls) at STAGEDIRECTOR_GITHUB_PER_MINUTE
//    (default 5) with a small burst for a cold start; button presses ("action")
//    never wait on that cap,
//  - backs off when GitHub says the hourly budget is low.
// A capped call fails with GatewayBusy; page reads then keep their cached answer.
import { AsyncLocalStorage } from "node:async_hooks";
import { EtagCache } from "./etag";

export type Caller = "page" | "poll" | "action" | "runs" | "other";
type Resp = { status: number; url: string; headers: Record<string, string | number | undefined>; data: unknown };
type Options = { method?: string; url?: string; headers?: Record<string, string | undefined>; [k: string]: unknown };
type RequestFn = (options: Options) => Promise<Resp>;

export class GatewayBusy extends Error {
  status = 429;
  constructor(reason: string) {
    super(`Stage Director held this GitHub call back: ${reason}`);
  }
}

export interface CallRecord { at: number; route: string; caller: Caller; outcome: "ok" | "not-modified" | "shared" | "held" | "error"; status?: number }

const callerStore = new AsyncLocalStorage<Caller>();
/** Run `fn` with every GitHub call inside it tagged as `caller` (e.g. "action" for button presses). */
export function asCaller<T>(caller: Caller, fn: () => Promise<T>): Promise<T> {
  return callerStore.run(caller, fn);
}
export const currentCaller = (): Caller => callerStore.getStore() ?? "page";

export interface GatewayOptions {
  perMinute: number;   // steady background budget
  burst: number;       // bucket size, so a cold start can fill the cache
  now?: () => number;
  /** How long a page someone opened may wait for a free slot before giving up (default 20 s). */
  pageWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class Gateway {
  readonly etags = new EtagCache();
  readonly calls: CallRecord[] = [];
  readonly limit: { remaining: number | null; resetAt: number | null; total: number | null } = { remaining: null, resetAt: null, total: null };
  private inflight = new Map<string, Promise<Resp>>();
  private tokens: number;
  private refilledAt: number;
  private now: () => number;

  constructor(private opts: GatewayOptions) {
    this.now = opts.now ?? Date.now;
    this.tokens = opts.burst;
    this.refilledAt = this.now();
  }

  /** GitHub's hourly budget is nearly gone: only actions may call. */
  lowBudget(): boolean {
    return this.limit.remaining !== null && this.limit.remaining < 100 && (this.limit.resetAt ?? 0) > this.now();
  }

  private refill() {
    const t = this.now();
    // Below 500 left, background calls slow to a fifth.
    const rate = this.limit.remaining !== null && this.limit.remaining < 500 ? this.opts.perMinute / 5 : this.opts.perMinute;
    this.tokens = Math.min(this.opts.burst, this.tokens + ((t - this.refilledAt) / 60_000) * rate);
    this.refilledAt = t;
  }

  private async waitForToken() {
    const sleep = this.opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const deadline = this.now() + (this.opts.pageWaitMs ?? 20_000);
    while (this.tokens < 1 && this.now() < deadline) {
      const rate = Math.max(this.opts.perMinute, 0.1);
      await sleep(Math.min(deadline - this.now(), Math.ceil(((1 - this.tokens) * 60_000) / rate) + 10));
      this.refill();
    }
  }

  private record(r: Omit<CallRecord, "at">) {
    this.calls.push({ at: this.now(), ...r });
    const cutoff = this.now() - 60 * 60_000;
    while (this.calls.length && (this.calls[0].at < cutoff || this.calls.length > 20_000)) this.calls.shift();
  }

  private noteLimit(headers: Record<string, unknown> | undefined) {
    const rem = Number(headers?.["x-ratelimit-remaining"]);
    const reset = Number(headers?.["x-ratelimit-reset"]);
    const total = Number(headers?.["x-ratelimit-limit"]);
    if (Number.isFinite(rem)) this.limit.remaining = rem;
    if (Number.isFinite(reset)) this.limit.resetAt = reset * 1000;
    if (Number.isFinite(total)) this.limit.total = total;
  }

  /** `route` is the endpoint template ("GET /repos/{owner}/{repo}/deployments"); `key` the full URL. */
  async handle(request: RequestFn, options: Options, route: string, key: string, caller: Caller = currentCaller()): Promise<Resp> {
    const isGet = (options.method ?? "GET").toUpperCase() === "GET";
    if (isGet) {
      const shared = this.inflight.get(key);
      if (shared) {
        this.record({ route, caller, outcome: "shared" });
        return shared;
      }
    }
    if (caller !== "action") {
      if (this.lowBudget()) {
        this.record({ route, caller, outcome: "held" });
        throw new GatewayBusy("GitHub's hourly limit is nearly used up");
      }
      this.refill();
      // A page a person opened waits its turn (the cap still holds) instead of failing at once:
      // after a restart there is no saved copy, so failing shows "Waiting for GitHub" for nothing.
      if (this.tokens < 1 && caller === "page") await this.waitForToken();
      if (this.tokens < 1) {
        this.record({ route, caller, outcome: "held" });
        throw new GatewayBusy(`more than ${this.opts.perMinute} background calls a minute`);
      }
      this.tokens -= 1;
    }
    const before = this.etags.hits;
    const p = this.etags.wrap(request as never, options as never, key) as Promise<Resp>;
    if (isGet) this.inflight.set(key, p);
    try {
      const res = await p;
      this.noteLimit(res.headers);
      this.record({ route, caller, outcome: this.etags.hits > before ? "not-modified" : "ok", status: res.status });
      return res;
    } catch (e) {
      const err = e as { status?: number; response?: { headers?: Record<string, unknown> } };
      this.noteLimit(err.response?.headers);
      this.record({ route, caller, outcome: "error", status: err.status });
      throw e;
    } finally {
      if (isGet) this.inflight.delete(key);
    }
  }

  /** Calls in the last `ms`, grouped for the /usage page. */
  summary(ms = 60 * 60_000) {
    const since = this.now() - ms;
    const rows = new Map<string, { route: string; caller: Caller; ok: number; notModified: number; shared: number; held: number; error: number }>();
    for (const c of this.calls) {
      if (c.at < since) continue;
      const k = `${c.route}|${c.caller}`;
      const r = rows.get(k) ?? { route: c.route, caller: c.caller, ok: 0, notModified: 0, shared: 0, held: 0, error: 0 };
      if (c.outcome === "ok") r.ok++;
      else if (c.outcome === "not-modified") r.notModified++;
      else if (c.outcome === "shared") r.shared++;
      else if (c.outcome === "held") r.held++;
      else r.error++;
      rows.set(k, r);
    }
    const list = [...rows.values()].sort((a, b) => b.ok + b.error - (a.ok + a.error));
    // GitHub counts 200s and errors; 304s, shared and held calls cost nothing.
    const counted = list.reduce((n, r) => n + r.ok + r.error, 0);
    const lastMinute = this.calls.filter((c) => c.at >= this.now() - 60_000 && (c.outcome === "ok" || c.outcome === "error")).length;
    return { rows: list, counted, lastMinute, perMinute: this.opts.perMinute, limit: { ...this.limit } };
  }
}
