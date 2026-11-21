import { currentLogin } from "@/lib/auth/auth";
import { dataSource } from "@/lib/github/data";
import { readShot } from "@/lib/github/screens";

export const dynamic = "force-dynamic";

/** One review screenshot from the dashboard's cache (downloaded from the run artifact). */
export async function GET(_req: Request, { params }: { params: Promise<{ repo: string; id: string; file: string }> }) {
  if (dataSource() === "github" && !(await currentLogin())) return new Response("sign in first", { status: 401 });
  const { repo, id, file } = await params;
  const bytes = await readShot(decodeURIComponent(repo).replace("~", "/"), id, file).catch(() => null);
  if (!bytes) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400, immutable" },
  });
}
