import { describe, expect, it } from "vitest";
import { MemoryStore } from "./store";
import { parseRunTitle, runState } from "./repo";

const A = "a".repeat(40);

describe("MemoryStore", () => {
  it("keeps the latest approval until a push uses it", async () => {
    const s = new MemoryStore();
    await s.append("o/r", { at: "1", actor: "ryan", action: "approve", stageId: "live", commit: A }, { commit: A, stageId: "live", by: "ryan", at: "1" });
    expect((await s.latestApproval("o/r", "live"))?.commit).toBe(A);
    await s.append("o/r", { at: "2", actor: "ryan", action: "push", stageId: "live", commit: A, result: "queued" });
    expect(await s.latestApproval("o/r", "live")).toBeNull();
  });
  it("a request is never an approval", async () => {
    const s = new MemoryStore();
    await s.append("o/r", { at: "1", actor: "claude:ryan", action: "request", stageId: "live", commit: A });
    expect(await s.latestApproval("o/r", "live")).toBeNull();
  });
  it("tracks pins", async () => {
    const s = new MemoryStore();
    await s.append("o/r", { at: "1", actor: "d", action: "pin", stageId: "staging" });
    expect(await s.pinned("o/r", "staging")).toBe(true);
    await s.append("o/r", { at: "2", actor: "d", action: "unpin", stageId: "staging" });
    expect(await s.pinned("o/r", "staging")).toBe(false);
    expect((await s.list("o/r")).map((e) => e.action)).toEqual(["unpin", "pin"]);
  });
});

describe("runs", () => {
  it("parses run titles", () => {
    expect(parseRunTitle(`stagedirector deploy live ${A} by ryan`)).toEqual({ action: "deploy", stageId: "live", commit: A, by: "ryan" });
    expect(parseRunTitle("something else")).toBeNull();
  });
  it("maps run states", () => {
    expect(runState("queued", null)).toBe("queued");
    expect(runState("in_progress", null)).toBe("running");
    expect(runState("completed", "success")).toBe("passed");
    expect(runState("completed", "cancelled")).toBe("stopped");
    expect(runState("completed", "failure")).toBe("failed");
  });
});
