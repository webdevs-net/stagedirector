import { describe, expect, it } from "vitest";
import { checksFor, runChecks, summarizeResults } from "./checks";
import type { ProjectConfig } from "./types";

const fake = (pages: Record<string, [number, string]>) => async (url: string) => {
  const [status, body] = pages[new URL(url).pathname] ?? [404, ""];
  return { status, text: async () => body };
};

describe("checks", () => {
  it("passes good pages and flags errors, missing text and PHP warnings", async () => {
    const r = await runChecks("https://s.example/", [
      { name: "Pages load", pages: ["/", "/contact/"] },
      { name: "Login", pages: ["/login/"], expect: "Lost your password" },
      { name: "No PHP errors", pages: ["/"], forbid: ["Fatal error"] },
    ], false, fake({ "/": [200, "<h1>Hi</h1> Fatal error: x"], "/contact/": [500, ""], "/login/": [200, "Log in"] }));
    expect(r.map((x) => x.ok)).toEqual([false, false, false]);
    expect(r[0].detail).toContain("/contact/ answered 500");
    expect(r[1].detail).toContain('does not show "Lost your password"');
    expect(r[2].detail).toContain('shows "Fatal error"');
    expect(summarizeResults("Staging", r, "before")).toMatch(/^Before approving: 0 of 3/);
  });

  it("treats 401 as a note on staging but a failure on live", async () => {
    const f = fake({ "/": [401, ""] });
    expect((await runChecks("https://s.example/", [{ name: "x", pages: ["/"] }], false, f))[0].ok).toBe(true);
    expect((await runChecks("https://s.example/", [{ name: "x", pages: ["/"] }], true, f))[0].ok).toBe(false);
  });

  it("falls back to smoke-test pages when no checks are configured", () => {
    const config: ProjectConfig = { version: 1, name: "t", branch: "main", stages: [{ id: "staging", name: "S", url: "https://s.example/", pushers: "developers", trigger: "auto", smokeTest: ["/"] }] };
    expect(checksFor(config, "staging")[0].pages).toEqual(["/"]);
    expect(checksFor({ ...config, checks: [{ name: "only live", pages: ["/"], stages: ["live"] }] }, "staging")[0].name).toBe("Pages load without errors");
  });
});
