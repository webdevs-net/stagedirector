import type { ProjectView } from "@/lib/data";
import { barColors } from "./status";

export function StageBars({ p, small = false }: { p: ProjectView; small?: boolean }) {
  const colors = barColors(p);
  return (
    <span className="flex gap-1.5" role="img" aria-label={`Stages: ${p.config.stages.map((s) => s.name).join(", ")}`}>
      {colors.map((c, i) => (
        <span key={i} className={`${small ? "h-[9px] w-[22px]" : "h-[10px] w-7"} rounded-full`} style={{ background: c }} />
      ))}
    </span>
  );
}
