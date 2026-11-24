import { describe, expect, it } from "vitest";
import { commitLabel, wording } from "./wording";
import { releaseCandidates, sortVersionsDesc, versionsByCommit } from "./github/repo";

describe("wording", () => {
  it("keeps website words by default", () => {
    const w = wording({});
    expect(w.isApp).toBe(false);
    expect(w.putLive).toBe("Put on live");
    expect(w.openMiddle("Staging")).toBe("Open staging");
    expect(w.siteTools).toBe(true);
  });

  it("uses release words for type: app", () => {
    const w = wording({ type: "app" });
    expect(w.putLive).toBe("Release to users");
    expect(w.openMiddle("Beta")).toBe("Download the beta");
    expect(w.lastUpdated).toBe("Released");
    expect(w.siteTools).toBe(false);
  });
});

describe("commitLabel", () => {
  it("puts the version next to the short commit", () => {
    expect(commitLabel("41ab2c9d0e", "v1.4.0")).toBe("v1.4.0 · 41ab2c9");
    expect(commitLabel("41ab2c9d0e", null)).toBe("41ab2c9");
    expect(commitLabel(null, "v1.4.0")).toBeNull();
  });
});

describe("versionsByCommit", () => {
  it("picks the highest v* tag per commit and skips other tags", () => {
    const m = versionsByCommit([
      { name: "v1.4.0-beta.1", sha: "a" },
      { name: "v1.4.0", sha: "a" },
      { name: "mobile-v1.1.0", sha: "b" },
      { name: "v1.10.0", sha: "c" },
      { name: "v1.9.9", sha: "c" },
    ]);
    expect(m.get("a")).toBe("v1.4.0");
    expect(m.has("b")).toBe(false);
    expect(m.get("c")).toBe("v1.10.0");
  });
});

describe("releaseCandidates", () => {
  const fakeGh = (tags: { name: string; sha: string }[], onBranch: Set<string>) =>
    ({
      paginate: {
        iterator: async function* () {
          for (let i = 0; i < tags.length; i += 100) yield { data: tags.slice(i, i + 100).map((t) => ({ name: t.name, commit: { sha: t.sha } })) };
        },
      },
      rest: {
        repos: {
          listTags: () => undefined,
          compareCommitsWithBasehead: async ({ basehead }: { basehead: string }) => ({ data: { status: onBranch.has(basehead.split("...")[0]) ? "ahead" : "diverged" } }),
        },
      },
    }) as unknown as import("@octokit/rest").Octokit;

  it("lists the newest release tags on the branch, newest first, reading every page", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ name: `old-${i}`, sha: `o${i}` }));
    const gh = fakeGh(
      [...many, { name: "v1.3.2", sha: "a" }, { name: "v1.4.0", sha: "b" }, { name: "v1.5.0-dev", sha: "c" }, { name: "v1.4.1", sha: "d" }, { name: "mobile-v2.0.0", sha: "e" }],
      new Set(["a", "b", "c"]),
    );
    const got = await releaseCandidates(gh, "o/candidates", "main");
    expect(got).toEqual([{ tag: "v1.4.0", commit: "b" }, { tag: "v1.3.2", commit: "a" }]);
  });

  it("sorts versions the way people read them", () => {
    expect(sortVersionsDesc([{ name: "v1.9.9" }, { name: "v1.10.0" }, { name: "v1.10.0-beta.1" }]).map((t) => t.name)).toEqual(["v1.10.0", "v1.10.0-beta.1", "v1.9.9"]);
  });
});
