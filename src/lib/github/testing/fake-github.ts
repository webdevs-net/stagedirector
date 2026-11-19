/* eslint-disable @typescript-eslint/no-unused-vars -- destructuring drops private fields from API answers */
// A small fake of the GitHub REST API, for tests. It implements only the
// endpoints Stage Director calls, keeps everything in memory, and can play the
// engine's workflow (engine/workflow/stagedirector.yml): a dispatch creates a
// run, `finish()` applies what the real workflow would do (deployment records,
// pin refs, rollbacks). Plain TypeScript (no enums / parameter properties) so
// Node can run it directly for the browser tests: see fake-github-server.ts.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakePr {
  number: number;
  title: string;
  body: string;
  files: string[];
  mergeSha: string; // commit the PR was merged as
}

export interface FakeRepoInit {
  name: string; // owner/name
  config: string; // stagedirector.yml text
  codeowners?: string;
  commits: string[]; // linear history of main, oldest first (full shas)
  prs?: FakePr[];
  permissions?: Record<string, string>; // login -> admin | write | read
  deployed?: Record<string, string>; // stage id -> sha already on it
}

interface Deployment {
  id: number;
  sha: string;
  ref: string;
  environment: string;
  task: string;
  payload: unknown;
  creator: { login: string };
  created_at: string;
  statuses: { id: number; state: string; description: string; created_at: string }[];
}

export interface FakeRun {
  id: number;
  display_title: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null;
  head_sha: string;
  html_url: string;
  created_at: string;
  run_started_at: string;
  updated_at: string;
  triggering_actor: { login: string };
  inputs: { stage: string; commit: string; action: string; requested_by: string };
  jobs: { id: number; name: string; status: string; conclusion: string | null; steps: { name: string; status: string; conclusion: string | null }[] }[];
  log: string[];
}

interface Repo {
  name: string;
  files: Record<string, string>;
  commits: string[];
  prs: FakePr[];
  permissions: Record<string, string>;
  deployments: Deployment[];
  refs: Record<string, string>;
  runs: FakeRun[];
  statuses: { sha: string; context: string; state: string; creator: string; description: string }[];
}

const iso = (t = Date.now()) => new Date(t).toISOString();
const RUN_STEPS = ["Set up job", "Check out", "Pin host keys", "Load host SSH key", "Write approval file", "Run", "Clean up"];

export class FakeGitHub {
  self = "stagedirector-test";
  repos = new Map<string, Repo>();
  requests: string[] = []; // "METHOD /path" log, for assertions
  private n = 1000;
  private server: Server | null = null;
  url = "";

  addRepo(init: FakeRepoInit): Repo {
    const r: Repo = {
      name: init.name,
      files: { "stagedirector.yml": init.config, ...(init.codeowners ? { ".github/CODEOWNERS": init.codeowners } : {}) },
      commits: init.commits,
      prs: init.prs ?? [],
      permissions: init.permissions ?? {},
      deployments: [],
      refs: {},
      runs: [],
      statuses: [],
    };
    this.repos.set(init.name, r);
    for (const [stage, sha] of Object.entries(init.deployed ?? {})) this.recordDeploy(r, stage, sha, "seed", `backup-${sha.slice(0, 7)}`);
    return r;
  }

  repo(name: string): Repo {
    const r = this.repos.get(name);
    if (!r) throw new Error(`fake: no repo ${name}`);
    return r;
  }

  private id() {
    return ++this.n;
  }

  private recordDeploy(r: Repo, stage: string, sha: string, actor: string, backup: string) {
    const d: Deployment = {
      id: this.id(), sha, ref: sha, environment: stage, task: "deploy", payload: { requestedBy: actor, actor }, creator: { login: "github-actions[bot]" }, created_at: iso(), statuses: [],
    };
    d.statuses.unshift({ id: this.id(), state: "success", description: `Deployed by ${actor} backup=${backup}`, created_at: iso() });
    r.deployments.unshift(d);
  }

