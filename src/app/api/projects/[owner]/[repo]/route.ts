import { NextResponse } from "next/server";
import { currentLogin } from "@/lib/auth/auth";
import { getActivity, getProject, getRoleFor } from "@/lib/github/data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await ctx.params;
  const full = `${owner}/${repo}`;
  const login = await currentLogin();
  const project = await getProject(full, login);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [role, activity] = await Promise.all([getRoleFor(full, login), getActivity(full)]);
  return NextResponse.json({ project, role, activity });
}
