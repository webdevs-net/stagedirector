import { describe, expect, it } from "vitest";
import { parseLocalPaths, parseLog, parsePorcelain } from "./parse";

describe("local git parsing", () => {
  it("reads repo=path pairs", () => {
    expect(parseLocalPaths("netdevs-net/mariasplace=/Users/me/Sites/MariasPlace, a/b = /x y")).toEqual({
      "netdevs-net/mariasplace": "/Users/me/Sites/MariasPlace",
      "a/b": "/x y",
    });
    expect(parseLocalPaths("junk")).toEqual({});
  });

  it("classifies porcelain lines", () => {
    const out = parsePorcelain(" M wp-content/a.php\n?? new.txt\nD  gone.css\nR  old.js -> new.js\nUU both.php\nA  added.md\n");
    expect(out).toEqual([
      { path: "wp-content/a.php", state: "changed" },
      { path: "new.txt", state: "new" },
      { path: "gone.css", state: "deleted" },
      { path: "new.js", state: "renamed" },
      { path: "both.php", state: "conflict" },
      { path: "added.md", state: "added" },
    ]);
  });

  it("splits log records", () => {
    expect(parseLog("abc\x1fFix menu\x1f2026-11-19T10:00:00Z\n")).toEqual([{ sha: "abc", subject: "Fix menu", at: "2026-11-19T10:00:00Z" }]);
  });
});
