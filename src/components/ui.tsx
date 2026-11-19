import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "teal" | "blue" | "amber" | "plain" | "white" | "red";

const TONES: Record<Tone, string> = {
  teal: "bg-teal text-white shadow-[0_8px_20px_rgba(15,143,138,.28)]",
  blue: "bg-blue text-white shadow-[0_8px_20px_rgba(37,99,184,.25)]",
  amber: "bg-amber-soft text-[#7a4800]",
  plain: "bg-chip text-ink",
  white: "bg-white text-ink shadow-[0_2px_10px_rgba(30,43,58,.08)]",
  red: "bg-red-soft text-red",
};

const base =
  "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-5 text-base font-extrabold no-underline transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-100";

export function ButtonLink({ href, tone = "white", className = "", children, external }: { href: string; tone?: Tone; className?: string; children: ReactNode; external?: boolean }) {
  if (external || href.startsWith("http")) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={`${base} ${TONES[tone]} ${className}`}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={`${base} ${TONES[tone]} ${className}`}>
      {children}
    </Link>
  );
}

export function Button({ tone = "white", className = "", children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button type="button" className={`${base} ${TONES[tone]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Card({ children, className = "", ...rest }: React.HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={`rounded-[28px] bg-white p-5 shadow-[0_6px_24px_rgba(30,43,58,.07)] sm:p-7 ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function Chevron() {
  return (
    <svg className="chev shrink-0 transition-transform" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function Icon({ name, size = 20, className = "" }: { name: "lock" | "check" | "plus" | "refresh" | "alert" | "globe" | "arrow" | "star" | "back"; size?: number; className?: string }) {
  const paths: Record<string, ReactNode> = {
    lock: (<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
    check: <path d="m5 12 5 5 9-10" />,
    plus: <path d="M12 5v14M5 12h14" />,
    refresh: (<><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>),
    alert: (<><path d="M12 8v5" /><path d="M12 16h.01" /></>),
    globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" /></>),
    arrow: (<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>),
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
    back: (<><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {paths[name]}
    </svg>
  );
}

export function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-[44px] items-center gap-2 font-bold text-blue">
      <Icon name="back" size={18} /> {label}
    </Link>
  );
}

export function Page({ children, width = "max-w-[960px]" }: { children: ReactNode; width?: string }) {
  return <div className={`mx-auto flex flex-col gap-6 ${width}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-extrabold tracking-wider text-muted">{children}</h2>;
}
