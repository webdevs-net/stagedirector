import { describe, expect, it } from "vitest";
import { commitLabel, wording } from "./wording";
import { versionsByCommit } from "./github/repo";

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
