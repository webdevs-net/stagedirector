"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard?.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="min-h-[52px] rounded-2xl bg-blue px-5 text-[17px] font-extrabold text-white hover:bg-[#1f4f94]"
    >
      {done ? "Copied" : label}
    </button>
  );
}
