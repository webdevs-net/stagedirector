import { NextResponse } from "next/server";
import { z } from "zod";
import { requestActor, sameOrigin } from "@/lib/auth/request";
import { answerRequest } from "@/lib/github/data";

export const dynamic = "force-dynamic";

const body = z.object({ answer: z.enum(["ok", "decline"]) });

/**
 * A person OKs or declines a Claude session's request. Sent with
 * X-Stagedirector-Agent: claude the actor is "claude:<login>" and is always refused.
 */
export async function POST(req: Request, ctx: { params: Promise<{ owner: string; repo: string; id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "cross-site request refused" }, { status: 403 });
  const actor = await requestActor(req);
  if (!actor) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { owner, repo, id } = await ctx.params;
  try {
    const r = await answerRequest(actor, `${owner}/${repo}`, id, parsed.data.answer === "ok");
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: `GitHub error: ${(e as Error).message}` }, { status: 502 });
  }
}
