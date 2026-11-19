// Server-side replacement for src/lib/mock.ts: same function names, real data
// from GitHub (or built-in sample data when no credentials are set).
export { getProjects, getProject, getActivity, getRoleFor, performAction, getRunLog, dataSource, recordEvent } from "./data";
export { currentLogin } from "@/lib/auth/auth";
