// The run window's server side (src/lib/data.ts) in GitHub mode: start, poll, stop.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FakeGitHub, seedTestRepo } from "./testing/fake-github";

vi.mock("@/lib/auth/auth", () => ({ currentLogin: async () => "owner", currentGithubToken: async () => null, authConfigured: false }));

const REPO = "acme/site";
let fake: FakeGitHub;

beforeAll(async () => {
  fake = new FakeGitHub();
  seedTestRepo(fake, REPO);
  process.env.GITHUB_API_URL = await fake.start();
  process.env.GITHUB_TOKEN = "fake-token";
  process.env.STAGEDIRECTOR_REPOS = REPO;
  (await import("./client")).resetGithubClient();
});
afterAll(async () => {
  await fake.stop();
  for (const k of ["GITHUB_API_URL", "GITHUB_TOKEN", "STAGEDIRECTOR_REPOS"]) delete process.env[k];
});

describe("run window in GitHub mode", () => {
  it("Update staging starts a run, shows it, and Stop cancels it", async () => {
    const data = await import("@/lib/data");
    const runs = await import("./runs");
    const started = await data.startRun(REPO, "staging", "update");
    expect("error" in started ? started.error : null).toBeNull();
    let list = await data.getActiveRuns();
    expect(list).toHaveLength(1); // the "starting" placeholder
    const run = fake.latestRun(REPO)!;
    fake.step(REPO, run.id);
    runs.forgetRuns(REPO);
    list = await data.getActiveRuns();
    expect(list.map((r) => r.id)).toEqual([`gh-${run.id}`]); // placeholder replaced by the real run
    expect(await data.stopRun(`gh-${run.id}`)).toBeNull();
    expect(fake.run(REPO, run.id).conclusion).toBe("cancelled");
    expect((await data.getActiveRuns()).find((r) => r.id === `gh-${run.id}`)?.state).toBe("stopped");
  });
});
