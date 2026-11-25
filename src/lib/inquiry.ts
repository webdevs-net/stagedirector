// Internal inquiry: ask each stage how it is doing from the dashboard.
// Only probes URLs listed in the project's own stagedirector.yml (never visitor-supplied hosts).
import "server-only";
import { existsSync } from "node:fs";
import type { ProjectConfig, StageConfig } from "./types";
import { localPaths, onLocalhost } from "./local/git";

const TIMEOUT_MS = 8_000;

export type StageInquiry = {
  stageId: string;
  name: string;
  url: string | null;
  runner: string | null;
  localPath: string | null;
  localPathExists: boolean;
  reachable: boolean | null; // null = no URL to probe
  status: number | null;
  ms: number | null;
  detail: string;
};

export type Fetcher = (url: string, init: RequestInit) => Promise<{ status: number }>;

async function probe(url: string, fetcher: Fetcher): Promise<{ status: number | null; ms: number; detail: string; reachable: boolean }> {
  const started = Date.now();
  try {
    const res = await fetcher(url, {
      method: "GET",
      headers: { "user-agent": "StageDirector/1 (inquiry)", accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    const ok = res.status >= 200 && res.status < 500; // 401/403 still means the stage answered
    return {
      status: res.status,
      ms,
      reachable: ok,
      detail: ok ? `answered ${res.status} in ${ms} ms` : `answered ${res.status}`,
    };
  } catch (e) {
    const ms = Date.now() - started;
    const slow = (e as Error).name === "TimeoutError";
    return { status: null, ms, reachable: false, detail: slow ? `no answer in ${TIMEOUT_MS / 1000}s` : "no answer" };
  }
}

/** One inquiry pass over every stage in the project config. */
export async function inquireStages(
  repo: string,
  config: ProjectConfig,
  fetcher: Fetcher = fetch,
): Promise<StageInquiry[]> {
  const paths = localPaths();
  const localDir = paths[repo] ?? null;
  const showLocal = await onLocalhost();
  const out: StageInquiry[] = [];

  for (const stage of config.stages) {
    out.push(await inquireOne(stage, { localDir: showLocal ? localDir : null, fetcher }));
  }
  return out;
}

async function inquireOne(
  stage: StageConfig,
  opts: { localDir: string | null; fetcher: Fetcher },
): Promise<StageInquiry> {
  const localPath = stage.id === "local" || stage.pushers === "none" ? opts.localDir : null;
  const localPathExists = !!localPath && existsSync(localPath);

  if (!stage.url) {
    return {
      stageId: stage.id,
      name: stage.name,
      url: null,
      runner: stage.runner ?? null,
      localPath,
      localPathExists,
      reachable: null,
      status: null,
      ms: null,
      detail: localPath
        ? localPathExists
          ? "local checkout mapped"
          : "local path set but missing on disk"
        : "no URL configured",
    };
  }

  const hit = await probe(stage.url, opts.fetcher);
  return {
    stageId: stage.id,
    name: stage.name,
    url: stage.url,
    runner: stage.runner ?? null,
    localPath,
    localPathExists,
    reachable: hit.reachable,
    status: hit.status,
    ms: hit.ms,
    detail: hit.detail,
  };
}
