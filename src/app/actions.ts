"use server";

// Server actions. Each is triggered by a person pressing a button; none
// approves or pushes live on its own. Runs go through the mock run interface
// (getActiveRuns/startRun/stopRun in src/lib/mock.ts), which the data layer
// will replace with GitHub workflow runs.
import * as data from "@/lib/mock";

export async function startRunAction(repo: string, stageId: string, kind: data.RunKind) {
  return data.startRun(repo, stageId, kind);
}

export async function listRunsAction() {
  return data.getActiveRuns();
}

export async function stopRunAction(runId: string) {
  await data.stopRun(runId);
}

export async function approveForLive(repo: string, commit: string): Promise<{ ok: boolean }> {
  console.log("[stub] approve", repo, commit);
  return { ok: true };
}
