// Minimal CODEOWNERS parser following GitHub's rules: later rules win, a
// pattern without a slash matches at any depth, "/" anchors to the repo root,
// a trailing "/" matches a directory and everything in it.

export interface CodeownersRule {
  pattern: string;
  owners: string[]; // "@user", "@org/team" or "email"
}

export const CODEOWNERS_PATHS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"] as const;

export function parseCodeowners(text: string): CodeownersRule[] {
  const rules: CodeownersRule[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/(^|\s)#.*$/, "").trim();
    if (!line) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    rules.push({ pattern, owners });
  }
  return rules;
}

function globToRegExp(pattern: string): RegExp {
  let p = pattern;
  const anchored = p.startsWith("/") || p.slice(0, -1).includes("/");
  if (p.startsWith("/")) p = p.slice(1);
  const dir = p.endsWith("/");
  if (dir) p = p.slice(0, -1);
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*") {
      if (p[i + 1] === "*") {
        re += ".*";
        i++;
        if (p[i + 1] === "/") i++;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  const prefix = anchored ? "^" : "^(?:.*/)?";
  // A non-directory pattern also matches everything inside a directory of that name.
  return new RegExp(`${prefix}${re}${dir ? "/.*" : "(?:/.*)?"}$`);
}

/** Owners for one path (last matching rule wins). Empty array = no owners. */
export function ownersFor(rules: CodeownersRule[], path: string): string[] {
  const clean = path.replace(/^\//, "");
  let owners: string[] = [];
  for (const rule of rules) {
    if (rule.pattern === "*" || globToRegExp(rule.pattern).test(clean)) owners = rule.owners;
  }
  return owners;
}

/**
 * Code owners for deploy purposes are the owners of stagedirector.yml in the
 * repo (normally covered by a "*" rule). Returns lower-cased logins and teams
 * without the "@".
 */
export function deployOwners(rules: CodeownersRule[]): { users: string[]; teams: string[] } {
  const users: string[] = [];
  const teams: string[] = [];
  for (const o of ownersFor(rules, "stagedirector.yml")) {
    if (!o.startsWith("@")) continue; // emails cannot be mapped to a GitHub login reliably
    const name = o.slice(1).toLowerCase();
    (name.includes("/") ? teams : users).push(name);
  }
  return { users, teams };
}
