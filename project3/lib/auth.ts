import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

const SCAN_MODES = new Set(["quick", "standard", "deep", "custom"]);
const LAG_THRESHOLD_MODES = new Set(["strict", "balanced", "relaxed", "custom"]);

type PersistedScanPreferences = {
  scanMode?: "quick" | "standard" | "deep" | "custom";
  customCommitDepth?: number;
  lagThresholdMode?: "strict" | "balanced" | "relaxed" | "custom";
  customLagCommitThreshold?: number;
  customLagNoSyncDaysThreshold?: number;
  selectedRepoIds?: number[];
};

function toOptionalInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function sanitizeScanPreferences(value: unknown): PersistedScanPreferences | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const scanMode = typeof candidate.scanMode === "string" && SCAN_MODES.has(candidate.scanMode)
    ? (candidate.scanMode as PersistedScanPreferences["scanMode"])
    : undefined;
  const lagThresholdMode =
    typeof candidate.lagThresholdMode === "string" && LAG_THRESHOLD_MODES.has(candidate.lagThresholdMode)
      ? (candidate.lagThresholdMode as PersistedScanPreferences["lagThresholdMode"])
      : undefined;
  const customCommitDepth = toOptionalInt(candidate.customCommitDepth);
  const customLagCommitThreshold = toOptionalInt(candidate.customLagCommitThreshold);
  const customLagNoSyncDaysThreshold = toOptionalInt(candidate.customLagNoSyncDaysThreshold);
  const selectedRepoIds = Array.isArray(candidate.selectedRepoIds)
    ? candidate.selectedRepoIds
        .map((id) => toOptionalInt(id))
        .filter((id): id is number => typeof id === "number" && id > 0)
    : undefined;

  if (
    !scanMode &&
    !lagThresholdMode &&
    !customCommitDepth &&
    !customLagCommitThreshold &&
    !customLagNoSyncDaysThreshold &&
    (!selectedRepoIds || selectedRepoIds.length === 0)
  ) {
    return undefined;
  }

  return {
    scanMode,
    customCommitDepth,
    lagThresholdMode,
    customLagCommitThreshold,
    customLagNoSyncDaysThreshold,
    selectedRepoIds,
  };
}

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
    async jwt({ token, account, profile, trigger, session }) {
      if (account?.provider === "github") {
        token.accessToken = account.access_token;
      }

      if (profile && "login" in profile) {
        token.login = String(profile.login);
      }

      if (trigger === "update") {
        const updatedPreferences = sanitizeScanPreferences((session as { scanPreferences?: unknown } | undefined)?.scanPreferences);
        if (updatedPreferences) {
          token.scanPreferences = updatedPreferences;
        } else {
          token.scanPreferences = undefined;
        }
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
      session.scanPreferences = sanitizeScanPreferences(token.scanPreferences);

      return session;
    },
  },
};