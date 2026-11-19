"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { listRunsAction, startRunAction, stopRunAction } from "@/app/actions";
import type { ActiveRun, RunKind } from "@/lib/mock";

interface RunsCtx {
  runs: ActiveRun[];
  start: (repo: string, stageId: string, kind: RunKind) => Promise<string | null>;
  stop: (runId: string) => Promise<void>;
  runFor: (repo: string) => ActiveRun | undefined;
}

const Ctx = createContext<RunsCtx>({ runs: [], start: async () => null, stop: async () => {}, runFor: () => undefined });

export function useRuns() {
  return useContext(Ctx);
}

export function RunsProvider({ children }: { children: ReactNode }) {
  const [runs, setRuns] = useState<ActiveRun[]>([]);

  const refresh = useCallback(async () => {
    try {
      setRuns(await listRunsAction());
    } catch {
      /* offline or server restarting: keep last state */
    }
  }, []);

  const anyRunning = runs.some((r) => r.state === "running");
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, anyRunning ? 1000 : 5000);
    return () => clearInterval(t);
  }, [refresh, anyRunning]);

  const start = useCallback(
    async (repo: string, stageId: string, kind: RunKind) => {
      const r = await startRunAction(repo, stageId, kind);
      await refresh();
      return "error" in r ? r.error : null;
    },
    [refresh],
  );

  const stop = useCallback(
    async (id: string) => {
      await stopRunAction(id);
      await refresh();
    },
    [refresh],
  );

  const runFor = useCallback((repo: string) => runs.find((r) => r.repo === repo && r.state === "running"), [runs]);

  return <Ctx.Provider value={{ runs, start, stop, runFor }}>{children}</Ctx.Provider>;
}
