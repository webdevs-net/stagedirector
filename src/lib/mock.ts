// Mock data source for the UI. The data-layer session swaps these functions
// for real GitHub-backed ones with the same signatures.
import type {
  ActivityEvent,
  Change,
  ProjectConfig,
  ProjectSummary,
  Role,
  StageConfig,
  StageStatus,
} from "./types";
import { RUN_STEPS, repoToSlug } from "./shared";

export interface Viewer {
  login: string;
  name: string;
  role: Role;
}

/** Extra UI-only state that is not (yet) in types.ts. */
export interface ProjectExtras {
  starred: boolean;
  approval: { by: string; at: string } | null;
  failedCheck: boolean;
  safetyNetUndid: string | null;
  quietHours: string | null;
  stagingReady: boolean;
  files: string[];
  outOfSyncNote: string | null;
}

export type ProjectView = ProjectSummary & { extras: ProjectExtras };

const NOW = Date.parse("2026-11-18T15:22:00-08:00");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const sha = (n: number) => (n * 2654435761).toString(16).padStart(8, "0").repeat(5).slice(0, 40);

const MARIAS: ProjectConfig = {
  version: 1,
  name: "Maria's Place",
  group: "Maria's Place",
  kind: "WordPress · Hostinger",
  branch: "main",
  stages: [
    { id: "local", name: "Local", url: "http://localhost:58410/", pushers: "none", trigger: "manual" },
    {
      id: "staging",
      name: "Staging",
      url: "https://staging.mariasplace.com/",
      pushers: "developers",
      trigger: "auto",
      smokeTest: ["/", "/login/", "/my-account/", "/contact/"],
      runner: "ovh1",
    },
    {
      id: "live",
      name: "Live site",
      url: "https://mariasplace.com/",
      pushers: "code-owners",
      trigger: "manual",
      smokeTest: ["/", "/login/", "/my-account/", "/contact/"],
      runner: "ovh1",
    },
  ],
  tools: { clearCache: "scripts/clear-cache.sh", syncCheck: "scripts/deploy.sh drift" },
  liveTodo: ["Clear the Divi page styles on the login page", "Repeat any Divi page edits made on staging"],
};

const MARIAS_CHANGES: Change[] = [
  {
    pr: 27,
    title: "New login page design",
    summary:
      'The login page is now a centred white card. A short welcome line under the heading, Facebook and Google buttons as wide as the fields, a clear "or" line, bigger boxes to type in, Remember me and Lost password on one line, and one big Login button. Works on phones.',
    url: "https://github.com/netdevs-net/mariasplace/pull/27",
    pages: ["/login/"],
  },
  {
    pr: 28,
    title: "New sign-up pop-up design",
    summary: "The pop-up that opens on a locked activity now matches the login card and fits on a laptop screen.",
    url: "https://github.com/netdevs-net/mariasplace/pull/28",
    pages: ["/activities/"],
  },
  {
    pr: 32,
    title: "Home page heading fix and footer clean-up",
    summary: "The home page keeps one main heading after Divi is removed. Old chat and tracking code removed from the footer.",
    url: "https://github.com/netdevs-net/mariasplace/pull/32",
    pages: ["/"],
  },
  {
    pr: 33,
    title: "Browsers load new styles right away",
    summary: "Behind the scenes: after each update, visitors' browsers fetch the new look without a hard refresh.",
    url: "https://github.com/netdevs-net/mariasplace/pull/33",
  },
];

type Flavor = "ok" | "ready" | "sync" | "fail" | "busy";

const GROUPS: { name: string; owner: string; kind: string; sites: string[] }[] = [
  { name: "Harbor Dental", owner: "harbor-dental", kind: "WordPress · ovh1", sites: ["Main site", "Booking", "Careers", "Blog", "Kids clinic", "Landing pages"] },
  { name: "Greenleaf Co-op", owner: "greenleaf", kind: "Static · ovh1", sites: ["Shop", "Members", "Newsletter", "Recipes", "Events", "Bakery"] },
  { name: "Northwind Builders", owner: "northwind", kind: "Next.js · ovh1", sites: ["Website", "Portal", "Estimator", "Gallery", "Careers", "Docs", "Status", "Intranet", "Partners"] },
  { name: "Internal tools", owner: "aibacus", kind: "Next.js · ovh1", sites: ["Stage Director", "PenPrint", "Invoices", "Time sheets", "Brand kit", "Status board", "Backups"] },
  { name: "Lakeside Arts", owner: "lakeside-arts", kind: "WordPress · Hostinger", sites: ["Festival", "Tickets", "School", "Archive", "Gallery shop", "Volunteers", "Donate", "Press", "Venue hire"] },
];

const FLAVORS: Record<string, Flavor> = {
  "harbor-dental/booking": "ready",
  "harbor-dental/kids-clinic": "fail",
  "harbor-dental/landing-pages": "ready",
  "northwind/website": "sync",
  "northwind/portal": "ready",
  "aibacus/penprint": "busy",
  "lakeside-arts/tickets": "ready",
};

