import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseManifest, readShot, SHOT_FILE, screensDir } from "./screens";

describe("review screenshots", () => {
  it("keeps only well-formed shots and file names", () => {
    const m = parseManifest({
      version: 1, stage: "staging", commit: "abc", takenAt: "2026-11-20T00:00:00Z",
      shots: [
        { stage: "staging", path: "/", size: "desktop", file: "staging--home--desktop.jpg", status: 200 },
        { stage: "live", path: "/x", size: "phone", file: "../../etc/passwd", status: 200 },
        { stage: "live", path: "/y", size: "huge", file: "live--y--huge.jpg", status: 200 },
      ],
    });
    expect(m?.shots).toHaveLength(2);
    expect(m?.shots[1].file).toBeNull();
    expect(parseManifest({ version: 2 })).toBeNull();
  });

  it("refuses odd names and paths", async () => {
    expect(SHOT_FILE.test("live--contact--phone.jpg")).toBe(true);
    expect(SHOT_FILE.test("live--../x--phone.jpg")).toBe(false);
    expect(() => screensDir("acme/site", "../1")).toThrow();
    expect(await readShot("acme/site", "1", "../manifest.json")).toBeNull();
  });
});
