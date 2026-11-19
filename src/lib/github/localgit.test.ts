import { describe, expect, it } from "vitest";
import { prFromMessage } from "./localgit";

describe("prFromMessage", () => {
  it("reads GitHub merge commits", () => {
    expect(prFromMessage("Merge pull request #22 from netdevs-net/claude/fast-pages\n\nFast pages: cached reads\n\nMore text")).toEqual({
      pr: 22, title: "Fast pages: cached reads", body: "More text",
    });
  });
  it("reads squash merges", () => {
    expect(prFromMessage("Fuller tests (fake GitHub) (#15)\n\nDetails")).toEqual({ pr: 15, title: "Fuller tests (fake GitHub)", body: "Details" });
  });
  it("returns null for a direct commit", () => {
    expect(prFromMessage("Fix footer link")).toBeNull();
  });
});
