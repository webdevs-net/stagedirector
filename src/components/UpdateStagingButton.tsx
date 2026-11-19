"use client";

import { ActionButton } from "./ActionButton";
import { Icon } from "./ui";

export function UpdateStagingButton({ repo, stageId, label }: { repo: string; stageId: string; label: string }) {
  return (
    <ActionButton act="run" repo={repo} stageId={stageId} kind="update" className="min-h-[72px] w-full rounded-[22px] bg-teal text-[21px] text-white shadow-[0_8px_20px_rgba(15,143,138,.28)]">
      <Icon name="refresh" size={24} /> {label}
    </ActionButton>
  );
}