  /** What is on a stage now (newest deployment whose newest status is success). */
  onStage(repo: string, stage: string): string | null {
    const d = this.repo(repo).deployments.find((x) => x.environment === stage && x.statuses[0]?.state === "success");
    return d?.sha ?? null;
  }

  /** Moves a run forward one workflow step (gate first, then the run job). */
  step(repo: string, runId: number) {
    const run = this.run(repo, runId);
    if (run.status === "completed") return;
    run.status = "in_progress";
    run.updated_at = iso();
    const all = run.jobs.flatMap((j) => j.steps.map((s) => ({ j, s })));
    const cur = all.find((x) => x.s.status === "in_progress");
    if (cur) {
      cur.s.status = "completed";
      cur.s.conclusion = "success";
    }
    const next = all.find((x) => x.s.status === "queued");
    if (next) {
      next.s.status = "in_progress";
      next.j.status = "in_progress";
    }
    for (const j of run.jobs) if (j.steps.every((s) => s.status === "completed")) Object.assign(j, { status: "completed", conclusion: "success" });
    // The run job appears once the gate job is done, like GitHub.
    if (run.jobs.length === 1 && run.jobs[0].status === "completed") {
      run.jobs.push({ id: this.id(), name: `${run.inputs.action} ${run.inputs.stage}`, status: "queued", conclusion: null, steps: RUN_STEPS.map((name) => ({ name: name === "Run" ? `Run ${run.inputs.action}` : name, status: "queued", conclusion: null })) });
    }
    run.log.push(`step ${next ? next.s.name : "(none)"}`);
  }

  /** Ends a run and applies what the real workflow would have done. */
  finish(repo: string, runId: number, conclusion: "success" | "failure" = "success") {
    const r = this.repo(repo);
    const run = this.run(repo, runId);
    const { stage, commit, action, requested_by } = run.inputs;
    const pinned = `stagedirector/pins/${stage}` in r.refs;
    let result = conclusion;
    if (pinned && action !== "pin" && action !== "unpin" && action !== "clear-cache") {
      result = "failure";
      run.log.push(`### Refused\nStage '${stage}' is pinned. Unpin it first.`);
    } else if (action === "deploy" && stage === "live" && !r.statuses.some((x) => x.sha === commit && x.context === "stagedirector/approval/live" && x.state === "success")) {
      // Like the engine's live gate: the approval must be a commit status on that exact commit.
      result = "failure";
      run.log.push(`### Refused\nCommit ${commit.slice(0, 7)} has no approval for live.`);
    } else if (result === "success") {
      if (action === "deploy") this.recordDeploy(r, stage, commit, requested_by, `backup-${this.id()}`);
      if (action === "pin") r.refs[`stagedirector/pins/${stage}`] = commit;
      if (action === "unpin") delete r.refs[`stagedirector/pins/${stage}`];
      if (action === "rollback") {
        const d = r.deployments.find((x) => x.environment === stage && x.statuses[0]?.state === "success");
        d?.statuses.unshift({ id: this.id(), state: "inactive", description: `Undone by ${requested_by}`, created_at: iso() });
      }
      run.log.push(`${action} ${stage} ${commit.slice(0, 7)}: done`);
    } else {
      run.log.push(`${action} ${stage}: FAILED`);
    }
    for (const j of run.jobs) for (const s of j.steps) if (s.status !== "completed") Object.assign(s, { status: "completed", conclusion: result === "success" ? "success" : "skipped" });
    for (const j of run.jobs) Object.assign(j, { status: "completed", conclusion: result });
    Object.assign(run, { status: "completed", conclusion: result, updated_at: iso() });
  }

  run(repo: string, runId: number): FakeRun {
    const run = this.repo(repo).runs.find((x) => x.id === runId);
    if (!run) throw new Error(`fake: no run ${runId}`);
    return run;
  }

  latestRun(repo: string): FakeRun | undefined {
    return this.repo(repo).runs[0];
  }

