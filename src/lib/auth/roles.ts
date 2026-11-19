import type { Role } from "@/lib/types";
import { CODEOWNERS_PATHS, deployOwners, parseCodeowners } from "./codeowners";

/** What getRole needs from GitHub. Kept small so tests can fake it. */
export interface RoleSource {
  /** Text of a file on the default branch, or null if missing. */
  readFile(repo: string, path: string): Promise<string | null>;
  /** Collaborator permission: "admin" | "maintain" | "write" | "triage" | "read" | "none". */
  permission(repo: string, login: string): Promise<string>;
  /** Is login a member of org/team? */
  inTeam(org: string, teamSlug: string, login: string): Promise<boolean>;
}

/** Strips the "claude:" prefix: a Claude session acts with its person's role, never more. */
export function personOf(actor: string): string {
  return actor.startsWith("claude:") ? actor.slice("claude:".length) : actor;
}

export async function getCodeowners(src: RoleSource, repo: string) {
  for (const path of CODEOWNERS_PATHS) {
    const text = await src.readFile(repo, path);
    if (text != null) return deployOwners(parseCodeowners(text));
  }
  return { users: [], teams: [] };
}

export async function isCodeOwner(src: RoleSource, repo: string, login: string): Promise<boolean> {
  const who = login.toLowerCase();
  const { users, teams } = await getCodeowners(src, repo);
  if (users.includes(who)) return true;
  for (const t of teams) {
    const [org, slug] = t.split("/");
    if (await src.inTeam(org, slug, who)) return true;
  }
  return false;
}

/**
 * viewer / developer / code-owner for one repo.
 * A code owner must also still have push access (removed collaborators lose
 * their rights even if CODEOWNERS is stale).
 */
export async function getRole(src: RoleSource, repo: string, actor: string): Promise<Role> {
  const login = personOf(actor);
  if (!login) return "viewer";
  const perm = await src.permission(repo, login).catch(() => "none");
  const canPush = ["admin", "maintain", "write"].includes(perm);
  if (!canPush) return "viewer";
  if (await isCodeOwner(src, repo, login)) return "code-owner";
  return "developer";
}
