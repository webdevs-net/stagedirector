import { describe, expect, it } from "vitest";
import { promptFor, summarize, SUMMARY_MODEL } from "./summary";

const pr = { repo: "x/y", number: 7, title: "New login page", body: "Card layout.\n<!-- hidden -->", files: ["style.css", "login.php"], sha: "a".repeat(40) };

describe("plain summaries", () => {
  it("falls back to the PR title without an API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await summarize(pr)).toBe("New login page");
  });

  it("gives Claude the title, description and files as data", () => {
    const p = promptFor(pr);
    expect(p).toContain("<title>New login page</title>");
    expect(p).toContain("login.php");
    expect(p).toContain('count="2"');
  });

  it("uses Sonnet 5.5 or newer by default", () => {
    expect(SUMMARY_MODEL).toBe("claude-sonnet-5-5");
  });
});
