import type { ProjectView } from "@/lib/data";
import { barColors } from "./status";
import { commitLabel } from "@/lib/wording";

/** Hover text for one bar: "Beta · v1.4.0 · 41ab2c9". */
function stageTitle(p: ProjectView, i: number): string | undefined {
  const s = p.config.stages[i];
  if (!s) return undefined;
  const st = p.stages.find((x) => x.stageId === s.id);
  const label = commitLabel(st?.commit, st?.version);
  return label ? `${s.name} · ${label}` : s.name;
}

export function StageBars({ p, small = false }: { p: ProjectView; small?: boolean }) {
  const colors = barColors(p);
  return (
    <span className="flex gap-1.5" role="img" aria-label={`Stages: ${p.config.stages.map((s) => s.name).join(", ")}`}>
      {colors.map((c, i) => (
        <span key={i} title={stageTitle(p, i)} className={`${small ? "h-[9px] w-[22px]" : "h-[10px] w-7"} rounded-full`} style={{ background: c }} />
      ))}
    </span>
  );
}
