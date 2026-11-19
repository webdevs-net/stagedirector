import { NextResponse } from "next/server";
import { currentLogin } from "@/lib/auth/auth";
import { dataSource, getProjects } from "@/lib/github/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const login = await currentLogin();
  const projects = await getProjects(login);
  return NextResponse.json({ source: dataSource(), login, projects });
}
