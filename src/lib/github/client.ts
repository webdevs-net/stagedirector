import "server-only";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { Gateway } from "./gateway";
import { pool } from "./pool";

/**
 * Background GitHub calls (pages, polls) allowed per 15 minutes. Button presses are never capped,
 * and 304 answers are free (GitHub does not count them), so they are not charged either.
 * STAGEDIRECTOR_GITHUB_PER_15_MINUTES (default 600, about half of a GitHub App's 5,000 an hour).
 * The old STAGEDIRECTOR_GITHUB_PER_MINUTE still works (times 15).
 */
export function per15Minutes(): number {
  const n = Number(process.env.STAGEDIRECTOR_GITHUB_PER_15_MINUTES);
  if (Number.isFinite(n) && n > 0) return n;
  const m = Number(process.env.STAGEDIRECTOR_GITHUB_PER_MINUTE);
  return Number.isFinite(m) && m > 0 ? m * 15 : 600;
}
/** Steady rate, per minute, of the 15-minute budget. */
export const perMinute = (): number => per15Minutes() / 15;

const gg = globalThis as unknown as { __sdGateway?: Gateway };
/** The one gateway (survives dev hot reloads). See gateway.ts. The whole 15-minute budget may be used at once. */
export const gateway: Gateway = (gg.__sdGateway ??= new Gateway({ perMinute: perMinute(), burst: per15Minutes() }));
export const etagCache = gateway.etags;
export const rateLimit = gateway.limit;
/** True while the budget is nearly gone: background refreshes pause until it resets. */
export const rateLimited = (): boolean => gateway.lowBudget();

function throughGateway(gh: Octokit): Octokit {
  gh.hook.wrap("request", (request, options) => {
    const o = options as { method?: string; url?: string };
    const { method, url } = gh.request.endpoint(options as never) as { method: string; url: string };
    return gateway.handle(request as never, options as never, `${method} ${o.url ?? url}`, `${method} ${url}`) as never;
  });
  return gh;
}

/**
 * Server-side Octokit for the dashboard's own GitHub identity.
 * Prefers a GitHub App (GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID),
 * then STAGEDIRECTOR_GITHUB_TOKEN (a token used only by the dashboard, so its hourly
 * limit is not shared with the gh CLI and other tools), then GITHUB_TOKEN. Returns null when neither is set, so callers can
 * fall back to sample data.
 */
let cached: Octokit | null | undefined;

// Octokit logs every failed request with console.error. Expected 404s (a stage that is not
// pinned, a file that does not exist yet) are handled by the callers, so only warnings are
// printed; real failures still throw and are reported where they are caught.
const log = { debug: () => {}, info: () => {}, warn: console.warn, error: () => {} };

export function githubConfigured(): boolean {
  const e = process.env;
  return Boolean((e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY && e.GITHUB_APP_INSTALLATION_ID) || e.STAGEDIRECTOR_GITHUB_TOKEN || e.GITHUB_TOKEN);
}

/** Which identity the dashboard uses, for /usage. */
export function githubIdentity(): "app" | "own-token" | "shared-token" | "none" {
  const e = process.env;
  if (e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY && e.GITHUB_APP_INSTALLATION_ID) return "app";
  if (e.STAGEDIRECTOR_GITHUB_TOKEN) return "own-token";
  return e.GITHUB_TOKEN ? "shared-token" : "none";
}

export function getOctokit(): Octokit | null {
  if (cached !== undefined) return cached;
  const e = process.env;
  // GITHUB_API_URL: GitHub Enterprise, or the fake GitHub used by the tests (src/lib/github/testing/fake-github.ts).
  const baseUrl = e.GITHUB_API_URL || undefined;
  if (e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY && e.GITHUB_APP_INSTALLATION_ID) {
    cached = throughGateway(new Octokit({
      baseUrl,
      log,
      request: { fetch: pool.fetchAs("app") },
      authStrategy: createAppAuth,
      auth: {
        // Installation-token requests go through the pool too, counted as "app sign-in".
        request: new Octokit({ baseUrl, request: { fetch: pool.fetchAs("app-auth") } }).request,
        appId: e.GITHUB_APP_ID,
        privateKey: e.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
        installationId: Number(e.GITHUB_APP_INSTALLATION_ID),
      },
    }));
  } else if (e.STAGEDIRECTOR_GITHUB_TOKEN || e.GITHUB_TOKEN) {
    cached = throughGateway(new Octokit({ log, auth: e.STAGEDIRECTOR_GITHUB_TOKEN || e.GITHUB_TOKEN, baseUrl, request: { fetch: pool.fetchAs("token") } }));
  } else {
    cached = null;
  }
  return cached;
}

let identity: Promise<string> | undefined;
/** Login GitHub shows as creator of things this dashboard writes (e.g. "stage-director[bot]"). */
export function selfLogin(gh: Octokit): Promise<string> {
  identity ??= (async () => {
    if (process.env.GITHUB_APP_ID) {
      const { data } = await gh.rest.apps.getAuthenticated();
      return `${data?.slug}[bot]`;
    }
    const { data } = await gh.rest.users.getAuthenticated();
    return data.login;
  })();
  return identity;
}

export function configuredRepos(): string[] {
  return (process.env.STAGEDIRECTOR_REPOS ?? "")
    .split(/[\s,]+/)
    .map((r) => r.trim())
    .filter((r) => /^[\w.-]+\/[\w.-]+$/.test(r));
}

export function splitRepo(repo: string): { owner: string; repo: string } {
  const [owner, name] = repo.split("/");
  return { owner, repo: name };
}

export const WORKFLOW_FILE = "stagedirector.yml";
export const CONFIG_FILE = "stagedirector.yml";

/** Tests only: forget the cached client and identity so new env vars take effect. */
export function resetGithubClient() {
  cached = undefined;
  identity = undefined;
}

/** Octokit acting as a person (their own OAuth token), for things GitHub must attribute to them. */
export function personOctokit(token: string): Octokit {
  return new Octokit({ log, auth: token, baseUrl: process.env.GITHUB_API_URL || undefined, request: { fetch: pool.fetchAs("person") } });
}

/** True when the dashboard's own identity is a GitHub App (a bot), not a person's token. */
export function dashboardIsApp(): boolean {
  const e = process.env;
  return Boolean(e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY && e.GITHUB_APP_INSTALLATION_ID);
}
