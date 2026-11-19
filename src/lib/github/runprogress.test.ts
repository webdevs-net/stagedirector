import { describe, expect, it } from "vitest";
import { latestPerRun } from "./runprogress";

const line = (o: object) => JSON.stringify({ repo: "a/b", stage: "staging", commit: "c", action: "deploy", by: "ryan", url: "u", ...o });

describe("runner progress file", () => {
  it("keeps the newest line per run, with its start time", () => {
    const now = Date.parse("2026-11-19T12:00:00Z");
    const text = [
      line({ run: 1, state: "running", step: 0, at: "2026-11-19T11:58:00Z" }),
      line({ run: 1, state: "running", step: 2, at: "2026-11-19T11:59:00Z" }),
      "{half a li",
      line({ run: 0, state: "passed", step: 3, at: "2026-11-18T08:00:00Z" }), // too old
    ].join("\n");
    const out = latestPerRun(text, now);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ run: 1, step: 2, state: "running", startedAt: "2026-11-19T11:58:00Z" });
  });
});