const STARRED = new Set(["netdevs-net/mariasplace", "northwind/website", "aibacus/stage-director"]);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function stagesFor(kind: string, base: string): StageConfig[] {
  const twoStage = kind.startsWith("Static");
  const s: StageConfig[] = [{ id: "local", name: "Local", pushers: "none", trigger: "manual" }];
  if (!twoStage) s.push({ id: "staging", name: "Staging", url: `https://staging.${base}/`, pushers: "developers", trigger: "auto" });
  s.push({ id: "live", name: "Live site", url: `https://${base}/`, pushers: "code-owners", trigger: "manual" });
  return s;
}

function statusFor(stages: StageConfig[], flavor: Flavor, i: number): StageStatus[] {
  return stages.map((st, idx) => {
    const last = idx === stages.length - 1;
    return {
      stageId: st.id,
      commit: sha(i * 10 + idx),
      deployedAt: ago(9 + i * 37 + idx * 300),
      deployedBy: idx === 1 ? "auto" : "ryan",
      behindBy: last && flavor === "ready" ? 2 : 0,
      outOfSync: last && flavor === "sync" ? ["wp-content/themes/site/footer.php"] : [],
      pinned: false,
    };
  });
}

function build(): ProjectView[] {
  const list: ProjectView[] = [
    {
      repo: "netdevs-net/mariasplace",
      config: MARIAS,
      stages: [
        { stageId: "local", commit: sha(1), deployedAt: null, deployedBy: null, behindBy: 0, outOfSync: [], pinned: false },
        {
          stageId: "staging", commit: sha(1), deployedAt: ago(9), deployedBy: "auto", behindBy: 0, outOfSync: [], pinned: false,
          // Demo of a deploy made from a terminal (scripts/deploy.sh staging) on a feature branch.
          running: { commit: sha(7), at: ago(4), by: "ryan", source: "terminal", ref: "claude/divi-removal-strategy-4f5a0e", behindBy: 0, onBranch: false },
        },
        { stageId: "live", commit: sha(2), deployedAt: ago(60 * 26), deployedBy: "ryan", behindBy: 4, outOfSync: ["wp-content/themes/MariasPlace/content-page.php"], pinned: false },
      ],
      waiting: MARIAS_CHANGES,
      needsMe: true,
      busy: null,
      extras: {
        starred: true,
        approval: null,
        failedCheck: false,
        safetyNetUndid: null,
        quietHours: null,
        stagingReady: true,
        files: ["style.css", "functions.php", "footer.php", "content-page.php", "DIVI-REMOVAL.md"],
        outOfSyncNote: "content-page.php has 2 lines that are not in git. They are saved in the backup before being replaced.",
      },
    },
  ];
  let i = 1;
  for (const g of GROUPS) {
    for (const site of g.sites) {
      i++;
      const repo = `${g.owner}/${slug(site)}`;
      const flavor = FLAVORS[repo] ?? "ok";
      const base = `${slug(site)}.${g.owner}.example`;
      const stages = stagesFor(g.kind, base);
      const waiting: Change[] =
        flavor === "ready"
          ? [
              { pr: 10 + i, title: "Updated contact details", summary: "New phone number and opening hours in the footer.", url: `https://github.com/${repo}/pull/${10 + i}` },
              { pr: 11 + i, title: "Faster image loading", summary: "Photos load as you scroll, so pages open quicker on phones.", url: `https://github.com/${repo}/pull/${11 + i}` },
            ]
          : [];
      list.push({
        repo,
        config: { version: 1, name: `${g.name} · ${site}`, group: g.name, kind: g.kind, branch: "main", stages },
        stages: statusFor(stages, flavor, i),
        waiting,
        needsMe: flavor === "ready" || flavor === "sync" || flavor === "fail",
        busy: flavor === "busy" ? { by: "sam", stageId: "staging" } : null,
        extras: {
          starred: STARRED.has(repo),
          approval: null,
          failedCheck: flavor === "fail",
          safetyNetUndid: flavor === "fail" ? "The booking page stopped loading, so staging was put back" : null,
          quietHours: null,
          stagingReady: false,
          files: [],
          outOfSyncNote: flavor === "sync" ? "footer.php was edited on the live server." : null,
        },
      });
    }
  }
  return list;
}

const PROJECTS = build();

// ---- Public interface (swap for the real data layer later) ----

export async function getViewer(): Promise<Viewer> {
  return { login: "ryan", name: "Ryan", role: "code-owner" };
}

export async function listProjects(): Promise<ProjectView[]> {
  return PROJECTS;
}

export async function getProject(repoSlug: string): Promise<ProjectView | null> {
  return PROJECTS.find((p) => repoToSlug(p.repo) === repoSlug) ?? null;
}

