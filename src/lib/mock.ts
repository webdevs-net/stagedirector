// Mock data source for the UI. The data-layer session swaps these functions
// for real GitHub-backed ones with the same signatures.
import type {
  ActivityEvent,
  PushRequest,
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
  /** Open requests from Claude sessions (waiting for a person's OK). */
  requests: PushRequest[];
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
        { stageId: "staging", commit: sha(1), deployedAt: ago(9), deployedBy: "auto", behindBy: 0, outOfSync: [], pinned: false },
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
        requests: [],
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
        config: { version: 1, name: `${g.name} · ${site}`, group: g.name, kind: g.kind, branch: "main", stages, ...(g.kind.startsWith("Next.js") ? { noDowntime: true } : {}) },
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
          requests: [],
        },
      });
    }
  }
  return list;
}

const PROJECTS = build();

// Demo pins live on globalThis: in dev, server actions and pages can load separate copies of this module.
const gp = globalThis as unknown as { __sdPins?: Set<string> };
const PINS: Set<string> = (gp.__sdPins ??= new Set());
function withPins(p: ProjectView): ProjectView {
  return { ...p, stages: p.stages.map((s) => ({ ...s, pinned: PINS.has(`${p.repo}|${s.stageId}`) })) };
}

// ---- Public interface (swap for the real data layer later) ----

export async function getViewer(): Promise<Viewer> {
  return { login: "ryan", name: "Ryan", role: "code-owner" };
}

function withRequests(p: ProjectView): ProjectView {
  const requests = demoRequests(p.repo);
  return requests.length ? { ...p, needsMe: true, extras: { ...p.extras, requests } } : p;
}

export async function listProjects(): Promise<ProjectView[]> {
  return PROJECTS.map((p) => withRequests(withPins(p)));
}

export async function getProject(repoSlug: string): Promise<ProjectView | null> {
  const p = PROJECTS.find((x) => repoToSlug(x.repo) === repoSlug);
  return p ? withRequests(withPins(p)) : null;
}

// Events recorded while the demo runs (e.g. check results). On globalThis: see PINS-style note below.
const ge = globalThis as unknown as { __sdEvents?: Map<string, ActivityEvent[]> };
const EVENTS: Map<string, ActivityEvent[]> = (ge.__sdEvents ??= new Map());

export async function recordEvent(repo: string, e: Omit<ActivityEvent, "id">): Promise<ActivityEvent> {
  const ev = { id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...e };
  EVENTS.set(repo, [ev, ...(EVENTS.get(repo) ?? [])]);
  return ev;
}

export async function getActivity(repoSlug: string): Promise<ActivityEvent[]> {
  const p = await getProject(repoSlug);
  if (!p) return [];
  const asks: ActivityEvent[] = demoRequests(p.repo).map((r) => ({ id: r.id, at: r.at, actor: r.actor, action: "request", stageId: r.stageId, commit: r.commit, wants: r.wants, note: r.note }));
  return [
    ...(EVENTS.get(p.repo) ?? []),
    ...(p.repo === "netdevs-net/mariasplace" ? REQ.log : []),
    ...asks,
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

export type RunKind = "update" | "put-live" | "undo" | "clear-cache" | "snapshot";

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
  /** GitHub Actions run id (GitHub mode only). */
  runId?: number;
  /** Link to the run on GitHub (GitHub mode only). */
  url?: string;
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
  if (kind !== "clear-cache" && kind !== "snapshot" && PINS.has(`${repo}|${stage.id}`)) return { error: `${stage.name} is pinned. Unpin it first.` };
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
    steps: kind === "clear-cache" ? ["Clearing cache", "Making sure the site still loads"] : kind === "snapshot" ? ["Starting the backup", "Copying files and database", "Sending to cloud storage"] : RUN_STEPS,
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

/** Demo pin/unpin: flips the stage's pinned flag (GitHub mode uses the workflow's pin ref). */
export async function pinStage(repo: string, stageId: string, pin: boolean, role: Role): Promise<{ error: string } | null> {
  const p = PROJECTS.find((x) => x.repo === repo);
  const cfg = p?.config.stages.find((s) => s.id === stageId);
  if (!p || !cfg) return { error: "No such stage" };
  if (cfg.pushers === "none") return { error: `${cfg.name} is not pushed from here` };
  if (cfg.pushers === "code-owners" ? role !== "code-owner" : role === "viewer") return { error: `Only a code owner can pin ${cfg.name}` };
  if (pin) PINS.add(`${repo}|${stageId}`);
  else PINS.delete(`${repo}|${stageId}`);
  return null;
}

// ---- Claude requests (demo). One sample request so the flow can be tried. ----

const gr = globalThis as unknown as { __sdReq?: { open: PushRequest[]; log: ActivityEvent[] } };
const REQ = (gr.__sdReq ??= {
  open: [
    { id: "req-demo-1", at: ago(4), actor: "claude:ryan", stageId: "staging", wants: "deploy", commit: sha(5), note: "asks to deploy: footer spacing fix (PR #34) is merged; put it on staging to check on phones" },
  ],
  log: [],
});

export function demoRequests(repo: string): PushRequest[] {
  return repo === "netdevs-net/mariasplace" ? REQ.open : [];
}

export async function answerDemoRequest(repo: string, id: string, actor: string, role: Role, ok: boolean): Promise<string | null> {
  const r = demoRequests(repo).find((x) => x.id === id);
  if (!r) return "That request is already answered or gone";
  if (actor.startsWith("claude:")) return "A Claude session can never OK a request; a person must";
  const p = PROJECTS.find((x) => x.repo === repo);
  const stage = p?.config.stages.find((s) => s.id === r.stageId);
  if (!stage) return "No such stage";
  if (stage.pushers === "code-owners" && role !== "code-owner") return `Only a code owner can OK a request for ${stage.name}`;
  REQ.open = REQ.open.filter((x) => x.id !== id);
  REQ.log.unshift({ id: `ans-${Date.now()}`, at: new Date().toISOString(), actor, action: ok ? "push" : "decline", stageId: r.stageId, commit: r.commit, answers: id, result: ok ? "queued" : undefined, note: ok ? `OK for ${r.actor}'s request` : `declined ${r.actor}'s request` });
  return null;
}
