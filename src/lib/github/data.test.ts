import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/auth", () => ({ currentLogin: async () => null, authConfigured: false }));

describe("sample mode (no GitHub credentials)", () => {
  beforeEach(() => {
    for (const k of ["GITHUB_TOKEN", "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_INSTALLATION_ID"]) delete process.env[k];
  });

  it("returns sample projects and activity", async () => {
    const { getProjects, getProject, getActivity, dataSource } = await import("./data");
    expect(dataSource()).toBe("sample");
    const projects = await getProjects();
    expect(projects[0].config.name).toBe("Maria's Place");
    expect(await getProject(projects[0].repo)).not.toBeNull();
    expect((await getActivity(projects[0].repo)).length).toBeGreaterThan(0);
  });

  it("a Claude session's live approval is only a request", async () => {
    const { performAction, getProjects, getActivity } = await import("./data");
    const p = (await getProjects())[0];
    const staging = p.stages.find((s) => s.stageId === "staging")!.commit!;
    const r = await performAction("claude:ryan", { repo: p.repo, stageId: "live", action: "approve", commit: staging });
    expect(r.ok && r.recordedAs).toBe("request");
    const real = await performAction("ryan", { repo: p.repo, stageId: "live", action: "approve", commit: staging });
    expect(real.ok && real.recordedAs).toBe("action");
    expect((await getActivity(p.repo))[0].action).toBe("approve");
  });

  it("refuses approving a commit that is not on staging", async () => {
    const { performAction, getProjects } = await import("./data");
    const p = (await getProjects())[0];
    const r = await performAction("ryan", { repo: p.repo, stageId: "live", action: "approve", commit: "c".repeat(40) });
    expect(r.ok).toBe(false);
  });
});
