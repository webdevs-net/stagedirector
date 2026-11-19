import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "@/lib/types";
import { deployOwners, ownersFor, parseCodeowners } from "./codeowners";
import { getRole, type RoleSource } from "./roles";
import { approvalValid, decide } from "./permissions";

const CO = `# owners
*            @ryan @acme/leads
/docs/       @writer
*.css        @designer   # styles
`;

function fakeSource(files: Record<string, string>, perms: Record<string, string>, teams: Record<string, string[]> = {}): RoleSource {
  return {
    readFile: async (_r, p) => files[p] ?? null,
    permission: async (_r, l) => perms[l.toLowerCase()] ?? "none",
    inTeam: async (o, t, l) => (teams[`${o}/${t}`] ?? []).includes(l),
  };
}

describe("codeowners", () => {
  const rules = parseCodeowners(CO);
  it("last match wins", () => {
    expect(ownersFor(rules, "docs/a.md")).toEqual(["@writer"]);
    expect(ownersFor(rules, "src/x/y.css")).toEqual(["@designer"]);
    expect(ownersFor(rules, "stagedirector.yml")).toEqual(["@ryan", "@acme/leads"]);
  });
  it("splits users and teams", () => {
    expect(deployOwners(rules)).toEqual({ users: ["ryan"], teams: ["acme/leads"] });
  });
});

describe("getRole", () => {
  const perms = { ryan: "admin", dev: "write", reader: "read", lead: "write", gone: "none" };
  it("reads .github/CODEOWNERS", async () => {
    const src = fakeSource({ ".github/CODEOWNERS": CO }, perms, { "acme/leads": ["lead"] });
    expect(await getRole(src, "o/r", "ryan")).toBe("code-owner");
    expect(await getRole(src, "o/r", "Ryan")).toBe("code-owner");
    expect(await getRole(src, "o/r", "lead")).toBe("code-owner");
    expect(await getRole(src, "o/r", "dev")).toBe("developer");
    expect(await getRole(src, "o/r", "reader")).toBe("viewer");
    expect(await getRole(src, "o/r", "stranger")).toBe("viewer");
  });
  it("falls back to root and docs/ CODEOWNERS", async () => {
    expect(await getRole(fakeSource({ CODEOWNERS: "* @dev" }, perms), "o/r", "dev")).toBe("code-owner");
    expect(await getRole(fakeSource({ "docs/CODEOWNERS": "* @dev" }, perms), "o/r", "dev")).toBe("code-owner");
  });
  it("owner without push access is a viewer", async () => {
    expect(await getRole(fakeSource({ CODEOWNERS: "* @gone" }, perms), "o/r", "gone")).toBe("viewer");
  });
  it("claude sessions get their person's role", async () => {
    const src = fakeSource({ CODEOWNERS: CO }, perms);
    expect(await getRole(src, "o/r", "claude:ryan")).toBe("code-owner");
  });
});

const config: ProjectConfig = {
  version: 1,
  name: "T",
  branch: "main",
  stages: [
    { id: "local", name: "Local", pushers: "none", trigger: "manual" },
    { id: "staging", name: "Staging", pushers: "developers", trigger: "auto", deploy: "d" },
    { id: "live", name: "Live", pushers: "code-owners", trigger: "manual", deploy: "d" },
  ],
  tools: { clearCache: "c" },
};
const A = "a".repeat(40);
const B = "b".repeat(40);
const approval = { commit: A, stageId: "live", by: "ryan", at: "2026-01-01T00:00:00Z" };

