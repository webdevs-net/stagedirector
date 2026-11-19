import { NextResponse } from "next/server";
import { currentLogin } from "@/lib/auth/auth";
import { getRoleFor, getRunLog } from "@/lib/github/data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ owner: string; repo: string; runId: string }> }) {
  const { owner, repo, runId } = await ctx.params;
  const full = `${owner}/${repo}`;
  const login = await currentLogin();
  // Logs can contain server paths; only people with push access may read them.
  if ((await getRoleFor(full, login)) === "viewer") return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const id = Number(runId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "bad run id" }, { status: 400 });
  const log = await getRunLog(full, id);
  if (log == null) return NextResponse.json({ error: "not available" }, { status: 404 });
  return new NextResponse(log, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
