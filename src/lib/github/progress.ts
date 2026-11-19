import { RUN_STEPS } from "@/lib/shared";

// Turns a GitHub Actions run's jobs/steps into the four plain steps the
// screens show. Pure, so it can be tested without GitHub.

export interface GhStep {
  name: string;
  status: string; // queued | in_progress | completed
  conclusion: string | null;
}
export interface GhJob {
  name: string;
  status: string;
  conclusion: string | null;
  steps?: GhStep[];
}

export interface Progress {
  step: number; // index into the plain steps
  progress: number; // 0..100
  steps: string[];
}

/**
 * Which plain step a workflow step belongs to. The engine's workflow
 * (engine/workflow/stagedirector.yml) has a "Check rules" gate job and a run
 * job whose main step "Run <action>" saves the backup, copies files and runs
 * the smoke test. Setup steps count as "checking"; the main step as copying;
 * clean-up as the last check.
 */
export function plainStepOf(jobName: string, stepName: string): number {
  const s = stepName.toLowerCase();
  if (/check rules/i.test(jobName)) return 0;
  if (/^run (deploy|rollback|clear-cache|pin|unpin)\b/.test(s) || s.startsWith("run ")) return 2;
  if (/clean ?up|post |complete job/.test(s)) return 3;
  if (/backup|snapshot/.test(s)) return 1;
  return 0;
}

export function mapProgress(jobs: GhJob[], steps: string[] = RUN_STEPS): Progress {
  const all = jobs.flatMap((j) => (j.steps ?? []).map((s) => ({ ...s, job: j.name })));
  // Before GitHub reports steps, show the first step with a sliver of progress.
  if (all.length === 0) return { step: 0, progress: jobs.length ? 5 : 2, steps };
  // The run job is only listed once the gate finishes: count it as ~8 more steps so the bar does not jump to 100%.
  const runJobListed = jobs.some((j) => !/check rules/i.test(j.name));
  const total = all.length + (runJobListed ? 0 : 8);
  const done = all.filter((s) => s.status === "completed").length;
  const current = all.find((s) => s.status === "in_progress") ?? all.find((s) => s.status !== "completed");
  let step = current ? plainStepOf(current.job, current.name) : steps.length - 1;
  step = Math.min(step, steps.length - 1);
  const progress = Math.max(2, Math.min(99, Math.round((done / total) * 100)));
  return { step, progress, steps };
}
