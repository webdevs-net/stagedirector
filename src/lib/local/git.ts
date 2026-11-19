// Local mode: when the dashboard runs on the programmer's own machine, read the
// project's local checkout so uncommitted files and unpushed commits show at
// once (GitHub cannot know about them). Read-only: this never commits or pushes.
import "server-only";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { headers } from "next/headers";
import { parseLocalPaths, parsePorcelain, parseLog, type LocalWork } from "./parse";

export type { LocalWork } from "./parse";

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile("git", ["-C", cwd, ...args], { timeout: 4000, maxBuffer: 1 << 20 }, (err, stdout) => (err ? reject(err) : resolve(stdout))),
  );
}

/** Repo → checkout path, from STAGEDIRECTOR_LOCAL_PATHS and/or stagedirector.local.json (both git-ignored, per machine). */
export function localPaths(): Record<string, string> {
  const fromEnv = parseLocalPaths(process.env.STAGEDIRECTOR_LOCAL_PATHS ?? "");
  const file = path.join(process.cwd(), "stagedirector.local.json");
  let fromFile: Record<string, string> = {};
  if (existsSync(file)) {
    try {
      const j = JSON.parse(readFileSync(file, "utf8")) as { paths?: Record<string, string> };
      fromFile = j.paths ?? {};
    } catch {
      /* ignore a broken file */
    }
  }
  return { ...fromFile, ...fromEnv };
}

/** Only for a dashboard opened at localhost; never on the shared server. */
export async function onLocalhost(): Promise<boolean> {
  const host = (await headers()).get("host") ?? "";
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}

export async function readLocalWork(repo: string, mainBranch: string): Promise<LocalWork | null> {
  if (!(await onLocalhost())) return null;
  const dir = localPaths()[repo];
  if (!dir || !existsSync(path.join(dir, ".git"))) return null;
  try {
    const [branch, head, status] = await Promise.all([
      git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).then((s) => s.trim()),
      git(dir, ["rev-parse", "HEAD"]).then((s) => s.trim()),
      git(dir, ["status", "--porcelain=v1", "--untracked-files=normal"]),
    ]);
    const upstream = await git(dir, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).then((s) => s.trim()).catch(() => null);
    // Without an upstream, compare with the project's main branch on origin.
    const base = upstream ?? `origin/${mainBranch}`;
    const fmt = ["log", "--format=%H%x1f%s%x1f%cI", `${base}..HEAD`, "-n", "50"];
    const unpushed = parseLog(await git(dir, fmt).catch(() => ""));
    const behind = Number(await git(dir, ["rev-list", "--count", `HEAD..${base}`]).catch(() => "0")) || 0;
    return {
      path: dir,
      branch,
      head,
      upstream,
      files: parsePorcelain(status),
      unpushed,
      behind,
      pushCommand: upstream ? "git push" : `git push -u origin ${branch}`,
    };
  } catch {
    return null;
  }
}
