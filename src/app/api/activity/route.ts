import { NextResponse } from "next/server";
import { currentLogin } from "@/lib/auth/auth";
import { filterFromParams, toCsv } from "@/lib/activity";
import { getAllActivity } from "@/lib/data";
import { dataSource } from "@/lib/github/data";

export const dynamic = "force-dynamic";

/** Activity record across projects. `?format=csv` downloads it; the other params filter (see src/lib/activity.ts). */
export async function GET(req: Request) {
  if (dataSource() === "github" && !(await currentLogin())) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const rows = await getAllActivity(filterFromParams(sp));
  if (sp.format === "csv") {
    const day = new Date().toISOString().slice(0, 10);
    const name = `stagedirector-activity-${sp.repo ? sp.repo.replace(/[^\w.-]+/g, "-") + "-" : ""}${day}.csv`;
    return new Response(toCsv(rows), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
    });
  }
  return NextResponse.json({ events: rows });
}
