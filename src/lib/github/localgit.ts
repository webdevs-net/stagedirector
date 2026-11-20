// Git facts from a local bare copy of each repo, kept current with `git fetch`.
// The git protocol does not use GitHub's REST hourly limit, so branch heads,
// "how far behind", commit lists and pin refs cost no API calls.
// Display only: permission checks and the live gate never read this copy.
//
// Where:  .stagedirector-cache/repos/<owner>/<repo>.git (STAGEDIRECTOR_MIRRORS to move it)
// Off:    STAGEDIRECTOR_LOCAL_GIT=off, or when GITHUB_API_URL points at a test server.
// Fetch:  at most once a minute per repo, and only when a page asks (no timers).
import "server-only";
import { execFile } from "node:child_process";
import { pool } from "./pool";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Octokit } from "@octokit/rest";
import { currentCaller } from "./gateway";

const FETCH_EVERY = 60_000;

function git(args: string[], opts: { cwd?: string; env?: Record<string, string>; timeout?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile("git", args, { cwd: opts.cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...opts.env }, timeout: opts.timeout ?? 10_000, maxBuffer: 8 << 20 }, (err, out) =>
      err ? reject(err) : resolve(out),
    ),
  );
}

export function localGitEnabled(): boolean {
  const e = process.env;
  if (e.STAGEDIRECTOR_LOCAL_GIT === "on") return true;
  return e.STAGEDIRECTOR_LOCAL_GIT !== "off" && !e.GITHUB_API_URL && !e.VITEST;
}

const g = globalThis as unknown as { __sdMirrors?: Map<string, { fetchedAt: number; pending?: Promise<void>; broken?: number }> };
const state = (g.__sdMirrors ??= new Map());

function dirFor(repo: string): string {
  const base = process.env.STAGEDIRECTOR_MIRRORS || path.join(process.cwd(), ".stagedirector-cache", "repos");
  return path.join(base, `${repo}.git`);
}

/** Token for git over HTTPS, passed in the environment (never on the command line). */
async function authEnv(gh: Octokit): Promise<Record<string, string>> {
  const a = (await gh.auth()) as { token?: string };
  if (!a.token) return {};
  const basic = Buffer.from(`x-access-token:${a.token}`).toString("base64");
  return { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` };
}

export interface LocalGit {
  head(branch: string): Promise<string | null>;
  /** Commits in `head` that are not in `base` (GitHub's ahead_by), and the other way round. */
  aheadBehind(base: string, head: string): Promise<{ ahead: number; behind: number } | null>;
  commits(from: string | null, to: string, max: number): Promise<{ sha: string; message: string }[] | null>;
  hasRef(ref: string): Promise<boolean>;
  /** A file on a branch, or null when it is not there. */
  readFile(branch: string, file: string): Promise<string | null>;
  /** GitHub's default branch, as recorded at fetch time. */
  defaultBranch(): Promise<string | null>;
}

/** A local copy fetched within the last minute, or null (then callers use the API). */
export async function localGit(gh: Octokit, repo: string): Promise<LocalGit | null> {
  if (!localGitEnabled() || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  if (currentCaller() === "action") return null; // button presses check against GitHub itself
  const dir = dirFor(repo);
  const s = state.get(repo) ?? { fetchedAt: 0 };
  state.set(repo, s);
  if (s.broken && Date.now() - s.broken < 10 * 60_000) return null; // failed recently: use the API for a while
  if (Date.now() - s.fetchedAt > FETCH_EVERY) {
    s.pending ??= (async () => {
      const env = await authEnv(gh);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        await git(["init", "--bare", "-q", dir]);
        await git(["remote", "add", "origin", (process.env.STAGEDIRECTOR_GIT_REMOTE ?? "https://github.com/{repo}.git").replace("{repo}", repo)], { cwd: dir });
      }
      await git(["fetch", "-q", "--prune", "origin", "+refs/heads/*:refs/heads/*", "+refs/stagedirector/*:refs/stagedirector/*"], { cwd: dir, env, timeout: 120_000 })
        .then(() => pool.noteGit("fetch", repo, true), (e) => { pool.noteGit("fetch", repo, false); throw e; });
      // Remember the remote's default branch (git protocol, no API).
      const sym = await git(["ls-remote", "--symref", "origin", "HEAD"], { cwd: dir, env })
        .then((o) => { pool.noteGit("ls-remote", repo, true); return o; }, () => { pool.noteGit("ls-remote", repo, false); return ""; });
      const m = /ref: refs\/heads\/(\S+)\s+HEAD/.exec(sym);
      if (m) await git(["symbolic-ref", "HEAD", `refs/heads/${m[1]}`], { cwd: dir });
      s.fetchedAt = Date.now();
      s.broken = undefined;
    })()
      .catch(() => {
        s.broken = Date.now();
      })
      .finally(() => {
        s.pending = undefined;
      });
    // First fetch: wait for it. Later: keep using the copy we have while it updates.
    if (!s.fetchedAt) await s.pending;
  }
  if (!s.fetchedAt) return null;
  const run = (args: string[]) => git(args, { cwd: dir });
  const has = (sha: string) => run(["cat-file", "-e", `${sha}^{commit}`]).then(() => true, () => false);
  return {
    head: (branch) => run(["rev-parse", "--verify", "-q", `refs/heads/${branch}`]).then((o) => o.trim() || null, () => null),
    aheadBehind: async (base, head) => {
      if (!(await has(base)) || !(await has(head))) return null;
      const [left, right] = (await run(["rev-list", "--left-right", "--count", `${base}...${head}`])).trim().split(/\s+/).map(Number);
      return { ahead: right, behind: left };
    },
    commits: async (from, to, max) => {
      if (!(await has(to)) || (from && !(await has(from)))) return null;
      const range = from ? [`${from}..${to}`] : [to];
      const out = await run(["log", "--format=%H%x1f%B%x1e", "-n", String(max), ...range]);
      return out
        .split("\x1e")
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => {
          const [sha, message] = r.split("\x1f");
          return { sha, message: (message ?? "").trim() };
        })
        .reverse(); // oldest first, like GitHub's compare
    },
    hasRef: (ref) => run(["rev-parse", "--verify", "-q", ref]).then(() => true, () => false),
    defaultBranch: () => run(["symbolic-ref", "--short", "HEAD"]).then((o) => o.trim() || null, () => null),
    readFile: (branch, file) => run(["show", `refs/heads/${branch}:${file}`]).then((t) => t, () => null),
  };
}

/** PR number and title from a merge or squash commit message, without asking GitHub. */
export function prFromMessage(message: string): { pr: number; title: string; body: string } | null {
  const [first, ...rest] = message.split("\n");
  const merge = /^Merge pull request #(\d+) from \S+/.exec(first);
  if (merge) {
    const body = rest.join("\n").trim();
    const [title, ...more] = body.split("\n");
    return { pr: Number(merge[1]), title: (title || first).trim(), body: more.join("\n").trim() };
  }
  const squash = /^(.*) \(#(\d+)\)$/.exec(first);
  if (squash) return { pr: Number(squash[2]), title: squash[1].trim(), body: rest.join("\n").trim() };
  return null;
}