  private commitJson(r: Repo, sha: string) {
    const pr = r.prs.find((p) => p.mergeSha === sha);
    return { sha, html_url: `https://github.com/${r.name}/commit/${sha}`, commit: { message: pr ? `Merge pull request #${pr.number}` : `Commit ${sha.slice(0, 7)}\n\nDirect change.` } };
  }

  // ---- HTTP ----

  async start(port = 0): Promise<string> {
    this.server = createServer((req, res) => this.handle(req, res).catch((e) => this.send(res, 500, { message: String(e) })));
    await new Promise<void>((ok) => this.server!.listen(port, "127.0.0.1", ok));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this.url;
  }

  async stop() {
    await new Promise<void>((ok) => (this.server ? this.server.close(() => ok()) : ok()));
    this.server = null;
  }

  private send(res: ServerResponse, status: number, body?: unknown, type = "application/json") {
    res.writeHead(status, { "content-type": type });
    res.end(body === undefined ? "" : type === "application/json" ? JSON.stringify(body) : String(body));
  }

  private async body(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const t = Buffer.concat(chunks).toString("utf8");
    return t ? JSON.parse(t) : {};
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const u = new URL(req.url ?? "/", "http://x");
    const path = decodeURIComponent(u.pathname);
    const m = req.method ?? "GET";
    this.requests.push(`${m} ${path}`);
    const q = (k: string) => u.searchParams.get(k);

    // Test controls (browser tests drive the fake workflow through these).
    if (m === "POST" && path === "/_fake/step") {
      const run = this.latestRun(q("repo")!);
      if (run) for (let i = 0; i < Number(q("n") ?? 1); i++) this.step(q("repo")!, run.id);
      return this.send(res, 200, run ?? {});
    }
    if (m === "POST" && path === "/_fake/finish") {
      const run = this.latestRun(q("repo")!);
      if (run) this.finish(q("repo")!, run.id, (q("conclusion") as "success" | "failure") ?? "success");
      return this.send(res, 200, run ?? {});
    }
    if (m === "GET" && path === "/_fake/latest") return this.send(res, 200, this.latestRun(q("repo")!) ?? {});
    if (m === "POST" && path === "/_fake/reset") {
      this.repos.clear();
      seedTestRepo(this, q("repo") ?? "acme/site");
      return this.send(res, 200, {});
    }

    if (m === "GET" && path === "/user") return this.send(res, 200, { login: this.self });
    if (m === "GET" && /^\/orgs\/[^/]+\/teams\/[^/]+\/memberships\/[^/]+$/.test(path)) return this.send(res, 404, { message: "Not Found" });

    const rm = /^\/repos\/([^/]+\/[^/]+)(\/.*)?$/.exec(path);
    if (!rm) return this.send(res, 404, { message: "Not Found" });
    const r = this.repos.get(rm[1]);
    if (!r) return this.send(res, 404, { message: "Not Found" });
    const rest = rm[2] ?? "";
    let x: RegExpExecArray | null;

    if (m === "GET" && rest === "") return this.send(res, 200, { full_name: r.name, default_branch: "main" });
    if (m === "GET" && (x = /^\/contents\/(.+)$/.exec(rest))) {
      const f = r.files[x[1]];
      return f === undefined ? this.send(res, 404, { message: "Not Found" }) : this.send(res, 200, { type: "file", path: x[1], content: Buffer.from(f).toString("base64"), encoding: "base64" });
    }
    if (m === "GET" && /^\/branches\/[^/]+$/.test(rest)) return this.send(res, 200, { commit: { sha: r.commits.at(-1) } });
    if (m === "GET" && (x = /^\/collaborators\/([^/]+)\/permission$/.exec(rest))) {
      const p = r.permissions[x[1].toLowerCase()];
      return p ? this.send(res, 200, { permission: p }) : this.send(res, 404, { message: "Not Found" });
    }
    if (m === "GET" && (x = /^\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/.exec(rest))) {
      const a = r.commits.indexOf(x[1]);
      const b = r.commits.indexOf(x[2]);
      if (a < 0 || b < 0) return this.send(res, 404, { message: "Not Found" });
      return this.send(res, 200, { ahead_by: Math.max(0, b - a), behind_by: Math.max(0, a - b), commits: b > a ? r.commits.slice(a + 1, b + 1).map((sha) => this.commitJson(r, sha)) : [] });
    }
    if (m === "POST" && (x = /^\/statuses\/([0-9a-f]{40})$/.exec(rest))) {
      const b = await this.body(req);
      const st = { sha: x[1], context: String(b.context), state: String(b.state), creator: this.self, description: String(b.description ?? "") };
      r.statuses.push(st);
      return this.send(res, 201, st);
    }
    if (m === "GET" && rest === "/commits") {
      const end = r.commits.indexOf(q("sha") ?? r.commits.at(-1)!);
      return this.send(res, 200, r.commits.slice(0, end + 1).reverse().slice(0, Number(q("per_page") ?? 30)).map((sha) => this.commitJson(r, sha)));
    }
    if (m === "GET" && (x = /^\/commits\/([0-9a-f]+)\/pulls$/.exec(rest))) {
      const sha = x[1];
      return this.send(res, 200, r.prs.filter((p) => p.mergeSha === sha).map((p) => ({ number: p.number, title: p.title, body: p.body, html_url: `https://github.com/${r.name}/pull/${p.number}`, merged_at: iso(), merge_commit_sha: p.mergeSha, head: { sha: p.mergeSha } })));
    }
    if (m === "GET" && (x = /^\/pulls\/(\d+)\/files$/.exec(rest))) {
      const p = r.prs.find((pp) => pp.number === Number(x![1]));
      return this.send(res, 200, (p?.files ?? []).map((filename) => ({ filename })));
    }
    if (m === "GET" && (x = /^\/git\/ref\/(.+)$/.exec(rest))) {
      const sha = r.refs[x[1]];
      return sha ? this.send(res, 200, { ref: `refs/${x[1]}`, object: { sha } }) : this.send(res, 404, { message: "Not Found" });
    }

    // Deployments
    if (m === "GET" && rest === "/deployments") {
      const env = q("environment");
      const per = Number(q("per_page") ?? 30);
      const list = r.deployments.filter((d) => !env || d.environment === env).slice(0, per);
      return this.send(res, 200, list.map(({ statuses: _s, ...d }) => d));
    }
    if (m === "POST" && rest === "/deployments") {
      const b = await this.body(req);
      const d: Deployment = { id: this.id(), sha: String(b.ref), ref: String(b.ref), environment: String(b.environment), task: String(b.task ?? "deploy"), payload: b.payload ?? {}, creator: { login: this.self }, created_at: iso(), statuses: [] };
      r.deployments.unshift(d);
      return this.send(res, 201, (({ statuses: _s, ...rest2 }) => rest2)(d));
    }
    if ((x = /^\/deployments\/(\d+)\/statuses$/.exec(rest))) {
      const d = r.deployments.find((dd) => dd.id === Number(x![1]));
      if (!d) return this.send(res, 404, { message: "Not Found" });
      if (m === "GET") return this.send(res, 200, d.statuses.slice(0, Number(q("per_page") ?? 30)));
      const b = await this.body(req);
      const s = { id: this.id(), state: String(b.state), description: String(b.description ?? ""), created_at: iso() };
      d.statuses.unshift(s);
      return this.send(res, 201, s);
    }

    // Actions
    if (m === "GET" && /^\/actions\/workflows\/[^/]+\/runs$/.test(rest)) {
      const per = Number(q("per_page") ?? 30);
      return this.send(res, 200, { total_count: r.runs.length, workflow_runs: r.runs.slice(0, per).map(({ jobs: _j, log: _l, inputs: _i, ...run }) => run) });
    }
    if (m === "POST" && /^\/actions\/workflows\/[^/]+\/dispatches$/.test(rest)) {
      const b = await this.body(req);
      const inputs = b.inputs as FakeRun["inputs"];
      const id = this.id();
      r.runs.unshift({
        id,
        display_title: `stagedirector ${inputs.action} ${inputs.stage} ${inputs.commit} by ${inputs.requested_by}`,
        status: "queued",
        conclusion: null,
        head_sha: r.commits.at(-1)!,
        html_url: `https://github.com/${r.name}/actions/runs/${id}`,
        created_at: iso(),
        run_started_at: iso(),
        updated_at: iso(),
        triggering_actor: { login: this.self },
        inputs,
        jobs: [{ id: this.id(), name: "Check rules", status: "queued", conclusion: null, steps: [{ name: "Set up job", status: "queued", conclusion: null }, { name: "Apply rules", status: "queued", conclusion: null }] }],
        log: [`dispatched ${inputs.action} ${inputs.stage} ${inputs.commit} by ${inputs.requested_by}`],
      });
      return this.send(res, 204);
    }
    if (m === "GET" && (x = /^\/actions\/runs\/(\d+)\/jobs$/.exec(rest))) {
      const run = r.runs.find((rr) => rr.id === Number(x![1]));
      return run ? this.send(res, 200, { total_count: run.jobs.length, jobs: run.jobs }) : this.send(res, 404, { message: "Not Found" });
    }
    if (m === "POST" && (x = /^\/actions\/runs\/(\d+)\/cancel$/.exec(rest))) {
      const run = r.runs.find((rr) => rr.id === Number(x![1]));
      if (!run) return this.send(res, 404, { message: "Not Found" });
      if (run.status === "completed") return this.send(res, 409, { message: "Cannot cancel a workflow run that is completed." });
      Object.assign(run, { status: "completed", conclusion: "cancelled", updated_at: iso() });
      for (const j of run.jobs) Object.assign(j, { status: "completed", conclusion: "cancelled" });
      run.log.push("cancelled");
      return this.send(res, 202, {});
    }
    if (m === "GET" && (x = /^\/actions\/jobs\/(\d+)\/logs$/.exec(rest))) {
      const run = r.runs.find((rr) => rr.jobs.some((j) => j.id === Number(x![1])));
      return run ? this.send(res, 200, run.log.map((l) => `${iso()} ${l}`).join("\n"), "text/plain") : this.send(res, 404, { message: "Not Found" });
    }

    return this.send(res, 404, { message: `fake: no route ${m} ${rest}` });
  }
}

