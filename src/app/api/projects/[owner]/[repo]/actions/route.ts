import { NextResponse } from "next/server";
import { z } from "zod";
import { requestActor, sameOrigin } from "@/lib/auth/request";
import { performAction } from "@/lib/github/data";

export const dynamic = "force-dynamic";

const body = z.object({
  stageId: z.string().min(1),
  action: z.enum(["deploy", "rollback", "pin", "unpin", "clear-cache", "snapshot", "stop", "approve"]),
  commit: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  runId: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ owner: string; repo: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "cross-site request refused" }, { status: 403 });
  const actor = await requestActor(req);
  if (!actor) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  const { owner, repo } = await ctx.params;
  try {
    const result = await performAction(actor, { repo: `${owner}/${repo}`, ...parsed.data });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: `GitHub error: ${(e as Error).message}` }, { status: 502 });
  }
}
