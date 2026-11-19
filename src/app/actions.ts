"use server";

// Stubbed server actions. The data layer will replace these with calls that
// start GitHub workflow runs. They never approve or push live on their own:
// each one is triggered by a person pressing a button.

export async function updateStaging(repo: string): Promise<{ ok: boolean }> {
  console.log("[stub] update staging", repo);
  return { ok: true };
}

export async function approveForLive(repo: string, commit: string): Promise<{ ok: boolean }> {
  console.log("[stub] approve", repo, commit);
  return { ok: true };
}

export async function putLive(repo: string, commit: string): Promise<{ ok: boolean }> {
  console.log("[stub] put live", repo, commit);
  return { ok: true };
}

export async function stopRun(repo: string): Promise<{ ok: boolean }> {
  console.log("[stub] stop", repo);
  return { ok: true };
}

export async function undoEvent(repo: string, eventId: string): Promise<{ ok: boolean }> {
  console.log("[stub] undo", repo, eventId);
  return { ok: true };
}
