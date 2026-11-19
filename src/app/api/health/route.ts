// Liveness check for Docker's healthcheck and `tailscale serve`. Says nothing
// about projects or credentials beyond which data source is in use.
import { dataSource } from "@/lib/github";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, source: dataSource() });
}
