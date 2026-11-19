import "server-only";
import type { CheckConfig, CheckResult, ProjectConfig } from "./types";

// Runs a project's checks (stagedirector.yml `checks:`) against one stage, from
// the dashboard: each page must load, may need to contain a text, and must not
// contain forbidden text such as PHP errors. Outbound requests only.
//
// Password-protected staging: STAGEDIRECTOR_CHECK_AUTH="staging.example.com=user:pass,other.host=user:pass".

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 2_000_000;

export const DEFAULT_FORBID = ["Fatal error", "Parse error", "Warning: ", "Notice: ", "There has been a critical error"];

export function checksFor(config: ProjectConfig, stageId: string): CheckConfig[] {
  const stage = config.stages.find((s) => s.id === stageId);
  if (!stage?.url) return [];
  const own = (config.checks ?? []).filter((c) => !c.stages || c.stages.includes(stageId));
  if (own.length) return own;
  // No checks configured: fall back to the stage's smoke-test pages plus PHP-error detection.
  return stage.smokeTest?.length ? [{ name: "Pages load without errors", pages: stage.smokeTest, forbid: DEFAULT_FORBID }] : [];
}

function authFor(url: URL): string | null {
  for (const pair of (process.env.STAGEDIRECTOR_CHECK_AUTH ?? "").split(",")) {
    const i = pair.indexOf("=");
    if (i > 0 && pair.slice(0, i).trim() === url.host) return "Basic " + Buffer.from(pair.slice(i + 1).trim()).toString("base64");
  }
  return null;
}

export type Fetcher = (url: string, init: RequestInit) => Promise<{ status: number; text: () => Promise<string> }>;

/** Runs every check; never throws. `isLast` = the last stage, where a 401 counts as a failure. */
export async function runChecks(baseUrl: string, checks: CheckConfig[], isLast: boolean, fetcher: Fetcher = fetch): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const c of checks) {
    const problems: string[] = [];
    for (const path of c.pages) {
      const url = new URL(path, baseUrl);
      const auth = authFor(url);
      try {
        const res = await fetcher(url.toString(), {
          headers: { "user-agent": "StageDirector/1 (checks)", ...(auth ? { authorization: auth } : {}) },
          redirect: "follow",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 401 && !isLast) {
          problems.push(`${path} needs a password (set STAGEDIRECTOR_CHECK_AUTH to check inside)`);
          continue;
        }
        if (res.status < 200 || res.status > 299) {
          problems.push(`${path} answered ${res.status}`);
          continue;
        }
        const body = (await res.text()).slice(0, MAX_BYTES);
        if (c.expect && !body.includes(c.expect)) problems.push(`${path} does not show "${c.expect}"`);
        for (const f of c.forbid ?? []) if (body.includes(f)) problems.push(`${path} shows "${f.trim()}"`);
      } catch (e) {
        problems.push(`${path} did not load (${(e as Error).name === "TimeoutError" ? "too slow" : "no answer"})`);
      }
    }
    // A 401 on staging is not a failure, only a note.
    const failures = problems.filter((p) => !p.includes("needs a password"));
    results.push({ name: c.name, ok: failures.length === 0, detail: problems.length ? problems.join("; ") : `${c.pages.length} ${c.pages.length === 1 ? "page" : "pages"} fine` });
  }
  return results;
}

export function summarizeResults(stageName: string, results: CheckResult[], when: "before" | "after"): string {
  const passed = results.filter((r) => r.ok).length;
  const head = `${when === "before" ? "Before approving" : "After the update"}: ${passed} of ${results.length} checks passed on ${stageName.toLowerCase()}.`;
  const bad = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.detail}`);
  return [head, ...bad].join(" ");
}
