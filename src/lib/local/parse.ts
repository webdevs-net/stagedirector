export interface LocalFile { path: string; state: "changed" | "added" | "deleted" | "new" | "renamed" | "conflict" }
export interface LocalCommit { sha: string; subject: string; at: string }
export interface LocalWork {
  path: string;
  branch: string;
  head: string;
  upstream: string | null;
  files: LocalFile[];
  unpushed: LocalCommit[];
  behind: number;
  pushCommand: string;
}

/** "owner/repo=/path, owner/b=/other" → map. */
export function parseLocalPaths(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of s.split(/[,;\n]+/)) {
    const m = /^\s*([\w.-]+\/[\w.-]+)\s*=\s*(.+?)\s*$/.exec(part);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function parsePorcelain(text: string): LocalFile[] {
  return text
    .split("\n")
    .filter((l) => l.length > 3)
    .map((l) => {
      const xy = l.slice(0, 2);
      let p = l.slice(3);
      if (p.includes(" -> ")) p = p.split(" -> ")[1];
      p = p.replace(/^"(.*)"$/, "$1");
      const state: LocalFile["state"] =
        xy === "??" ? "new"
        : /U|AA|DD/.test(xy) ? "conflict"
        : xy.includes("R") ? "renamed"
        : xy.includes("D") ? "deleted"
        : xy.includes("A") ? "added"
        : "changed";
      return { path: p, state };
    });
}

export function parseLog(text: string): LocalCommit[] {
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, subject, at] = l.split("\x1f");
      return { sha, subject, at };
    });
}
