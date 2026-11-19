import { BackLink, Page } from "@/components/ui";
import { apiUsage } from "@/lib/data";

export const dynamic = "force-dynamic";

const WHO: Record<string, string> = {
  app: "GitHub App (its own hourly limit)",
  "own-token": "Stage Director's own token (STAGEDIRECTOR_GITHUB_TOKEN)",
  "shared-token": "Shared token (GITHUB_TOKEN, e.g. from the gh CLI): other tools use the same hourly limit",
  none: "Not connected (demo data)",
};

const CALLER: Record<string, string> = { page: "page view", poll: "timed refresh", action: "button press", runs: "run window", other: "other" };

export default function UsagePage() {
  const u = apiUsage();
  const reset = u.limit.resetAt ? new Date(u.limit.resetAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—";
  const theirs = u.limit.total !== null && u.limit.remaining !== null ? Math.max(0, u.limit.total - u.limit.remaining - u.counted) : null;
  return (
    <Page>
      <BackLink href="/" label="All projects" />
      <h1 className="text-3xl font-extrabold">GitHub API usage</h1>
      <p className="text-muted">{WHO[u.identity]}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Left this hour", u.limit.remaining === null ? "—" : `${u.limit.remaining}${u.limit.total ? ` of ${u.limit.total}` : ""}`],
          ["Resets at", reset],
          ["Ours, last hour", String(u.counted)],
          ["Last minute", `${u.lastMinute} (cap ${u.perMinute} in the background)`],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 rounded-[20px] bg-white p-4">
            <span className="text-sm font-bold text-muted">{k}</span>
            <span className="text-xl font-extrabold">{v}</span>
          </div>
        ))}
      </div>
      {theirs !== null && theirs > 0 && (
        <p className="rounded-[18px] bg-amber-soft p-4 text-[#6b4a12]">
          About {theirs} calls this hour came from somewhere else using the same token (the gh CLI, scripts, other sessions).
          A token or GitHub App just for Stage Director avoids sharing the limit.
        </p>
      )}

      <section className="flex flex-col gap-2 rounded-[22px] bg-white p-5">
        <h2 className="text-xl font-extrabold">Calls in the last hour</h2>
        <p className="text-sm text-muted">Only “sent” and “failed” count against GitHub’s limit. “Unchanged” (304) answers, shared and held-back calls are free.</p>
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
      <p className="text-sm text-muted">Counts are kept in memory and start again when the dashboard restarts. Git data (branches, commits, how far behind) is read from a local copy with git fetch and does not appear here.</p>
    </Page>
  );
}
