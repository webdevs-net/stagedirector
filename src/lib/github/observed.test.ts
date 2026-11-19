import { describe, expect, it } from "vitest";
import { observedEnvironment, pickRunning, type Observed } from "./repo";

const seen = (commit: string, at: string): Observed => ({ commit, at, by: "ryan", source: "terminal" });

describe("outside deploys", () => {
  it("uses an environment name the live gate never reads", () => {
    expect(observedEnvironment("live")).toBe("observed-live");
    expect(observedEnvironment("live")).not.toBe("live");
  });

  it("shows a newer outside deploy of a different commit", () => {
    expect(pickRunning({ commit: "a", at: "2026-11-18T10:00:00Z" }, seen("b", "2026-11-19T10:00:00Z"))?.commit).toBe("b");
  });

  it("shows an outside deploy when Stage Director never deployed", () => {
    expect(pickRunning(null, seen("b", "2026-11-19T10:00:00Z"))?.commit).toBe("b");
  });

  it("ignores older or matching records", () => {
    expect(pickRunning({ commit: "a", at: "2026-11-19T10:00:00Z" }, seen("b", "2026-11-18T10:00:00Z"))).toBeNull();
    expect(pickRunning({ commit: "a", at: "2026-11-18T10:00:00Z" }, seen("a", "2026-11-19T10:00:00Z"))).toBeNull();
    expect(pickRunning({ commit: "a", at: "2026-11-18T10:00:00Z" }, null)).toBeNull();
  });
});
