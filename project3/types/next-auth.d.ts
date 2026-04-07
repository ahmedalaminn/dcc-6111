import "next-auth";
import "next-auth/jwt";

type PersistedScanPreferences = {
  scanMode?: "quick" | "standard" | "deep" | "custom";
  customCommitDepth?: number;
  lagThresholdMode?: "strict" | "balanced" | "relaxed" | "custom";
  customLagCommitThreshold?: number;
  customLagNoSyncDaysThreshold?: number;
  selectedRepoIds?: number[];
};

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    githubLogin?: string;
    scanPreferences?: PersistedScanPreferences;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    login?: string;
    scanPreferences?: PersistedScanPreferences;
  }
}
