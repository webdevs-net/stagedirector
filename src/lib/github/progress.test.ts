import { describe, expect, it } from "vitest";
import { mapProgress, plainStepOf } from "./progress";

describe("run progress mapping", () => {
  it("maps workflow steps to plain steps", () => {
    expect(plainStepOf("Check rules", "Apply rules")).toBe(0);
    expect(plainStepOf("deploy staging", "Check out abc")).toBe(0);
    expect(plainStepOf("deploy staging", "Run deploy")).toBe(2);
    expect(plainStepOf("deploy staging", "Clean up")).toBe(3);
  });

  it("follows the step in progress", () => {
    const p = mapProgress([
      { name: "Check rules", status: "completed", conclusion: "success", steps: [{ name: "Apply rules", status: "completed", conclusion: "success" }] },
      {
        name: "deploy staging",
        status: "in_progress",
        conclusion: null,
        steps: [
          { name: "Check out", status: "completed", conclusion: "success" },
          { name: "Run deploy", status: "in_progress", conclusion: null },
          { name: "Clean up", status: "queued", conclusion: null },
        ],
      },
    ]);
    expect(p.step).toBe(2);
    expect(p.progress).toBe(50);
  });

  it("does not jump to 100% while only the gate is listed", () => {
    const p = mapProgress([{ name: "Check rules", status: "completed", conclusion: "success", steps: [{ name: "Apply rules", status: "completed", conclusion: "success" }] }]);
    expect(p.progress).toBeLessThan(20);
  });

  it("handles a run with no jobs yet", () => {
    expect(mapProgress([]).step).toBe(0);
  });

  it("does not jump ahead while the deploy job waits for a runner", () => {
    const gate = { name: "Check rules", status: "completed", conclusion: "success", steps: ["Set up job", "Check out", "Apply rules", "Post Check out", "Complete job"].map((name) => ({ name, status: "completed", conclusion: "success" })) };
    const p = mapProgress([gate, { name: "deploy staging", status: "queued", conclusion: null, steps: [] }]);
    expect(p.progress).toBeLessThan(40);
  });
});
