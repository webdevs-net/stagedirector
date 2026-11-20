import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyRunners, waitingForRunner, STUCK_MS, type GhRunner } from "./runners";
import { FakeGitHub, seedTestRepo, sha } from "./testing/fake-github";

vi.mock("@/lib/auth/auth", () => ({ currentLogin: async () => null, currentGithubToken: async () => null, authConfigured: false }));

const R = (name: string, status: string, busy: boolean, ...labels: string[]): GhRunner => ({ name, status, busy, labels: labels.map((l) => ({ name: l })) });

describe("classifyRunners", () => {
  it("online when an idle runner has the label", () => {
    expect(classifyRunners([R("a", "online", false, "self-hosted", "ovh1")], ["ovh1"]).ovh1.state).toBe("online");
  });
  it("busy when every online runner with the label is busy", () => {
    expect(classifyRunners([R("a", "online", true, "ovh1"), R("b", "offline", false, "ovh1")], ["ovh1"]).ovh1.state).toBe("busy");
  });
  it("offline when all are offline, or none has the label", () => {
    const h = classifyRunners([R("mac-test", "offline", false, "mac")], ["mac", "ovh1"]);
    expect(h.mac.state).toBe("offline");
    expect(h.mac.names).toEqual(["mac-test"]);
    expect(h.ovh1.state).toBe("offline");
  });
  it("unknown when GitHub would not list runners", () => {
    expect(classifyRunners(null, ["ovh1"]).ovh1.state).toBe("unknown");
  });
  it("matches labels without caring about case", () => {
    expect(classifyRunners([R("a", "online", false, "OVH1")], ["ovh1"]).ovh1.state).toBe("online");
  });
});

describe("waitingForRunner (stuck queued runs)", () => {
  const t0 = 1_000_000;
  const later = t0 + STUCK_MS + 1;
  const queuedJob = { name: "Deploy", status: "queued", conclusion: null, steps: [] };
  it("not before ~3 minutes", () => {
    expect(waitingForRunner("queued", t0, null, t0 + 60_000)).toBe(false);
  });
  it("a queued run after 3 minutes", () => {
    expect(waitingForRunner("queued", t0, null, later)).toBe(true);
  });
  it("a running run whose deploy job is still queued after the gate finished", () => {
    const gate = { name: "Check rules", status: "completed", conclusion: "success", steps: [{ name: "x", status: "completed", conclusion: "success" }] };
    expect(waitingForRunner("running", t0, [gate, queuedJob], later)).toBe(true);
  });
  it("not when a job is actually doing steps", () => {
    const job = { name: "Deploy", status: "in_progress", conclusion: null, steps: [{ name: "Set up job", status: "in_progress", conclusion: null }] };
    expect(waitingForRunner("running", t0, [job], later)).toBe(false);
  });
});

describe("runner health against fake GitHub", () => {
  const REPO = "acme/site";
  let fake: FakeGitHub;
  async function load() {
    const client = await import("./client");
    client.resetGithubClient();
    return { data: await import("./data"), runners: await import("./runners") };
  }
  beforeAll(async () => {
    fake = new FakeGitHub();
    process.env.GITHUB_API_URL = await fake.start();
    process.env.GITHUB_TOKEN = "fake-token";
    process.env.STAGEDIRECTOR_REPOS = REPO;
    for (const k of ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_INSTALLATION_ID"]) delete process.env[k];
  });
  afterAll(async () => {
    await fake.stop();
    delete process.env.GITHUB_API_URL;
    delete process.env.GITHUB_TOKEN;
    delete process.env.STAGEDIRECTOR_REPOS;
  });
  beforeEach(() => {
    fake.repos.clear();
    seedTestRepo(fake, REPO);
    (globalThis as { __sdSwr?: Map<string, unknown> }).__sdSwr?.clear();
  });

  it("403 from GitHub: unknown, and runs still start", async () => {
    const { data, runners } = await load();
    expect((await runners.runnerHealth(REPO, ["testbox"])).testbox.state).toBe("unknown");
    const r = await data.performAction("dev", { repo: REPO, stageId: "staging", action: "deploy", commit: sha(4) });
    expect(r.ok).toBe(true);
  });

  it("online runner: online, runs start", async () => {
    fake.repo(REPO).runners = [{ name: "ovh1-a", status: "online", busy: false, labels: ["self-hosted", "testbox"] }];
    const { data, runners } = await load();
    expect((await runners.runnerHealth(REPO, ["testbox"])).testbox.state).toBe("online");
    expect((await data.performAction("dev", { repo: REPO, stageId: "staging", action: "deploy", commit: sha(4) })).ok).toBe(true);
  });

  it("offline runner: offline since, and a run is refused instead of queued", async () => {
    fake.repo(REPO).runners = [{ name: "mac-test", status: "offline", busy: false, labels: ["self-hosted", "testbox"] }];
    const { data, runners } = await load();
    const h = (await runners.runnerHealth(REPO, ["testbox"])).testbox;
    expect(h.state).toBe("offline");
    expect(h.offlineSince).toBeTruthy();
    const before = fake.repo(REPO).runs.length;
    const r = await data.performAction("dev", { repo: REPO, stageId: "staging", action: "deploy", commit: sha(4) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/runner on testbox is offline/);
    expect(fake.repo(REPO).runs.length).toBe(before);
  });
});

describe("runner: github (GitHub-hosted)", () => {
  it("is always online, even when the repo has no self-hosted runners", () => {
    expect(classifyRunners([], ["github"]).github.state).toBe("online");
    expect(classifyRunners(null, ["GitHub"]).GitHub.state).toBe("online");
  });
});
