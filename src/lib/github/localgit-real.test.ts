import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

describe("localGit against a real repository", () => {
  it("reads head, ahead/behind, commits and pin refs with no API", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sd-git-"));
    const origin = path.join(root, "acme", "site.git");
    execFileSync("git", ["init", "-q", "--bare", origin]);
    const work = path.join(root, "work");
    execFileSync("git", ["clone", "-q", origin, work]);
    sh(work, "config", "user.email", "t@example.com");
    sh(work, "config", "user.name", "t");
    sh(work, "checkout", "-q", "-b", "main");
    sh(work, "commit", "-q", "--allow-empty", "-m", "first");
    const a = sh(work, "rev-parse", "HEAD");
    sh(work, "commit", "-q", "--allow-empty", "-m", "Merge pull request #7 from acme/x\n\nNew login page");
    sh(work, "commit", "-q", "--allow-empty", "-m", "Fix footer");
    const c = sh(work, "rev-parse", "HEAD");
    sh(work, "push", "-q", "origin", "main", `${a}:refs/stagedirector/pins/live`);

    process.env.STAGEDIRECTOR_LOCAL_GIT = "on";
    process.env.STAGEDIRECTOR_MIRRORS = path.join(root, "mirrors");
    process.env.STAGEDIRECTOR_GIT_REMOTE = `${root}/{repo}.git`;
    const { localGit } = await import("./localgit");
    const gh = { auth: async () => ({}) } as never;
    const lg = await localGit(gh, "acme/site");
    expect(lg).not.toBeNull();
    expect(await lg!.head("main")).toBe(c);
    expect(await lg!.aheadBehind(a, c)).toEqual({ ahead: 2, behind: 0 });
    expect((await lg!.commits(a, c, 50))!.map((x) => x.message.split("\n")[0])).toEqual(["Merge pull request #7 from acme/x", "Fix footer"]);
    expect(await lg!.hasRef("refs/stagedirector/pins/live")).toBe(true);
    expect(await lg!.hasRef("refs/stagedirector/pins/staging")).toBe(false);
    delete process.env.STAGEDIRECTOR_LOCAL_GIT;
  });
});
