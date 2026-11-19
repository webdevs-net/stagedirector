import { describe, expect, it } from "vitest";
import { sampleProjects } from "./sample";
import { runIdOf, toActiveRun } from "./runs";

const config = sampleProjects[0].config;
const base = { id: 42, action: "deploy", stageId: "staging", commit: "a".repeat(40), by: "ryan", url: "https://github.com/x/y/actions/runs/42", startedAt: new Date().toISOString() };

describe("GitHub runs as run-window runs", () => {
  it("maps a running deploy with its steps", () => {
    const r = toActiveRun({ ...base, state: "running" }, config, "x/y", [
      { name: "Check rules", status: "in_progress", conclusion: null, steps: [{ name: "Apply rules", status: "in_progress", conclusion: null }] },
    ], null)!;
    expect(r.id).toBe("gh-42");
    expect(r.kind).toBe("update");
    expect(r.state).toBe("running");
    expect(r.step).toBe(0);
    expect(runIdOf(r.id)).toBe(42);
  });

  it("marks the last stage as put-live and cancelled runs as stopped", () => {
    const r = toActiveRun({ ...base, stageId: "live", state: "stopped" }, config, "x/y", null, Date.now())!;
    expect(r.kind).toBe("put-live");
    expect(r.state).toBe("stopped");
    expect(r.progress).toBe(100);
  });

  it("skips pin runs", () => {
    expect(toActiveRun({ ...base, action: "pin", state: "running" }, config, "x/y", null, null)).toBeNull();
  });
});
