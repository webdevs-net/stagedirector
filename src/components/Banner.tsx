import type { ReactNode } from "react";
import { ButtonLink, Icon } from "./ui";

type Kind = "busy" | "sync" | "undid" | "quiet" | "ready";

const STYLE: Record<Kind, { bg: string; dot: string; icon: "refresh" | "alert" | "lock" | "check" | "globe" }> = {
  busy: { bg: "bg-blue-soft", dot: "bg-blue", icon: "refresh" },
  sync: { bg: "bg-[#fdf1e3]", dot: "bg-[#d9822b]", icon: "alert" },
  undid: { bg: "bg-red-soft", dot: "bg-[#d64545]", icon: "refresh" },
  quiet: { bg: "bg-chip", dot: "bg-muted", icon: "lock" },
  ready: { bg: "bg-teal-soft", dot: "bg-teal", icon: "check" },
};

export function Banner({ kind, title, detail, action }: { kind: Kind; title: string; detail?: ReactNode; action?: { label: string; href: string } }) {
  const s = STYLE[kind];
  return (
    <div role={kind === "undid" || kind === "sync" ? "alert" : "status"} className={`flex flex-wrap items-center gap-3.5 rounded-[20px] px-4 py-3.5 ${s.bg}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${s.dot}`}>
        <Icon name={s.icon} />
      </span>
      <span className="flex min-w-[200px] flex-1 flex-col">
        <span className="text-[17px] font-extrabold">{title}</span>
        {detail && <span className="text-[15px] text-soft">{detail}</span>}
      </span>
      {action && <ButtonLink href={action.href}>{action.label}</ButtonLink>}
    </div>
  );
}
