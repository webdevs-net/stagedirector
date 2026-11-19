import "server-only";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { Gateway } from "./gateway";

/** Background GitHub calls allowed per minute (pages, polls). Button presses are never capped. */
export function perMinute(): number {
  const n = Number(process.env.STAGEDIRECTOR_GITHUB_PER_MINUTE);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

const gg = globalThis as unknown as { __sdGateway?: Gateway };
/** The one gateway (survives dev hot reloads). See gateway.ts. */
export const gateway: Gateway = (gg.__sdGateway ??= new Gateway({ perMinute: perMinute(), burst: Math.max(40, perMinute() * 4) }));
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
      authStrategy: createAppAuth,
      auth: {
        appId: e.GITHUB_APP_ID,
        privateKey: e.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
        installationId: Number(e.GITHUB_APP_INSTALLATION_ID),
      },
    }));
  } else if (e.STAGEDIRECTOR_GITHUB_TOKEN || e.GITHUB_TOKEN) {
    cached = throughGateway(new Octokit({ log, auth: e.STAGEDIRECTOR_GITHUB_TOKEN || e.GITHUB_TOKEN, baseUrl }));
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
