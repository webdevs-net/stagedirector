import "server-only";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";

/**
 * Server-side Octokit for the dashboard's own GitHub identity.
 * Prefers a GitHub App (GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID),
 * falls back to GITHUB_TOKEN. Returns null when neither is set, so callers can
 * fall back to sample data.
 */
let cached: Octokit | null | undefined;

export function githubConfigured(): boolean {
  const e = process.env;
  return Boolean((e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY && e.GITHUB_APP_INSTALLATION_ID) || e.GITHUB_TOKEN);
}

export function getOctokit(): Octokit | null {
  if (cached !== undefined) return cached;
  const e = process.env;
  if (e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY && e.GITHUB_APP_INSTALLATION_ID) {
    cached = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: e.GITHUB_APP_ID,
        privateKey: e.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
        installationId: Number(e.GITHUB_APP_INSTALLATION_ID),
      },
    });
  } else if (e.GITHUB_TOKEN) {
    cached = new Octokit({ auth: e.GITHUB_TOKEN });
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
