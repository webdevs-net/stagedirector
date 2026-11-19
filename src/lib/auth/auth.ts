import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { getToken } from "next-auth/jwt";
import { headers } from "next/headers";

declare module "next-auth" {
  interface Session {
    login?: string;
  }
}

export const authConfigured = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Without credentials the provider list is empty and sign-in is unavailable;
  // pages still render read-only.
  // Scope: the engine only accepts live approvals and live runs made with the code owner's
  // OWN GitHub identity (engine/contract.md "Live gate"), so the dashboard asks for `repo`
  // (commit statuses + starting workflow runs). Set AUTH_GITHUB_SCOPE=read:user for a
  // read-only dashboard. The token stays in the encrypted session cookie, server side only.
  providers: authConfigured ? [GitHub({ authorization: { params: { scope: process.env.AUTH_GITHUB_SCOPE || "read:user repo" } } })] : [],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, profile, account }) {
      if (account?.access_token) token.ghToken = account.access_token;
      if (profile && typeof (profile as { login?: unknown }).login === "string") {
        token.login = (profile as { login: string }).login;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.login === "string") session.login = token.login;
      return session;
    },
  },
});

/**
 * GitHub login of the signed-in person, or null.
 * STAGEDIRECTOR_DEV_LOGIN lets local development act as someone without
 * OAuth; it is ignored in production builds.
 */
export async function currentLogin(): Promise<string | null> {
  if (process.env.NODE_ENV !== "production" && process.env.STAGEDIRECTOR_DEV_LOGIN) {
    return process.env.STAGEDIRECTOR_DEV_LOGIN;
  }
  if (!authConfigured) return null;
  const session = await auth();
  return session?.login ?? null;
}

/**
 * The signed-in person's own GitHub token (server side only; never sent to the
 * browser). Used where GitHub must see the person, not the dashboard: live
 * approvals (commit status) and live runs. In local development with
 * STAGEDIRECTOR_DEV_LOGIN it is STAGEDIRECTOR_DEV_TOKEN, if set.
 */
export async function currentGithubToken(): Promise<string | null> {
  if (process.env.NODE_ENV !== "production" && process.env.STAGEDIRECTOR_DEV_LOGIN) {
    return process.env.STAGEDIRECTOR_DEV_TOKEN || null;
  }
  if (!authConfigured || !process.env.AUTH_SECRET) return null;
  const secure = (process.env.AUTH_URL ?? "").startsWith("https://") || process.env.NODE_ENV === "production";
  const t = await getToken({ req: { headers: await headers() }, secret: process.env.AUTH_SECRET, secureCookie: secure }).catch(() => null);
  return typeof t?.ghToken === "string" ? t.ghToken : null;
}
