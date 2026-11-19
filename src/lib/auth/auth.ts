import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

declare module "next-auth" {
  interface Session {
    login?: string;
  }
}

export const authConfigured = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Without credentials the provider list is empty and sign-in is unavailable;
  // pages still render read-only.
  providers: authConfigured ? [GitHub({ authorization: { params: { scope: "read:user" } } })] : [],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, profile }) {
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
