import Link from "next/link";

import { previewHref, type PreviewMode as Mode } from "./previewHref";

/**
 * Two-option switch: see this page as a code owner (you) or as a developer would.
 * The current view is shown selected and is not a link, so pressing it does nothing.
 * Display only: real roles still come from CODEOWNERS and every action is checked on the server.
 */
export function PreviewToggle({ base, sp, current }: { base: string; sp: Record<string, string | string[] | undefined>; current: Mode }) {
  const opts: { mode: Mode; label: string }[] = [
    { mode: "code-owner", label: "Code owner" },
    { mode: "developer", label: "Developer" },
  ];
  return (
    <div id="preview-as" className="flex flex-col items-center gap-2">
      <span className="text-sm font-bold text-muted">Preview this page as</span>
      <div role="group" aria-label="Preview this page as" className="flex rounded-[18px] bg-chip p-1">
        {opts.map((o) =>
          o.mode === current ? (
            <span key={o.mode} aria-current="true" className="flex min-h-[52px] items-center rounded-2xl bg-white px-6 font-extrabold text-ink shadow-[0_2px_8px_rgba(30,43,58,.1)]">
              {o.label}
            </span>
          ) : (
            <Link key={o.mode} href={previewHref(base, sp, o.mode)} scroll={false} className="flex min-h-[52px] items-center rounded-2xl px-6 font-bold text-blue">
              {o.label}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
