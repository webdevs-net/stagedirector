import { describe, expect, it } from "vitest";
import { unresolvedFailures, verbOf } from "./runResult";
import { failureText } from "./github/repo";
import { wording } from "./wording";
import type { ActivityEvent } from "./types";

const ev = (over: Partial<ActivityEvent>): ActivityEvent => ({ id: "x", at: "2026-11-24T05:06:07Z", actor: "netdevs-net", action: "push", stageId: "beta", ...over });

describe("verbOf", () => {
  it("says a failed update failed, not 'updated'", () => {
    expect(verbOf(ev({ result: "failed" }))).toBe("update failed");
    expect(verbOf(ev({ result: "passed" }))).toBe("updated");
    expect(verbOf(ev({ result: "running" }))).toBe("updating");
    expect(verbOf(ev({ action: "undo", result: "failed" }))).toBe("undo failed");
    expect(verbOf(ev({ action: "approve" }))).toBe("approved");
  });
});

describe("unresolvedFailures", () => {
  it("warns when a stage's newest update failed and nothing passed since", () => {
    const events = [ev({ id: "new", result: "failed" }), ev({ id: "old", at: "2026-11-20T00:00:00Z", result: "passed" })];
    expect(unresolvedFailures(events, [{ stageId: "beta", deployedAt: "2026-11-20T00:00:00Z" }]).map((e) => e.id)).toEqual(["new"]);
    expect(unresolvedFailures(events, [{ stageId: "beta", deployedAt: "2026-11-24T06:00:00Z" }])).toEqual([]);
    expect(unresolvedFailures([ev({ result: "passed" })], [{ stageId: "beta", deployedAt: null }])).toEqual([]);
    expect(unresolvedFailures([ev({ action: "pin", result: "failed" })], [{ stageId: "beta", deployedAt: null }])).toEqual([]);
  });
});

describe("failureText", () => {
  it("turns GitHub's billing message into plain words", () => {
    expect(failureText("Check rules", "The job was not started because recent account payments have failed or your spending limit needs to be increased.", null)).toMatch(/billing is blocked.*Nothing changed/);
    expect(failureText("Check rules", "Stage Director refused: not a code owner", null)).toBe("Check rules: Stage Director refused: not a code owner");
    expect(failureText("deploy beta", null, "Run deploy")).toBe('deploy beta: the step "Run deploy" failed.');
    expect(failureText("x", null, null)).toBeNull();
  });
});

describe("review wording", () => {
  it("uses release words for apps", () => {
    expect(wording({ type: "app" }).reviewTitle).toBe("Before you release it to users");
    expect(wording({}).reviewTitle).toBe("Before you put it live");
  });
});