export async function getActivity(repoSlug: string): Promise<ActivityEvent[]> {
  const p = await getProject(repoSlug);
  if (!p) return [];
  return [
    { id: "a1", at: ago(9), actor: "auto", action: "push", stageId: "staging", commit: sha(1), result: "passed", note: "Browsers load new styles right away. 2 files changed. Everything checked out." },
    { id: "a2", at: ago(10), actor: "ryan", action: "push", stageId: "staging", commit: sha(3), result: "passed", note: "New login page and sign-up pop-up designs. 1 file changed. Everything checked out." },
    { id: "a3", at: ago(17), actor: "ryan", action: "stop", stageId: "staging", result: "stopped", note: "It would have undone 2 files that were only on staging, so nothing was changed." },
    { id: "a4", at: ago(60 * 26), actor: "ryan", action: "push", stageId: "live", commit: sha(2), result: "passed", note: "Contact form spam filter and new footer links." },
    { id: "a5", at: ago(60 * 27), actor: "ryan", action: "approve", stageId: "live", commit: sha(2), note: "Approved 2 changes for live." },
    { id: "a6", at: ago(60 * 50), actor: "auto", action: "undo", stageId: "staging", result: "undone", note: "Safety net: the contact page stopped loading, so staging was put back." },
    { id: "a7", at: ago(60 * 74), actor: "claude:ryan", action: "clear-cache", stageId: "live", result: "passed", note: "Cache cleared after the menu change." },
  ];
}

export async function getRunLog(): Promise<string[]> {
  return [
    "Commit 48ee4ec (main) -> STAGING",
    "M themes/MariasPlace/functions.php (+1 -1)",
    "M themes/MariasPlace/style.css (+1 -1)",
    "Backup saved: mariasplace-staging-deploy-20261118-151341",
    "Copying 2 files…",
  ];
}

export { repoToSlug, RUN_STEPS };

// ---- Runs (mock). The data layer replaces these with GitHub workflow-run polling. ----

export type RunKind = "update" | "put-live" | "undo" | "clear-cache";

export interface ActiveRun {
  id: string;
  repo: string;
  projectName: string;
  stageId: string;
  stageName: string;
  stageUrl?: string;
  kind: RunKind;
  startedAt: number;      // epoch ms
  step: number;           // index into RUN_STEPS
  steps: string[];
  progress: number;       // 0..100
  state: "running" | "passed" | "failed" | "stopped";
  finishedAt: number | null;
}

const RUN_MS = 20_000;

const g = globalThis as unknown as { __sdRuns?: Map<string, ActiveRun> };
const RUNS: Map<string, ActiveRun> = (g.__sdRuns ??= new Map());

function tick(r: ActiveRun): ActiveRun {
  if (r.state !== "running") return r;
  const el = Date.now() - r.startedAt;
  const progress = Math.min(100, Math.round((el / RUN_MS) * 100));
  const step = Math.min(r.steps.length - 1, Math.floor((el / RUN_MS) * r.steps.length));
  const done = el >= RUN_MS;
  const fail = done && PROJECTS.find((p) => p.repo === r.repo)?.extras.failedCheck;
  return Object.assign(r, { progress, step, state: done ? (fail ? "failed" : "passed") : "running", finishedAt: done ? r.startedAt + RUN_MS : null });
}

/** Runs that are going, or finished in the last minute. */
export async function getActiveRuns(): Promise<ActiveRun[]> {
  const out: ActiveRun[] = [];
  for (const r of RUNS.values()) {
    tick(r);
    if (r.finishedAt && Date.now() - r.finishedAt > 60_000) RUNS.delete(r.id);
    else out.push({ ...r });
  }
  return out;
}

export async function startRun(repo: string, stageId: string, kind: RunKind): Promise<ActiveRun | { error: string }> {
  const p = PROJECTS.find((x) => x.repo === repo);
  if (!p) return { error: "No such project" };
  if ([...RUNS.values()].some((r) => r.repo === repo && tick(r).state === "running")) return { error: "Something is already running here" };
  const stage = p.config.stages.find((s) => s.id === stageId) ?? p.config.stages[1];
  const run: ActiveRun = {
    id: `run-${Date.now()}`,
    repo,
    projectName: p.config.name,
    stageId: stage.id,
    stageName: stage.name,
    stageUrl: stage.url,
    kind,
    startedAt: Date.now(),
    step: 0,
    steps: kind === "clear-cache" ? ["Clearing cache", "Making sure the site still loads"] : RUN_STEPS,
    progress: 0,
    state: "running",
    finishedAt: null,
  };
  RUNS.set(run.id, run);
  return { ...run };
}

export async function stopRun(runId: string): Promise<void> {
  const r = RUNS.get(runId);
  if (r && tick(r).state === "running") Object.assign(r, { state: "stopped", finishedAt: Date.now() });
}
