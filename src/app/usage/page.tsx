import { BackLink, Page } from "@/components/ui";
import { apiUsage } from "@/lib/data";

export const dynamic = "force-dynamic";

const WHO: Record<string, string> = {
  app: "GitHub App (its own hourly limit)",
  "own-token": "Stage Director's own token (STAGEDIRECTOR_GITHUB_TOKEN)",
  "shared-token": "Shared token (GITHUB_TOKEN, e.g. from the gh CLI): other tools use the same hourly limit",
  none: "Not connected (demo data)",
};

const IDENTITY: Record<string, string> = { app: "GitHub App", "app-auth": "App sign-in (token)", person: "a person's own token", token: "Stage Director token", git: "git (local copy; not the API limit)" };

const CALLER: Record<string, string> = { page: "page view", poll: "timed refresh", action: "button press", runs: "run window", other: "other" };

export default function UsagePage() {
  const u = apiUsage();
  const reset = u.limit.resetAt ? new Date(u.limit.resetAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—";
  const w = u.wire;
  const main = w.budgets.find((b) => (b.key === "app:core" || b.key === "token:core") && b.resetAt > Date.now());
  // GitHub's own count for this window vs what this pool sent since it started (or the window began).
  const theirs = main ? Math.max(0, main.used - w.counted) : null;
  const reused = Math.max(0, w.requests - w.connectionsOpened);
  return (
    <Page>
      <BackLink href="/" label="All projects" />
      <h1 className="text-3xl font-extrabold">GitHub API usage</h1>
      <p className="text-muted">{WHO[u.identity]}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ["Left this hour", u.limit.remaining === null ? "—" : `${u.limit.remaining}${u.limit.total ? ` of ${u.limit.total}` : ""}`],
          ["Resets at", reset],
          ["Sent to GitHub, last hour", `${w.sent} (${w.counted} counted)`],
          ["GitHub counted this window", main ? String(main.used) : "—"],
          ["Last minute", `${w.lastMinute} (cap ${u.perMinute} in the background)`],
          ["Connections", `${w.connectionsOpened} opened, ${reused} reused`],
          ["git fetches, last hour", String(w.git)],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 rounded-[20px] bg-white p-4">
            <span className="text-sm font-bold text-muted">{k}</span>
            <span className="text-xl font-extrabold">{v}</span>
          </div>
        ))}
      </div>
      {theirs !== null && theirs > 0 && (
        <p className="rounded-[18px] bg-amber-soft p-4 text-[#6b4a12]">
          GitHub counted {theirs} more calls this window than this dashboard sent{main && w.startedAt > main.resetAt - 60 * 60_000 ? " since it started" : ""}: calls from before a restart, or from something else using the same identity (the gh CLI, scripts, other sessions).
          A token or GitHub App just for Stage Director avoids sharing the limit.
        </p>
      )}

      <section className="flex flex-col gap-2 rounded-[22px] bg-white p-5">
        <h2 className="text-xl font-extrabold">Sent to GitHub in the last hour</h2>
        <p className="text-sm text-muted">Every request that left Stage Director, counted at the connection pool: app sign-ins and calls made with a person&apos;s own token included. 304 answers do not count against GitHub&apos;s limit.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead className="text-sm text-muted">
              <tr><th className="py-2 pr-3">Endpoint</th><th className="pr-3">As</th><th className="pr-3">Sent</th><th className="pr-3">Unchanged (304)</th><th>Failed</th></tr>
            </thead>
            <tbody>
              {w.rows.length === 0 && <tr><td colSpan={5} className="py-3 text-muted">Nothing sent in the last hour.</td></tr>}
              {w.rows.map((r) => (
                <tr key={`${r.identity}|${r.route}`} className="border-t border-chip">
                  <td className="break-all py-2 pr-3 font-mono text-[13px]">{r.route}</td>
                  <td className="pr-3">{IDENTITY[r.identity] ?? r.identity}</td>
                  <td className="pr-3">{r.sent}</td><td className="pr-3">{r.notModified}</td><td>{r.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-[22px] bg-white p-5">
        <h2 className="text-xl font-extrabold">Why: what the dashboard asked for</h2>
        <p className="text-sm text-muted">Requests as the dashboard made them, before the pool. “Shared” and “held back” never reached GitHub.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead className="text-sm text-muted">
              <tr><th className="py-2 pr-3">Endpoint</th><th className="pr-3">From</th><th className="pr-3">Sent</th><th className="pr-3">Unchanged</th><th className="pr-3">Shared</th><th className="pr-3">Held back</th><th>Failed</th></tr>
            </thead>
            <tbody>
              {u.rows.length === 0 && <tr><td colSpan={7} className="py-3 text-muted">No GitHub calls in the last hour.</td></tr>}
              {u.rows.map((r) => (
                <tr key={`${r.route}|${r.caller}`} className="border-t border-chip">
                  <td className="break-all py-2 pr-3 font-mono text-[13px]">{r.route}</td>
                  <td className="pr-3">{CALLER[r.caller] ?? r.caller}</td>
                  <td className="pr-3">{r.ok}</td><td className="pr-3">{r.notModified}</td><td className="pr-3">{r.shared}</td><td className="pr-3">{r.held}</td><td>{r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-sm text-muted">Wire counts are saved to a small temporary file (github-calls.f32 in the system temp folder), so a restart keeps the last hour. The “why” table is memory only. Git data (branches, commits, how far behind) comes from a local copy; its git fetch and ls-remote runs are listed above as git and do not use the REST API limit.</p>
    </Page>
  );
}
