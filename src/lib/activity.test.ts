import { describe, expect, it } from "vitest";
import { applyFilter, csvCell, filterFromParams, toCsv, type ActivityRow } from "./activity";

const rows: ActivityRow[] = [
  { id: "1", at: "2026-11-18T10:00:00Z", actor: "ryan", action: "push", stageId: "live", result: "passed", repo: "a/b", project: "AB", note: "New login" },
  { id: "2", at: "2026-11-17T10:00:00Z", actor: "claude:ryan", action: "request", stageId: "staging", repo: "a/b", project: "AB" },
  { id: "3", at: "2026-11-10T10:00:00Z", actor: "auto", action: "push", stageId: "staging", result: "failed", repo: "c/d", project: "CD", note: '=HYPERLINK("x")' },
];

describe("activity record", () => {
  it("filters by project, stage, action, person, result, dates and text", () => {
    expect(applyFilter(rows, { repo: "a/b" }).map((r) => r.id)).toEqual(["1", "2"]);
    expect(applyFilter(rows, { actor: "claude" }).map((r) => r.id)).toEqual(["2"]);
    expect(applyFilter(rows, { actor: "ryan" }).map((r) => r.id)).toEqual(["1", "2"]);
    expect(applyFilter(rows, { from: "2026-11-17", to: "2026-11-17" }).map((r) => r.id)).toEqual(["2"]);
    expect(applyFilter(rows, { action: "push", result: "failed" }).map((r) => r.id)).toEqual(["3"]);
    expect(applyFilter(rows, { q: "login" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterFromParams({ stage: "live", actor: "" })).toEqual(expect.objectContaining({ stage: "live", actor: undefined }));
  });

  it("writes safe CSV", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=1+1")).toBe("'=1+1");
    const csv = toCsv(rows);
    expect(csv.split("\r\n")[0]).toBe("time,project,repo,stage,action,actor,result,commit,run_id,note");
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
