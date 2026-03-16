import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          // Includes private repositories and requests access to private email addresses.
          scope: "read:user user:email repo",
        },
      },
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.name ?? profile.login,
          email: profile.email,
          image: profile.avatar_url,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "github") {
        token.accessToken = account.access_token;
      }

      if (profile && "login" in profile) {
        token.login = String(profile.login);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
      }

      session.accessToken = typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.githubLogin = typeof token.login === "string" ? token.login : undefined;

      return session;
    },
  },
};