// GitHub mode end to end against a fake GitHub API (testing/fake-github.ts):
// reading stages, starting runs, run progress, Stop, pins, approvals, Claude
// requests and logs, with the same code the dashboard runs.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGitHub, seedTestRepo, sha } from "./testing/fake-github";

vi.mock("@/lib/auth/auth", () => ({ currentLogin: async () => null, authConfigured: false }));

const REPO = "acme/site";
let fake: FakeGitHub;

async function load() {
  const client = await import("./client");
  client.resetGithubClient();
  return { data: await import("./data"), runs: await import("./runs") };
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
  (globalThis as { __sdGhRuns?: Map<string, unknown> }).__sdGhRuns?.clear();
  (globalThis as { __sdPending?: Map<string, unknown> }).__sdPending?.clear();
});

describe("GitHub mode (fake GitHub)", () => {
  it("reads stages, what is waiting and roles from GitHub", async () => {
    const { data } = await load();
    expect(data.dataSource()).toBe("github");
    const p = (await data.getProject(REPO))!;
    expect(p.config.name).toBe("Test Site");
    const st = Object.fromEntries(p.stages.map((s) => [s.stageId, s]));
    expect(st.staging.commit).toBe(sha(4));
    expect(st.live.commit).toBe(sha(2));
    expect(st.live.behindBy).toBe(2);
    expect(st.staging.pinned).toBe(false);
    expect(p.waiting.map((c) => c.pr)).toEqual([11, 12]);
    expect(p.waiting[0].pages).toEqual(["/contact/"]);
    expect(await data.getRoleFor(REPO, "owner")).toBe("code-owner");
    expect(await data.getRoleFor(REPO, "dev")).toBe("developer");
    expect(await data.getRoleFor(REPO, "reader")).toBe("viewer");
    expect((await data.getProjects()).map((x) => x.repo)).toEqual([REPO]);
  });

  it("a developer updates staging: dispatch, live progress, success, log", async () => {
    const { data, runs } = await load();
    const r = await data.performAction("dev", { repo: REPO, stageId: "staging", action: "deploy", commit: sha(4) });
    expect(r.ok).toBe(true);
    const run = fake.latestRun(REPO)!;
    expect(run.inputs).toEqual({ stage: "staging", commit: sha(4), action: "deploy", requested_by: "dev" });

    fake.step(REPO, run.id); // gate running
    runs.forgetRuns(REPO);
    let a = (await runs.activeRuns()).find((x) => x.runId === run.id)!;
    expect(a.state).toBe("running");
    expect(a.kind).toBe("update");
    expect(a.step).toBe(0);

    for (let i = 0; i < 8; i++) fake.step(REPO, run.id); // gate done, run job set-up steps, then "Run deploy"
    runs.forgetRuns(REPO);
    a = (await runs.activeRuns()).find((x) => x.runId === run.id)!;
    expect(a.steps[a.step]).toBe("Copying files");
    expect(a.progress).toBeGreaterThan(30);

    fake.finish(REPO, run.id);
    runs.forgetRuns(REPO);
    a = (await runs.activeRuns()).find((x) => x.runId === run.id)!;
    expect(a.state).toBe("passed");
    expect((await runs.runLogLines(REPO, run.id)).join("\n")).toContain("deploy staging");
    const act = await data.getActivity(REPO);
    expect(act.some((e) => e.runId === run.id && e.result === "passed")).toBe(true);
  });

  it("Stop cancels the real run and records it", async () => {
    const { data } = await load();
    await data.performAction("dev", { repo: REPO, stageId: "staging", action: "deploy", commit: sha(4) });
    const run = fake.latestRun(REPO)!;
    fake.step(REPO, run.id);
    const s = await data.performAction("dev", { repo: REPO, stageId: "staging", action: "stop", runId: run.id });
    expect(s.ok).toBe(true);
    expect(fake.run(REPO, run.id).conclusion).toBe("cancelled");
    expect((await data.getActivity(REPO)).some((e) => e.action === "stop" && e.runId === run.id)).toBe(true);
  });

  it("a pinned stage (git ref) blocks updates until unpinned", async () => {
    const { data } = await load();
    const pin = await data.performAction("dev", { repo: REPO, stageId: "staging", action: "pin" });
    expect(pin.ok).toBe(true);
    fake.finish(REPO, fake.latestRun(REPO)!.id);
    expect((await data.getProject(REPO))!.stages.find((s) => s.stageId === "staging")!.pinned).toBe(true);
    const blocked = await data.performAction("dev", { repo: REPO, stageId: "staging", action: "deploy", commit: sha(4) });
    expect(blocked).toMatchObject({ ok: false, status: 403 });
    // Developers may not pin the live site.
    expect((await data.performAction("dev", { repo: REPO, stageId: "live", action: "pin" })).ok).toBe(false);
    await data.performAction("dev", { repo: REPO, stageId: "staging", action: "unpin" });
    fake.finish(REPO, fake.latestRun(REPO)!.id);
    expect((await data.getProject(REPO))!.stages.find((s) => s.stageId === "staging")!.pinned).toBe(false);
  });

  it("the workflow itself refuses a deploy into a pinned stage", async () => {
    fake.repo(REPO).refs["stagedirector/pins/staging"] = sha(4);
    const { data } = await load();
    // The dashboard refuses first; even a run started elsewhere would fail in the gate.
    expect((await data.performAction("dev", { repo: REPO, stageId: "staging", action: "deploy", commit: sha(4) })).ok).toBe(false);
  });

  it("live: only a code owner, only after approving that exact commit", async () => {
    const { data } = await load();
    expect((await data.performAction("dev", { repo: REPO, stageId: "live", action: "deploy", commit: sha(4) })).ok).toBe(false);
    expect((await data.performAction("owner", { repo: REPO, stageId: "live", action: "deploy", commit: sha(4) })).ok).toBe(false);
    expect((await data.performAction("dev", { repo: REPO, stageId: "live", action: "approve", commit: sha(4) })).ok).toBe(false);
    expect((await data.performAction("owner", { repo: REPO, stageId: "live", action: "approve", commit: sha(3) })).ok).toBe(false); // not what is on staging
    expect((await data.performAction("owner", { repo: REPO, stageId: "live", action: "approve", commit: sha(4) })).ok).toBe(true);
    const go = await data.performAction("owner", { repo: REPO, stageId: "live", action: "deploy", commit: sha(4) });
    expect(go.ok).toBe(true);
    const run = fake.latestRun(REPO)!;
    expect(run.inputs.stage).toBe("live");
    fake.finish(REPO, run.id);
    expect(fake.onStage(REPO, "live")).toBe(sha(4));
    expect((await data.getProject(REPO))!.waiting).toEqual([]);
  });

  it("Claude asks, a person OKs; claude: can never answer", async () => {
    const { data } = await load();
    const before = fake.repo(REPO).runs.length;
    const r = await data.performAction("claude:dev", { repo: REPO, stageId: "staging", action: "deploy", commit: sha(4), note: "please" });
    expect(r.ok && r.recordedAs).toBe("request");
    expect(fake.repo(REPO).runs.length).toBe(before); // nothing started
    const [req] = await data.openRequests(REPO);
    expect(req).toMatchObject({ actor: "claude:dev", stageId: "staging", wants: "deploy" });
    expect((await data.answerRequest("claude:owner", REPO, req.id, true)).ok).toBe(false);
    expect((await data.answerRequest("reader", REPO, req.id, true)).ok).toBe(false);
    expect((await data.answerRequest("dev", REPO, req.id, true)).ok).toBe(true);
    expect(fake.latestRun(REPO)!.inputs.requested_by).toBe("dev");
    expect(await data.openRequests(REPO)).toEqual([]);
  });

  it("a Claude live request needs a code owner, who approves and pushes in one OK", async () => {
    const { data } = await load();
    await data.performAction("claude:owner", { repo: REPO, stageId: "live", action: "deploy", commit: sha(4) });
    const [req] = await data.openRequests(REPO);
    expect((await data.answerRequest("dev", REPO, req.id, true)).ok).toBe(false);
    expect((await data.answerRequest("owner", REPO, req.id, true)).ok).toBe(true);
    const run = fake.latestRun(REPO)!;
    expect(run.inputs).toMatchObject({ stage: "live", commit: sha(4), requested_by: "owner" });
  });

  it("only trusts log records the dashboard itself wrote", async () => {
    const { data } = await load();
    // Someone with write access forges an approval record with their own identity.
    fake.repo(REPO).deployments.unshift({
      id: 1, sha: sha(4), ref: sha(4), environment: "stagedirector-log", task: "x", creator: { login: "mallory" }, created_at: new Date().toISOString(), statuses: [],
      payload: { stagedirector: 1, event: { at: new Date().toISOString(), actor: "owner", action: "approve", stageId: "live", commit: sha(4) }, approval: { commit: sha(4), stageId: "live", by: "owner", at: new Date().toISOString() } },
    } as never);
    expect((await data.performAction("owner", { repo: REPO, stageId: "live", action: "deploy", commit: sha(4) })).ok).toBe(false);
  });
});
