"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { listRunsAction, startRunAction, stopRunAction } from "@/app/actions";
import type { ActiveRun, RunKind } from "@/lib/data";
import { announceChange } from "@/components/LiveRefresh";

interface RunsCtx {
  runs: ActiveRun[];
  start: (repo: string, stageId: string, kind: RunKind, commit?: string) => Promise<string | null>;
  stop: (runId: string) => Promise<string | null>;
  runFor: (repo: string) => ActiveRun | undefined;
}

const Ctx = createContext<RunsCtx>({ runs: [], start: async () => null, stop: async () => null, runFor: () => undefined });

export function useRuns() {
  return useContext(Ctx);
}

export function RunsProvider({ children, idleMs = 60_000 }: { children: ReactNode; idleMs?: number }) {
  const [runs, setRuns] = useState<ActiveRun[]>([]);

  const refresh = useCallback(async () => {
    try {
      setRuns(await listRunsAction());
    } catch {
      /* offline or server restarting: keep last state */
    }
  }, []);

  const anyRunning = runs.some((r) => r.state === "running");
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !anyRunning) announceChange(); // a run just ended: re-read stages
    wasRunning.current = anyRunning;
  }, [anyRunning]);
  useEffect(() => {
    refresh();
    // Follow a run closely while one is going; otherwise check rarely, and never in a hidden tab.
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, anyRunning ? 5000 : idleMs);
    return () => clearInterval(t);
  }, [refresh, anyRunning, idleMs]);

  const start = useCallback(
    async (repo: string, stageId: string, kind: RunKind, commit?: string) => {
      const r = await startRunAction(repo, stageId, kind, commit);
      await refresh();
      announceChange();
      return "error" in r ? r.error : null;
    },
    [refresh],
  );

  const stop = useCallback(
    async (id: string) => {
      const err = await stopRunAction(id);
      await refresh();
      announceChange();
      return err;
    },
    [refresh],
  );

  const runFor = useCallback((repo: string) => runs.find((r) => r.repo === repo && r.state === "running"), [runs]);

  return <Ctx.Provider value={{ runs, start, stop, runFor }}>{children}</Ctx.Provider>;
}
