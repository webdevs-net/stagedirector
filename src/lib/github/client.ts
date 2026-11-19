import "server-only";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { EtagCache } from "./etag";

/** Shared across requests so polls reuse ETags (304s are free against the rate limit). */
export const etagCache = new EtagCache();

/** GitHub's hourly API budget for our token, from the headers of the latest response. */
export const rateLimit: { remaining: number | null; resetAt: number | null } = { remaining: null, resetAt: null };

function noteLimit(headers: Record<string, unknown> | undefined) {
  const rem = Number(headers?.["x-ratelimit-remaining"]);
  const reset = Number(headers?.["x-ratelimit-reset"]);
  if (Number.isFinite(rem)) rateLimit.remaining = rem;
  if (Number.isFinite(reset)) rateLimit.resetAt = reset * 1000;
}

/** True while the budget is nearly gone: background refreshes pause until it resets. */
export function rateLimited(): boolean {
  return rateLimit.remaining !== null && rateLimit.remaining < 100 && (rateLimit.resetAt ?? 0) > Date.now();
}

function withEtags(gh: Octokit): Octokit {
  gh.hook.wrap("request", async (request, options) => {
    const { method, url } = gh.request.endpoint(options as never) as { method: string; url: string };
    try {
      const res = (await etagCache.wrap(request as never, options as never, `${method} ${url}`)) as { headers?: Record<string, unknown> };
      noteLimit(res.headers);
      return res as never;
    } catch (e) {
      noteLimit((e as { response?: { headers?: Record<string, unknown> } }).response?.headers);
      throw e;
    }
  });
  return gh;
}

/**
 * Server-side Octokit for the dashboard's own GitHub identity.
 * Prefers a GitHub App (GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID),
 * falls back to GITHUB_TOKEN. Returns null when neither is set, so callers can
 * fall back to sample data.
 */
let cached: Octokit | null | undefined;

// Octokit logs every failed request with console.error. Expected 404s (a stage that is not
// pinned, a file that does not exist yet) are handled by the callers, so only warnings are
// printed; real failures still throw and are reported where they are caught.
const log = { debug: () => {}, info: () => {}, warn: console.warn, error: () => {} };

export function githubConfigured(): boolean {
  const e = process.env;
  return Boolean((e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY && e.GITHUB_APP_INSTALLATION_ID) || e.GITHUB_TOKEN);
}

export function getOctokit(): Octokit | null {
  if (cached !== undefined) return cached;
  const e = process.env;
  // GITHUB_API_URL: GitHub Enterprise, or the fake GitHub used by the tests (src/lib/github/testing/fake-github.ts).
  const baseUrl = e.GITHUB_API_URL || undefined;
  if (e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY && e.GITHUB_APP_INSTALLATION_ID) {
    cached = withEtags(new Octokit({
      baseUrl,
      log,
      authStrategy: createAppAuth,
      auth: {
        appId: e.GITHUB_APP_ID,
        privateKey: e.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
        installationId: Number(e.GITHUB_APP_INSTALLATION_ID),
      },
    }));
  } else if (e.GITHUB_TOKEN) {
    cached = withEtags(new Octokit({ log, auth: e.GITHUB_TOKEN, baseUrl }));
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
  return new Octokit({ log, auth: token, baseUrl: process.env.GITHUB_API_URL || undefined });
}

/** True when the dashboard's own identity is a GitHub App (a bot), not a person's token. */
export function dashboardIsApp(): boolean {
  const e = process.env;
  return Boolean(e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY && e.GITHUB_APP_INSTALLATION_ID);
}
