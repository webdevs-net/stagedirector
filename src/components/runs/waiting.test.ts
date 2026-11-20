import { describe, expect, it } from "vitest";
import { waitedMinutes, waitingText } from "./waiting";

describe("waiting for a runner text", () => {
  const t0 = 1_000_000;
  it("says how many whole minutes the run has waited", () => {
    expect(waitingText("ovh1", t0, t0 + 168 * 60_000 + 30_000)).toBe("Waiting for a runner 168 min — none is online for ovh1");
  });
  it("never says 0 min", () => {
    expect(waitedMinutes(t0, t0 + 10_000)).toBe(1);
  });
  it("leaves the minutes out when the start is unknown", () => {
    expect(waitingText("ovh1")).toBe("Waiting for a runner — none is online for ovh1");
  });
});
