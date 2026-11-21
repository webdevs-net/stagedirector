import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { getOctokit, splitRepo } from "./client";

// Review screenshots. The deploy workflow saves them as the run artifact
// "stagedirector-screens-<stage>" (engine/workflow/stagedirector.yml, "Take screenshots").
// The dashboard downloads the newest one once, unzips it into its cache folder and serves the
// pictures from there, so looking at the review page again costs no GitHub calls.

const run = promisify(execFile);

export interface Shot {
  stage: string;
  path: string;
  size: "desktop" | "phone";
  file: string | null;
  status: number;
  error?: string;
}

export interface ScreenSet {
  id: string; // artifact id
  stage: string;
  commit: string;
  takenAt: string;
  runUrl: string | null;
  shots: Shot[];
}

/** Only names the workflow writes: <stage>--<page>--<size>.jpg */
export const SHOT_FILE = /^[a-z0-9-]+--[A-Za-z0-9-]{1,60}--(desktop|phone)\.jpg$/;

function cacheRoot(): string {
  return process.env.STAGEDIRECTOR_SCREENS_DIR || path.join(process.cwd(), ".stagedirector-cache", "screens");
}

export function screensDir(repo: string, id: string): string {
  if (!/^\d+$/.test(id) || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("bad screenshot set");
  return path.join(cacheRoot(), repo.replace("/", "~"), id);
}

/** Pure: keep only well-formed shots from a manifest written by the workflow. */
export function parseManifest(raw: unknown): Pick<ScreenSet, "stage" | "commit" | "takenAt" | "shots"> | null {
  const m = raw as { version?: number; stage?: unknown; commit?: unknown; takenAt?: unknown; shots?: unknown };
  if (!m || m.version !== 1 || typeof m.stage !== "string" || !Array.isArray(m.shots)) return null;
  const shots: Shot[] = [];
  for (const s of m.shots as Record<string, unknown>[]) {
    if (typeof s?.stage !== "string" || typeof s.path !== "string" || (s.size !== "desktop" && s.size !== "phone")) continue;
    const file = typeof s.file === "string" && SHOT_FILE.test(s.file) ? s.file : null;
    shots.push({
      stage: s.stage,
      path: s.path,
      size: s.size,
      file,
      status: typeof s.status === "number" ? s.status : 0,
      ...(typeof s.error === "string" ? { error: s.error.slice(0, 200) } : {}),
    });
  }
  return {
    stage: m.stage,
    commit: typeof m.commit === "string" ? m.commit : "",
    takenAt: typeof m.takenAt === "string" ? m.takenAt : "",
    shots,
  };
}

/** Newest screenshots taken after a deploy to `stage`, or null when there are none (or no GitHub). */
export async function latestScreens(repo: string, stage: string): Promise<ScreenSet | null> {
  const gh = getOctokit();
  if (!gh || !/^[a-z0-9-]+$/.test(stage)) return null;
  const { data } = await gh.rest.actions.listArtifactsForRepo({ ...splitRepo(repo), name: `stagedirector-screens-${stage}`, per_page: 1 });
  const a = data.artifacts.find((x) => !x.expired);
  if (!a) return null;
  const id = String(a.id);
  const dir = screensDir(repo, id);
  const manifestFile = path.join(dir, "manifest.json");
  try {
    await fs.access(manifestFile);
  } catch {
    const res = await gh.rest.actions.downloadArtifact({ ...splitRepo(repo), artifact_id: a.id, archive_format: "zip" });
    await fs.mkdir(dir, { recursive: true });
    const zip = path.join(dir, "artifact.zip");
    await fs.writeFile(zip, Buffer.from(res.data as ArrayBuffer));
    // Extract only manifest.json and .jpg files; unzip refuses paths outside the folder.
    await run("unzip", ["-o", "-q", zip, "manifest.json", "*.jpg", "-d", dir]);
    await fs.rm(zip, { force: true });
  }
  const parsed = parseManifest(JSON.parse(await fs.readFile(manifestFile, "utf8")));
  if (!parsed) return null;
  const runId = a.workflow_run?.id;
  return { id, ...parsed, runUrl: runId ? `https://github.com/${repo}/actions/runs/${runId}` : null };
}

/** Bytes of one cached screenshot, or null. Names are checked; nothing outside the set's folder is read. */
export async function readShot(repo: string, id: string, file: string): Promise<Buffer | null> {
  if (!SHOT_FILE.test(file)) return null;
  try {
    return await fs.readFile(path.join(screensDir(repo, id), file));
  } catch {
    return null;
  }
}