// ---- A ready-made project, used by the tests and the browser tests ----

export const sha = (n: number) => n.toString(16).padStart(2, "0").repeat(20);

export const TEST_CONFIG = `version: 1
name: Test Site
group: Tests
kind: Static · fake
branch: main
noDowntime: true
stages:
  - {id: local, name: Local, pushers: none, trigger: manual}
  - id: staging
    name: Staging
    url: https://staging.test.invalid/
    pushers: developers
    trigger: manual
    deploy: scripts/deploy.sh staging
    rollback: scripts/deploy.sh rollback staging {backup}
    smokeTest: [/]
    runner: github
  - id: live
    name: Live site
    url: https://test.invalid/
    pushers: code-owners
    trigger: manual
    deploy: scripts/deploy.sh live
    rollback: scripts/deploy.sh rollback live {backup}
    smokeTest: [/]
    runner: github
tools: {clearCache: scripts/clear-cache.sh}
`;

export function seedTestRepo(fake: FakeGitHub, name = "acme/site") {
  const commits = [sha(1), sha(2), sha(3), sha(4)];
  return fake.addRepo({
    name,
    config: TEST_CONFIG,
    codeowners: "* @owner\n",
    commits,
    prs: [
      { number: 11, title: "New contact page", body: "Adds a contact form.\npages: /contact/", files: ["contact.html", "style.css"], mergeSha: sha(3) },
      { number: 12, title: "Fix footer links", body: "", files: ["footer.html"], mergeSha: sha(4) },
    ],
    permissions: { owner: "admin", dev: "write", reader: "read" },
    deployed: { live: sha(2), staging: sha(4) },
  });
}
