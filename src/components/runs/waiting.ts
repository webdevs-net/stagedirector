// Text for a run that sits in the queue because no runner with its label is online.

/** Whole minutes since `startedAt` (never below 1, so a stuck run never reads "0 min"). */
export function waitedMinutes(startedAt: number, now = Date.now()): number {
  return Math.max(1, Math.floor((now - startedAt) / 60_000));
}

export function waitingText(label: string, startedAt?: number, now = Date.now()) {
  const mins = startedAt ? ` ${waitedMinutes(startedAt, now)} min` : "";
  return `Waiting for a runner${mins} — none is online for ${label}`;
}
