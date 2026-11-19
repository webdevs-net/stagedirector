import { currentLogin } from "./auth";

/**
 * Who is making this API request.
 * A Claude session acting for a person must send `X-Stagedirector-Agent: claude`;
 * it is then recorded as "claude:<login>" and can only make requests on
 * code-owner stages, never approve or push them.
 */
export async function requestActor(req: Request): Promise<string | null> {
  const login = await currentLogin();
  if (!login) return null;
  const agent = req.headers.get("x-stagedirector-agent")?.toLowerCase();
  return agent === "claude" ? `claude:${login}` : login;
}

/** Same-origin check for state-changing requests (CSRF guard). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}