describe("decide", () => {
  it("developers push staging but not live", () => {
    expect(decide({ config, stageId: "staging", action: "deploy", actor: "dev", role: "developer", commit: A }).allowed).toBe(true);
    expect(decide({ config, stageId: "staging", action: "stop", actor: "dev", role: "developer" }).allowed).toBe(true);
    expect(decide({ config, stageId: "live", action: "deploy", actor: "dev", role: "developer", commit: A, approval }).allowed).toBe(false);
    expect(decide({ config, stageId: "live", action: "rollback", actor: "dev", role: "developer" }).allowed).toBe(false);
  });
  it("viewers and 'none' stages are refused", () => {
    expect(decide({ config, stageId: "staging", action: "deploy", actor: "v", role: "viewer", commit: A }).allowed).toBe(false);
    expect(decide({ config, stageId: "local", action: "deploy", actor: "ryan", role: "code-owner", commit: A }).allowed).toBe(false);
  });
  it("only code owners approve, tied to the staging commit", () => {
    expect(decide({ config, stageId: "live", action: "approve", actor: "dev", role: "developer", commit: A }).allowed).toBe(false);
    expect(decide({ config, stageId: "live", action: "approve", actor: "ryan", role: "code-owner", commit: A, previousStageCommit: A })).toEqual({ allowed: true, recordAs: "action" });
    expect(decide({ config, stageId: "live", action: "approve", actor: "ryan", role: "code-owner", commit: A, previousStageCommit: B }).allowed).toBe(false);
    expect(decide({ config, stageId: "staging", action: "approve", actor: "ryan", role: "code-owner", commit: A }).allowed).toBe(false);
  });
  it("live push needs a valid approval for the exact commit", () => {
    const base = { config, stageId: "live", action: "deploy" as const, actor: "ryan", role: "code-owner" as const };
    expect(decide({ ...base, commit: A, previousStageCommit: A, approval }).allowed).toBe(true);
    expect(decide({ ...base, commit: A, previousStageCommit: A }).allowed).toBe(false);
    expect(decide({ ...base, commit: B, previousStageCommit: B, approval }).allowed).toBe(false);
    // staging moved since the approval
    expect(decide({ ...base, commit: A, previousStageCommit: B, approval }).allowed).toBe(false);
  });
  it("claude sessions only ever make requests on code-owner stages", () => {
    expect(decide({ config, stageId: "live", action: "approve", actor: "claude:ryan", role: "code-owner", commit: A })).toEqual({ allowed: true, recordAs: "request" });
    expect(decide({ config, stageId: "live", action: "deploy", actor: "claude:ryan", role: "code-owner", commit: A, previousStageCommit: A, approval })).toEqual({ allowed: true, recordAs: "request" });
    expect(decide({ config, stageId: "staging", action: "deploy", actor: "claude:dev", role: "developer", commit: A })).toEqual({ allowed: true, recordAs: "action" });
  });
  it("an approval by a claude session never counts", () => {
    expect(approvalValid({ ...approval, by: "claude:ryan" }, "live", A, A)).toBe(false);
  });
  it("clear-cache needs a configured command", () => {
    const noTools = { ...config, tools: undefined };
    expect(decide({ config: noTools, stageId: "staging", action: "clear-cache", actor: "dev", role: "developer" }).allowed).toBe(false);
  });
});

describe("pinned stages", () => {
  const config: ProjectConfig = {
    version: 1, name: "t", branch: "main",
    stages: [
      { id: "local", name: "Local", pushers: "none", trigger: "manual" },
      { id: "staging", name: "Staging", pushers: "developers", trigger: "auto" },
      { id: "live", name: "Live", pushers: "code-owners", trigger: "manual" },
    ],
  };
  it("blocks deploy and rollback while pinned, like the workflow", () => {
    expect(decide({ config, stageId: "staging", action: "deploy", actor: "dev", role: "developer", commit: "a".repeat(40), pinned: true }).allowed).toBe(false);
    expect(decide({ config, stageId: "staging", action: "rollback", actor: "dev", role: "developer", pinned: true }).allowed).toBe(false);
    expect(decide({ config, stageId: "staging", action: "unpin", actor: "dev", role: "developer", pinned: true }).allowed).toBe(true);
  });
  it("only code owners pin the last stage", () => {
    expect(decide({ config, stageId: "live", action: "pin", actor: "dev", role: "developer", pinned: false }).allowed).toBe(false);
    expect(decide({ config, stageId: "live", action: "pin", actor: "ryan", role: "code-owner", pinned: false }).allowed).toBe(true);
    expect(decide({ config, stageId: "staging", action: "pin", actor: "dev", role: "developer", pinned: false }).allowed).toBe(true);
  });
});
