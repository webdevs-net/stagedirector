import { NextResponse } from "next/server";
import { requestActor } from "@/lib/auth/request";
import { openRequests } from "@/lib/github/data";

export const dynamic = "force-dynamic";

/** Open requests from Claude sessions for this project. */
export async function GET(req: Request, ctx: { params: Promise<{ owner: string; repo: string }> }) {
  if (!(await requestActor(req))) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { owner, repo } = await ctx.params;
  return NextResponse.json({ requests: await openRequests(`${owner}/${repo}`) });
}
