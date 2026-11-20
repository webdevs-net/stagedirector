import type { RunnerHealth } from "@/lib/data";
import { Banner } from "./Banner";

export function sinceText(iso?: string | null): string {
  if (!iso) return "";
  return ` since ${new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`;
}

/** One line per runner: coloured dot + online / offline since … / busy / status unknown. */
export function RunnerLine({ h, usedBy }: { h: RunnerHealth; usedBy?: string }) {
  const dot = h.state === "online" ? "bg-teal" : h.state === "busy" ? "bg-blue" : h.state === "offline" ? "bg-amber" : "bg-muted";
  const word = h.state === "offline" ? `offline${sinceText(h.offlineSince)}` : h.state === "unknown" ? "status unknown" : h.state;
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full ${dot}`} />
      <span>
        Runner “{h.label}” · <span className="font-bold">{word}</span>
        {usedBy ? ` · used by ${usedBy}` : ""}
      </span>
    </div>
  );
}

/** Warns on the project page when a stage's runner is offline. */
export function RunnerBanner({ health, stages }: { health: Record<string, RunnerHealth>; stages: { name: string; runner?: string }[] }) {
  const down = Object.values(health).filter((h) => h.state === "offline");
  if (!down.length) return null;
  return (
    <>
      {down.map((h) => (
        <Banner
          key={h.label}
          kind="sync"
          title={`The runner on ${h.label} is offline. Updates will wait until it's back.`}
          detail={
            <>
              Affects {stages.filter((s) => s.runner === h.label).map((s) => s.name).join(", ")}{sinceText(h.offlineSince)}. Buttons for those stages will say so instead of starting.{" "}
              <a href="https://github.com/webdevs-net/stagedirector/blob/main/engine/runner/README.md#when-the-runner-is-offline" target="_blank" rel="noreferrer" className="font-bold text-blue underline">How to bring it back</a>
            </>
          }
        />
      ))}
    </>
  );
}
