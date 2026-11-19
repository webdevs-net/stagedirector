import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { startRun } from "./repo";
import { projectConfigSchema } from "../config/schema";

function fakeGh() {
  const calls: unknown[] = [];
  const gh = { rest: { actions: { createWorkflowDispatch: async (a: unknown) => { calls.push(a); } } } };
  return { gh: gh as never, calls };
}

describe("gate runner setting", () => {
  it("sends gate_runner only when the project sets it", async () => {
    const a = fakeGh();
    await startRun(a.gh, "acme/site", "main", { stage: "staging", commit: "a".repeat(40), action: "deploy", requestedBy: "owner" });
    expect((a.calls[0] as { inputs: Record<string, string> }).inputs).not.toHaveProperty("gate_runner");

    const b = fakeGh();
    await startRun(b.gh, "acme/site", "main", { stage: "staging", commit: "a".repeat(40), action: "deploy", requestedBy: "owner", gateRunner: "self-hosted" });
    expect((b.calls[0] as { inputs: Record<string, string> }).inputs.gate_runner).toBe("self-hosted");
  });

  it("accepts github or self-hosted only", () => {
    const base = { version: 1, name: "X", branch: "main", stages: [{ id: "staging", name: "Staging", pushers: "developers", trigger: "manual", deploy: "x" }] };
    expect(projectConfigSchema.safeParse({ ...base, gateRunner: "self-hosted" }).success).toBe(true);
    expect(projectConfigSchema.safeParse({ ...base, gateRunner: "meru-live" }).success).toBe(false);
  });
});
