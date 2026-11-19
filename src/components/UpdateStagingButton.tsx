"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateStaging } from "@/app/actions";
import { Icon } from "./ui";

export function UpdateStagingButton({ repo, href, label, disabled }: { repo: string; href: string; label: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          await updateStaging(repo);
          router.push(href);
        })
      }
      className="flex min-h-[72px] items-center justify-center gap-3 rounded-[22px] bg-teal text-[21px] font-extrabold text-white shadow-[0_8px_20px_rgba(15,143,138,.28)] disabled:opacity-60"
    >
      <Icon name="refresh" size={24} />
      {pending ? "Starting…" : label}
    </button>
  );
}
