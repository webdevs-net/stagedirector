import type { ActivityEvent, ProjectSummary } from "@/lib/types";
import { parseConfig } from "@/lib/config";

// Used when no GitHub credentials are set, so the app runs out of the box.
const MARIAS = `version: 1
name: Maria's Place
group: Maria's Place
kind: WordPress · Hostinger
branch: main
stages:
  - {id: local, name: Local, url: "http://localhost:58410/", pushers: none, trigger: manual}
  - id: staging
    name: Staging
    url: https://staging.mariasplace.com/
    pushers: developers
    trigger: auto
    deploy: scripts/deploy.sh staging
    rollback: scripts/deploy.sh rollback staging {backup}
    smokeTest: [/, /login/, /my-account/, /contact/]
    runner: ovh1
  - id: live
    name: Live site
    url: https://mariasplace.com/
    pushers: code-owners
    trigger: manual
    deploy: scripts/deploy.sh live
    rollback: scripts/deploy.sh rollback live {backup}
    smokeTest: [/, /login/, /my-account/, /contact/]
    runner: ovh1
tools: {clearCache: scripts/clear-cache.sh, syncCheck: scripts/deploy.sh drift}
liveTodo: [Repeat any Divi page edits made on staging]
`;

const S1 = "3f2a9c1e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39";
const S0 = "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d";

export const sampleProjects: ProjectSummary[] = [
  {
    repo: "sample/mariasplace",
    config: parseConfig(MARIAS),
    stages: [
      { stageId: "local", commit: null, deployedAt: null, deployedBy: null, behindBy: 0, outOfSync: [], pinned: false },
      { stageId: "staging", commit: S1, deployedAt: "2026-11-18T15:10:00Z", deployedBy: "auto", behindBy: 0, outOfSync: [], pinned: false },
      { stageId: "live", commit: S0, deployedAt: "2026-11-12T18:02:00Z", deployedBy: "sample-owner", behindBy: 2, outOfSync: [], pinned: false },
    ],
    waiting: [
      { pr: 41, title: "Fix login redirect", summary: "After signing in, people land on My Account instead of the home page.", url: "https://github.com/sample/mariasplace/pull/41", pages: ["/login/", "/my-account/"] },
      { pr: 42, title: "Contact form spam filter", summary: "Blocks the most common spam on the contact form.", url: "https://github.com/sample/mariasplace/pull/42", pages: ["/contact/"] },
    ],
    needsMe: false,
    busy: null,
  },
];

export const sampleActivity: Record<string, ActivityEvent[]> = {
  "sample/mariasplace": [
    { id: "s3", at: "2026-11-18T15:10:00Z", actor: "auto", action: "push", stageId: "staging", commit: S1, result: "passed" },
    { id: "s2", at: "2026-11-12T18:02:00Z", actor: "sample-owner", action: "push", stageId: "live", commit: S0, result: "passed" },
    { id: "s1", at: "2026-11-12T17:55:00Z", actor: "sample-owner", action: "approve", stageId: "live", commit: S0 },
  ],
};
