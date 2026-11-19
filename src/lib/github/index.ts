// Server-side replacement for src/lib/mock.ts: same function names, real data
// from GitHub (or built-in sample data when no credentials are set).
export { getProjects, getProject, getActivity, getRoleFor, performAction, getRunLog, dataSource, getLiveRuns, getLatestRunLog } from "./data";
export { currentLogin } from "@/lib/auth/auth";
export type { LiveRun } from "./data";
