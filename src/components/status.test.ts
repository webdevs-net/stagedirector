import { describe, expect, it } from "vitest";
import type { ProjectView } from "@/lib/data";
import { barColors, healthOf, HEALTH_LABEL } from "./status";

const LIT = "#14a39d";
const GREY = "#c8d3df";

function project(over: { staging?: string | null; live?: string | null; lastKnown?: ProjectView["lastKnown"] }): ProjectView {
  const stage = (stageId: string, commit: string | null) => ({ stageId, commit, deployedAt: null, deployedBy: null, behindBy: 0, outOfSync: [], pinned: false, running: null });
  return {
    repo: "o/r",
    config: {
      version: 1, name: "R", branch: "main",
      stages: [
        { id: "local", name: "Local", pushers: "none", trigger: "manual" },
        { id: "staging", name: "Staging", pushers: "developers", trigger: "auto", deploy: "d" },
        { id: "live", name: "Live site", pushers: "code-owners", trigger: "manual", deploy: "d" },
      ],
    },
    stages: [stage("local", null), stage("staging", over.staging ?? null), stage("live", over.live ?? null)],
    waiting: [],
    lastKnown: over.lastKnown,
    needsMe: false,
    busy: null,
    extras: { stagingReady: false, outOfSyncNote: null, failedCheck: false, requests: [] },
  } as unknown as ProjectView;
}

describe("project list bars and label", () => {
  it("never lights a stage with no deploy or check on record, and never says 'Up to date' for an unchecked live", () => {
    const p = project({ staging: "a".repeat(40), live: null, lastKnown: null });
    expect(barColors(p)).toEqual([LIT, LIT, GREY]);
    expect(healthOf(p)).toBe("unknown");
    expect(HEALTH_LABEL.unknown.text(p)).toBe("Live site not checked");
  });

  it("stops at the first stage never deployed (staging empty: only local lit)", () => {
    expect(barColors(project({ staging: null, live: null, lastKnown: null }))).toEqual([LIT, GREY, GREY]);
  });

  it("lights every stage and says 'Up to date' only when live's commit is known and matches", () => {
    const c = "b".repeat(40);
    const p = project({ staging: c, live: c, lastKnown: { commit: c, source: "deploy" } });
    expect(barColors(p)).toEqual([LIT, LIT, LIT]);
    expect(healthOf(p)).toBe("ok");
  });
});
