import Link from "next/link";
import { Icon } from "@/components/ui";

type Tab = "overview" | "history" | "toolbox";

// One quiet bar across the top of every project page, like App Store Connect:
// where you are on the left, the project's sections on the right.
export function ProjectNav({ name, base, q, active }: { name: string; base: string; q: string; active: Tab }) {
  const tabs: { id: Tab; label: string; href: string }[] = [
    { id: "overview", label: "Overview", href: `${base}${q}` },
    { id: "history", label: "History", href: `${base}/history${q}` },
    { id: "toolbox", label: "Toolbox", href: `${base}/toolbox${q}` },
  ];
  return (
    <div className="sticky top-0 z-20 -mt-8 mb-2 ml-[calc(50%-50vw)] w-screen border-b border-[#dde6ef] bg-bg/85 px-4 backdrop-blur sm:-mt-10 sm:px-6">
      <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-x-6">
        <div className="flex min-h-[56px] min-w-0 items-center gap-2 font-bold">
          <Link href="/" className="inline-flex items-center gap-1.5 text-muted hover:text-ink" aria-label="All projects">
            <Icon name="back" size={16} /> Projects
          </Link>
          <span aria-hidden="true" className="text-[#b9c7d6]">/</span>
          <span className="truncate font-extrabold">{name}</span>
        </div>
        <nav aria-label="Project" className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <Link
                key={t.id}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`relative inline-flex min-h-[56px] items-center px-3.5 font-bold transition-colors ${on ? "text-ink" : "text-muted hover:text-ink"}`}
              >
                {t.label}
                <span aria-hidden="true" className={`absolute inset-x-3.5 bottom-0 h-[3px] rounded-full ${on ? "bg-teal" : "bg-transparent"}`} />
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
