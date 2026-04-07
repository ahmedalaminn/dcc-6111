import { Octokit } from "octokit";

type GitHubApiError = Error & {
  status?: number;
  response?: {
    data?: unknown;
    headers?: Record<string, string>;
  };
};

function formatGitHubError(error: unknown) {
  const err = error as GitHubApiError;
  return {
    message: err?.message ?? "Unknown GitHub API error",
    status: err?.status ?? null,
    responseData: err?.response?.data ?? null,
    responseHeaders: err?.response?.headers ?? null,
  };
}

export type ForkSummary = {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  ownerLogin: string;
  defaultBranch: string;
};

export type RepoWithForks = {
  id: number;
  name: string;
  ownerLogin: string;
  defaultBranch: string;
  fullName: string;
  htmlUrl: string;
  isPrivate: boolean;
  sizeKb: number;
  forksCount: number;
  forks: ForkSummary[];
};

export type ScanPreset = "quick" | "standard" | "deep";
export type ScanMode = ScanPreset | "custom";
export type LagThresholdMode = "strict" | "balanced" | "relaxed" | "custom";

export type ScanConfig = {
  mode?: ScanMode;
  customCommitDepth?: number;
  lagThresholdMode?: LagThresholdMode;
  customLagCommitThreshold?: number;
  customLagNoSyncDaysThreshold?: number;
  selectedRepoIds?: number[];
};

type ResolvedScanConfig = {
  mode: ScanMode;
  commitDepth: number;
  lagThresholdMode: LagThresholdMode;
  customLagCommitThreshold?: number;
  customLagNoSyncDaysThreshold?: number;
};

export const SCAN_PRESET_DEPTHS: Record<ScanPreset, number> = {
  quick: 100,
  standard: 200,
  deep: 400,
};

const MIN_CUSTOM_COMMIT_DEPTH = 20;
const MAX_CUSTOM_COMMIT_DEPTH = 1000;

export type ComparedFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
};

export type BranchSummary = {
  name: string;
};

export type CommitSummary = {
  sha: string;
  message: string;
  committedDate: string;
  authorName: string;
  commitUrl: string;
};

export type ForkComparison = {
  upstreamOwner: string;
  upstreamRepo: string;
  upstreamBranch: string;
  forkOwner: string;
  forkRepo: string;
  forkBranch: string;
  aheadBy: number | null;
  behindBy: number | null;
  totalFilesChanged: number | null;
  filesAdded: number | null;
  filesDeleted: number | null;
  filesModified: number | null;
  filesRenamed: number | null;
  totalAdditions: number | null;
  totalDeletions: number | null;
  totalChanges: number | null;
  files: ComparedFile[];
  compareUrl: string;
  diffUnavailable: boolean;
  diffUnavailableReason?: string;
  upstreamHead: {
    sha: string;
    message: string;
    committedDate: string;
    authorName: string;
    commitUrl: string;
  };
  forkHead: {
    sha: string;
    message: string;
    committedDate: string;
    authorName: string;
    commitUrl: string;
  };
  distanceIsEstimated: boolean;
  commonAncestorSha?: string;
  forkUniqueCommits: CommitSummary[];
  upstreamUniqueCommits: CommitSummary[];
};

export type ForkStatus = "Up-to-date" | "Slightly behind" | "Lagging";
export type FileComparisonSize = "Small change" | "Moderate change" | "Large divergence";

export type ForkAlignmentSummary = {
  upstreamOwner: string;
  upstreamRepo: string;
  forkOwner: string;
  forkRepo: string;
  upstreamBranch: string;
  forkBranch: string;
  compareUrl: string;
  aheadBy: number | null;
  behindBy: number | null;
  totalFilesChanged: number | null;
  totalAdditions: number | null;
  totalDeletions: number | null;
  totalChanges: number | null;
  frameworkTags: string[];
  status: ForkStatus;
  statusReason: string;
  isLagging: boolean;
  lagCommitThreshold: number;
  lagNoSyncDaysThreshold: number;
  daysSinceForkSync: number | null;
  fileComparisonSize: FileComparisonSize;
  isFileComparisonEstimated: boolean;
  fileComparisonEstimateReason?: string;
  fileComparisonMessage?: string;
};

export type DriftStatus = "No drift" | "Moderate drift" | "High drift";

export type FrameworkAdoption = {
  framework: string;
  forksUsing: number;
  upstreamUsing: number;
  coverageRatio: number;
  upstreamCoverageRatio: number;
  weightedAdoptionScore: number;
  driftStatus: DriftStatus;
  driftGap: number;
  driftMessage: string;
};

export type ProjectForkAnalysis = {
  scanMode: ScanMode;
  commitDepth: number;
  lagThresholdMode: LagThresholdMode;
  totalRepos: number;
  totalForksAvailable: number;
  analyzedForks: number;
  laggingForks: number;
  forks: ForkAlignmentSummary[];
  frameworkAdoption: FrameworkAdoption[];
};

const MAX_REPOS = 20;
const MAX_FORKS_PER_REPO = 20;
const COMMITS_PER_PAGE = 100;
const COMMITS_PREVIEW_LIMIT = 8;
const MIN_CUSTOM_LAG_COMMIT_THRESHOLD = 1;
const MAX_CUSTOM_LAG_COMMIT_THRESHOLD = 5000;
const MIN_CUSTOM_LAG_NO_SYNC_DAYS = 1;
const MAX_CUSTOM_LAG_NO_SYNC_DAYS = 3650;

const LAG_THRESHOLD_MULTIPLIER_BY_MODE: Record<Exclude<LagThresholdMode, "custom">, number> = {
  strict: 0.75,
  balanced: 1,
  relaxed: 1.5,
};

const FRAMEWORK_SIGNATURES: Record<string, string[]> = {
  "Node.js": ["package.json", "pnpm-lock.yaml", "yarn.lock", "package-lock.json"],
  Python: ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"],
  Go: ["go.mod"],
  Rust: ["Cargo.toml"],
  Java: ["pom.xml", "build.gradle", "build.gradle.kts"],
  ".NET": ["global.json", "Directory.Build.props"],
  Ruby: ["Gemfile"],
  PHP: ["composer.json"],
};

function resolveScanConfig(config: ScanConfig): ResolvedScanConfig {
  const lagThresholdMode = config.lagThresholdMode ?? "balanced";

  if (!config.mode) {
    throw new Error("Select a scan mode before starting analysis.");
  }

  if (
    lagThresholdMode === "custom" ||
    config.customLagCommitThreshold !== undefined ||
    config.customLagNoSyncDaysThreshold !== undefined
  ) {
    const lagCommitThreshold = Number(config.customLagCommitThreshold);
    const lagNoSyncDaysThreshold = Number(config.customLagNoSyncDaysThreshold);

    if (!Number.isFinite(lagCommitThreshold) || !Number.isInteger(lagCommitThreshold)) {
      throw new Error("Custom lag commit threshold must be a whole number.");
    }
    if (!Number.isFinite(lagNoSyncDaysThreshold) || !Number.isInteger(lagNoSyncDaysThreshold)) {
      throw new Error("Custom no-sync days threshold must be a whole number.");
    }
    if (
      lagCommitThreshold < MIN_CUSTOM_LAG_COMMIT_THRESHOLD ||
      lagCommitThreshold > MAX_CUSTOM_LAG_COMMIT_THRESHOLD
    ) {
      throw new Error(
        `Custom lag commit threshold must be between ${MIN_CUSTOM_LAG_COMMIT_THRESHOLD} and ${MAX_CUSTOM_LAG_COMMIT_THRESHOLD}.`,
      );
    }
    if (
      lagNoSyncDaysThreshold < MIN_CUSTOM_LAG_NO_SYNC_DAYS ||
      lagNoSyncDaysThreshold > MAX_CUSTOM_LAG_NO_SYNC_DAYS
    ) {
      throw new Error(
        `Custom no-sync days threshold must be between ${MIN_CUSTOM_LAG_NO_SYNC_DAYS} and ${MAX_CUSTOM_LAG_NO_SYNC_DAYS}.`,
      );
    }

    const hasCustomDepth = config.customCommitDepth !== undefined;
    if (hasCustomDepth) {
      const depth = Number(config.customCommitDepth);
      if (!Number.isFinite(depth) || !Number.isInteger(depth)) {
        throw new Error("Custom scan depth must be a whole number.");
      }
      if (depth < MIN_CUSTOM_COMMIT_DEPTH || depth > MAX_CUSTOM_COMMIT_DEPTH) {
        throw new Error(
          `Custom scan depth must be between ${MIN_CUSTOM_COMMIT_DEPTH} and ${MAX_CUSTOM_COMMIT_DEPTH} commits.`,
        );
      }

      return {
        mode: config.mode,
        commitDepth: depth,
        lagThresholdMode: "custom",
        customLagCommitThreshold: lagCommitThreshold,
        customLagNoSyncDaysThreshold: lagNoSyncDaysThreshold,
      };
    }

    return {
      mode: config.mode,
      commitDepth: SCAN_PRESET_DEPTHS[config.mode === "custom" ? "standard" : config.mode],
      lagThresholdMode: "custom",
      customLagCommitThreshold: lagCommitThreshold,
      customLagNoSyncDaysThreshold: lagNoSyncDaysThreshold,
    };
  }

  if (config.customCommitDepth !== undefined || config.mode === "custom") {
    const depth = Number(config.customCommitDepth);
    if (!Number.isFinite(depth) || !Number.isInteger(depth)) {
      throw new Error("Custom scan depth must be a whole number.");
    }
    if (depth < MIN_CUSTOM_COMMIT_DEPTH || depth > MAX_CUSTOM_COMMIT_DEPTH) {
      throw new Error(
        `Custom scan depth must be between ${MIN_CUSTOM_COMMIT_DEPTH} and ${MAX_CUSTOM_COMMIT_DEPTH} commits.`,
      );
    }
    return {
      mode: config.mode === "custom" ? "standard" : config.mode,
      commitDepth: depth,
      lagThresholdMode,
    };
  }

  return {
    mode: config.mode === "custom" ? "standard" : config.mode,
    commitDepth: SCAN_PRESET_DEPTHS[config.mode === "custom" ? "standard" : config.mode],
    lagThresholdMode,
  };
}

function inferRepoTierThresholds(sizeKb: number) {
  if (sizeKb < 5_000) {
    return { lagCommitThreshold: 20, lagNoSyncDaysThreshold: 14 };
  }
  if (sizeKb < 50_000) {
    return { lagCommitThreshold: 50, lagNoSyncDaysThreshold: 21 };
  }
  return { lagCommitThreshold: 100, lagNoSyncDaysThreshold: 30 };
}

function daysSince(dateValue: string, now = new Date()): number | null {
  const parsed = new Date(dateValue);
  const timestamp = parsed.getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }
  const diffMs = now.getTime() - timestamp;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function computeLagStatusWithThresholds(
  behindBy: number | null,
  daysSinceForkSync: number | null,
  lagCommitThreshold: number,
  lagNoSyncDaysThreshold: number,
) {
  const isCommitLagging = behindBy !== null && behindBy >= lagCommitThreshold;
  const isSyncLagging = daysSinceForkSync !== null && daysSinceForkSync >= lagNoSyncDaysThreshold;
  const isLagging = isCommitLagging || isSyncLagging;

  let status: ForkStatus = "Up-to-date";
  if (isLagging) {
    status = "Lagging";
  } else if (behindBy !== null && behindBy > 0) {
    status = "Slightly behind";
  }

  return {
    status,
    isLagging,
    lagCommitThreshold,
    lagNoSyncDaysThreshold,
  };
}

function formatStatusReason(behindBy: number | null, daysSinceForkSync: number | null) {
  const behind = behindBy === null ? "Not available" : String(behindBy);
  const noSyncDays = daysSinceForkSync === null ? "Not available" : String(daysSinceForkSync);
  return `Behind by ${behind} commits, last synced ${noSyncDays} days ago`;
}

function classifyFileComparisonByCount(totalFilesChanged: number): FileComparisonSize {
  if (totalFilesChanged < 10) {
    return "Small change";
  }
  if (totalFilesChanged <= 50) {
    return "Moderate change";
  }
  return "Large divergence";
}

function estimateFileCountFromCommitDistance(aheadBy: number | null, behindBy: number | null) {
  const distance = (aheadBy ?? 0) + (behindBy ?? 0);
  if (distance <= 0) {
    return 1;
  }
  return Math.min(200, Math.max(1, distance * 2));
}

function resolveDriftStatus(driftGap: number): DriftStatus {
  if (driftGap <= 0.1) {
    return "No drift";
  }
  if (driftGap <= 0.3) {
    return "Moderate drift";
  }
  return "High drift";
}

function computeLagStatus(
  behindBy: number | null,
  daysSinceForkSync: number | null,
  sizeKb: number,
  lagThresholdMode: LagThresholdMode,
  customLagCommitThreshold?: number,
  customLagNoSyncDaysThreshold?: number,
) {
  if (lagThresholdMode === "custom") {
    return computeLagStatusWithThresholds(
      behindBy,
      daysSinceForkSync,
      customLagCommitThreshold ?? MIN_CUSTOM_LAG_COMMIT_THRESHOLD,
      customLagNoSyncDaysThreshold ?? MIN_CUSTOM_LAG_NO_SYNC_DAYS,
    );
  }

  const base = inferRepoTierThresholds(sizeKb);
  const scale = LAG_THRESHOLD_MULTIPLIER_BY_MODE[lagThresholdMode];

  return computeLagStatusWithThresholds(
    behindBy,
    daysSinceForkSync,
    Math.max(1, Math.round(base.lagCommitThreshold * scale)),
    Math.max(1, Math.round(base.lagNoSyncDaysThreshold * scale)),
  );
}

async function detectFrameworkTags(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
): Promise<string[]> {
  try {
    const branchData = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch,
    });

    const treeSha = branchData.data.commit.commit.tree?.sha;
    if (!treeSha) {
      return [];
    }

    const tree = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: "true",
    });

    const paths = new Set(
      (tree.data.tree ?? [])
        .map((entry) => entry.path)
        .filter((path): path is string => typeof path === "string"),
    );

    const fileNames = new Set(Array.from(paths).map((path) => path.split("/").pop() ?? path));
    const dotnetMatch = Array.from(fileNames).some((filename) => filename.endsWith(".sln") || filename.endsWith(".csproj"));

    const tags = Object.entries(FRAMEWORK_SIGNATURES)
      .filter(([, signatures]) => signatures.some((signature) => fileNames.has(signature)))
      .map(([framework]) => framework);

    if (dotnetMatch && !tags.includes(".NET")) {
      tags.push(".NET");
    }

    return tags;
  } catch {
    return [];
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const lanes = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: lanes }, () => runner()));
  return results;
}

function toCommitSummary(commit: {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    committer?: { date?: string | null } | null;
    author?: { name?: string | null } | null;
  };
}): CommitSummary {
  return {
    sha: commit.sha,
    message: commit.commit.message.split("\n")[0] ?? "No commit message",
    committedDate: commit.commit.committer?.date ?? "Unknown date",
    authorName: commit.commit.author?.name ?? "Unknown author",
    commitUrl: commit.html_url,
  };
}

async function fetchCommitHistory(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  commitDepth: number,
): Promise<CommitSummary[]> {
  const commits: CommitSummary[] = [];
  const scanPages = Math.max(1, Math.ceil(commitDepth / COMMITS_PER_PAGE));

  for (let page = 1; page <= scanPages; page += 1) {
    const response = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: branch,
      per_page: COMMITS_PER_PAGE,
      page,
    });

    commits.push(...response.data.map(toCommitSummary));

    if (commits.length >= commitDepth) {
      break;
    }

    if (response.data.length < COMMITS_PER_PAGE) {
      break;
    }
  }

  return commits.slice(0, commitDepth);
}

async function estimateDistanceFromHistory(
  octokit: Octokit,
  upstreamOwner: string,
  upstreamRepo: string,
  upstreamBranch: string,
  forkOwner: string,
  forkRepo: string,
  forkBranch: string,
  commitDepth: number,
) {
  const [upstreamHistory, forkHistory] = await Promise.all([
    fetchCommitHistory(octokit, upstreamOwner, upstreamRepo, upstreamBranch, commitDepth),
    fetchCommitHistory(octokit, forkOwner, forkRepo, forkBranch, commitDepth),
  ]);

  const upstreamIndexBySha = new Map<string, number>();
  upstreamHistory.forEach((commit, index) => {
    upstreamIndexBySha.set(commit.sha, index);
  });

  let commonAncestorSha: string | undefined;
  let aheadBy: number | null = null;
  let behindBy: number | null = null;

  for (let forkIndex = 0; forkIndex < forkHistory.length; forkIndex += 1) {
    const commit = forkHistory[forkIndex];
    const upstreamIndex = upstreamIndexBySha.get(commit.sha);

    if (upstreamIndex !== undefined) {
      commonAncestorSha = commit.sha;
      aheadBy = forkIndex;
      behindBy = upstreamIndex;
      break;
    }
  }

  const forkUniqueCommits = (aheadBy !== null ? forkHistory.slice(0, aheadBy) : forkHistory).slice(0, COMMITS_PREVIEW_LIMIT);
  const upstreamUniqueCommits = (behindBy !== null ? upstreamHistory.slice(0, behindBy) : upstreamHistory).slice(
    0,
    COMMITS_PREVIEW_LIMIT,
  );

  return {
    aheadBy,
    behindBy,
    commonAncestorSha,
    forkUniqueCommits,
    upstreamUniqueCommits,
  };
}

export async function fetchOwnedReposWithForks(accessToken: string): Promise<RepoWithForks[]> {
  const octokit = new Octokit({ auth: accessToken });

  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    affiliation: "owner",
    visibility: "all",
    sort: "updated",
    per_page: 100,
  });

  const selectedRepos = repos.slice(0, MAX_REPOS);

  return Promise.all(
    selectedRepos.map(async (repo) => {
      const owner = repo.owner?.login;
      if (!owner) {
        return {
          id: repo.id,
          name: repo.name,
          ownerLogin: "unknown",
          defaultBranch: repo.default_branch ?? "main",
          fullName: repo.full_name,
          htmlUrl: repo.html_url,
          isPrivate: repo.private,
          sizeKb: repo.size,
          forksCount: repo.forks_count,
          forks: [],
        };
      }

      const forks = await octokit.paginate(octokit.rest.repos.listForks, {
        owner,
        repo: repo.name,
        sort: "newest",
        per_page: 100,
      });

      return {
        id: repo.id,
        name: repo.name,
        ownerLogin: owner,
        defaultBranch: repo.default_branch ?? "main",
        fullName: repo.full_name,
        htmlUrl: repo.html_url,
        isPrivate: repo.private,
        sizeKb: repo.size,
        forksCount: repo.forks_count,
        forks: forks.slice(0, MAX_FORKS_PER_REPO).map((fork) => ({
          id: fork.id,
          name: fork.name,
          fullName: fork.full_name,
          htmlUrl: fork.html_url,
          ownerLogin: fork.owner?.login ?? "unknown",
          defaultBranch: fork.default_branch ?? "main",
        })),
      };
    }),
  );
}

export async function fetchRepoBranches(accessToken: string, owner: string, repo: string): Promise<BranchSummary[]> {
  const octokit = new Octokit({ auth: accessToken });

  const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
    owner,
    repo,
    per_page: 100,
  });

  return branches.map((branch) => ({ name: branch.name }));
}

export async function fetchForkComparison(
  accessToken: string,
  upstreamOwner: string,
  upstreamRepo: string,
  upstreamBranch: string,
  forkOwner: string,
  forkRepo: string,
  forkBranch: string,
  options?: {
    commitDepth?: number;
  },
): Promise<ForkComparison> {
  const octokit = new Octokit({ auth: accessToken });
  const commitDepth = options?.commitDepth ?? SCAN_PRESET_DEPTHS.standard;
  const compareUrl = `https://github.com/${upstreamOwner}/${upstreamRepo}/compare/${upstreamBranch}...${forkOwner}:${forkBranch}`;

  let upstreamBranchData;
  let forkBranchData;

  try {
    [upstreamBranchData, forkBranchData] = await Promise.all([
      octokit.rest.repos.getBranch({ owner: upstreamOwner, repo: upstreamRepo, branch: upstreamBranch }),
      octokit.rest.repos.getBranch({ owner: forkOwner, repo: forkRepo, branch: forkBranch }),
    ]);
  } catch (error) {
    throw error;
  }

  const upstreamHead = {
    sha: upstreamBranchData.data.commit.sha,
    message: upstreamBranchData.data.commit.commit.message.split("\n")[0] ?? "No commit message",
    committedDate: upstreamBranchData.data.commit.commit.committer?.date ?? "Unknown date",
    authorName: upstreamBranchData.data.commit.commit.author?.name ?? "Unknown author",
    commitUrl: upstreamBranchData.data.commit.html_url,
  };

  const forkHead = {
    sha: forkBranchData.data.commit.sha,
    message: forkBranchData.data.commit.commit.message.split("\n")[0] ?? "No commit message",
    committedDate: forkBranchData.data.commit.commit.committer?.date ?? "Unknown date",
    authorName: forkBranchData.data.commit.commit.author?.name ?? "Unknown author",
    commitUrl: forkBranchData.data.commit.html_url,
  };

  let compare;

  try {
    compare = await octokit.rest.repos.compareCommitsWithBasehead({
      owner: upstreamOwner,
      repo: upstreamRepo,
      basehead: `${upstreamBranch}...${forkOwner}:${forkBranch}`,
    });
  } catch (error) {
    const details = formatGitHubError(error);

    const message = details.message;
    const isDiffUnavailable = message.includes("not_available") || message.includes("diff is taking too long");

    if (isDiffUnavailable) {
      const estimated = await estimateDistanceFromHistory(
        octokit,
        upstreamOwner,
        upstreamRepo,
        upstreamBranch,
        forkOwner,
        forkRepo,
        forkBranch,
        commitDepth,
      );

      return {
        upstreamOwner,
        upstreamRepo,
        upstreamBranch,
        forkOwner,
        forkRepo,
        forkBranch,
        aheadBy: estimated.aheadBy,
        behindBy: estimated.behindBy,
        totalFilesChanged: null,
        filesAdded: null,
        filesDeleted: null,
        filesModified: null,
        filesRenamed: null,
        totalAdditions: null,
        totalDeletions: null,
        totalChanges: null,
        files: [],
        compareUrl,
        diffUnavailable: true,
        diffUnavailableReason:
          "GitHub could not generate this diff in time. Open the GitHub comparison page for the full result.",
        upstreamHead,
        forkHead,
        distanceIsEstimated: true,
        commonAncestorSha: estimated.commonAncestorSha,
        forkUniqueCommits: estimated.forkUniqueCommits,
        upstreamUniqueCommits: estimated.upstreamUniqueCommits,
      };
    }

    throw error;
  }

  const files = (compare.data.files ?? []).map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: file.patch,
  }));

  const filesAdded = files.filter((file) => file.status === "added").length;
  const filesDeleted = files.filter((file) => file.status === "removed").length;
  const filesModified = files.filter((file) => file.status === "modified").length;
  const filesRenamed = files.filter((file) => file.status === "renamed").length;
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return {
    upstreamOwner,
    upstreamRepo,
    upstreamBranch,
    forkOwner,
    forkRepo,
    forkBranch,
    aheadBy: compare.data.ahead_by,
    behindBy: compare.data.behind_by,
    totalFilesChanged: files.length,
    filesAdded,
    filesDeleted,
    filesModified,
    filesRenamed,
    totalAdditions,
    totalDeletions,
    totalChanges: totalAdditions + totalDeletions,
    files,
    compareUrl,
    diffUnavailable: false,
    upstreamHead,
    forkHead,
    distanceIsEstimated: false,
    commonAncestorSha: undefined,
    forkUniqueCommits: [],
    upstreamUniqueCommits: [],
  };
}

export async function fetchProjectForkAnalysis(accessToken: string, config: ScanConfig): Promise<ProjectForkAnalysis> {
  const resolved = resolveScanConfig(config);
  const repos = await fetchOwnedReposWithForks(accessToken);
  const selectableRepos = repos.filter((repo) => repo.forks.length > 0);
  const selectedRepoIds = new Set((config.selectedRepoIds ?? []).filter((id) => Number.isInteger(id) && id > 0));
  const scopedRepos =
    selectedRepoIds.size > 0
      ? selectableRepos.filter((repo) => selectedRepoIds.has(repo.id))
      : selectableRepos;
  const octokit = new Octokit({ auth: accessToken });

  const forkTasks = scopedRepos.flatMap((repo) =>
    repo.forks.map((fork) => ({
      repo,
      fork,
    })),
  );

  const now = new Date();

  const analysisResults = await mapWithConcurrency(forkTasks, 4, async ({ repo, fork }) => {
    try {
      const [comparison, frameworkTags] = await Promise.all([
        fetchForkComparison(
          accessToken,
          repo.ownerLogin,
          repo.name,
          repo.defaultBranch,
          fork.ownerLogin,
          fork.name,
          fork.defaultBranch,
          { commitDepth: resolved.commitDepth },
        ),
        detectFrameworkTags(octokit, fork.ownerLogin, fork.name, fork.defaultBranch),
      ]);

      const daysSinceForkSync = daysSince(comparison.forkHead.committedDate, now);
      const lag = computeLagStatus(
        comparison.behindBy,
        daysSinceForkSync,
        repo.sizeKb,
        resolved.lagThresholdMode,
        resolved.customLagCommitThreshold,
        resolved.customLagNoSyncDaysThreshold,
      );

      const summary: ForkAlignmentSummary = {
        upstreamOwner: repo.ownerLogin,
        upstreamRepo: repo.name,
        forkOwner: fork.ownerLogin,
        forkRepo: fork.name,
        upstreamBranch: repo.defaultBranch,
        forkBranch: fork.defaultBranch,
        compareUrl: comparison.compareUrl,
        aheadBy: comparison.aheadBy,
        behindBy: comparison.behindBy,
        totalFilesChanged: comparison.totalFilesChanged,
        totalAdditions: comparison.totalAdditions,
        totalDeletions: comparison.totalDeletions,
        totalChanges: comparison.totalChanges,
        frameworkTags,
        status: lag.status,
        statusReason: formatStatusReason(comparison.behindBy, daysSinceForkSync),
        isLagging: lag.isLagging,
        lagCommitThreshold: lag.lagCommitThreshold,
        lagNoSyncDaysThreshold: lag.lagNoSyncDaysThreshold,
        daysSinceForkSync,
        fileComparisonSize: classifyFileComparisonByCount(
          comparison.totalFilesChanged ?? estimateFileCountFromCommitDistance(comparison.aheadBy, comparison.behindBy),
        ),
        isFileComparisonEstimated: comparison.totalFilesChanged === null,
        fileComparisonEstimateReason:
          comparison.totalFilesChanged === null
            ? `Estimated from ${comparison.behindBy ?? "Not available"} upstream commits not merged`
            : undefined,
        fileComparisonMessage:
          comparison.diffUnavailable && comparison.totalFilesChanged === null
            ? "Diff not available due to API limits. Showing estimated changes."
            : undefined,
      };

      return summary;
    } catch {
      return null;
    }
  });

  const forks = analysisResults.filter((result): result is ForkAlignmentSummary => result !== null);

  forks.sort((a, b) => {
    const statusScore = (value: ForkStatus) => {
      if (value === "Lagging") {
        return 2;
      }
      if (value === "Slightly behind") {
        return 1;
      }
      return 0;
    };

    const statusDiff = statusScore(b.status) - statusScore(a.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }
    return (b.behindBy ?? 0) - (a.behindBy ?? 0);
  });

  const frameworkMap = new Map<string, { forksUsing: number; weightedTotal: number }>();
  const upstreamFrameworkMap = new Map<string, number>();
  const upstreamFrameworkResults = await mapWithConcurrency(scopedRepos, 4, async (repo) => {
    const tags = await detectFrameworkTags(octokit, repo.ownerLogin, repo.name, repo.defaultBranch);
    return { repoId: repo.id, tags };
  });

  for (const result of upstreamFrameworkResults) {
    for (const tag of result.tags) {
      const count = upstreamFrameworkMap.get(tag) ?? 0;
      upstreamFrameworkMap.set(tag, count + 1);
    }
  }

  for (const fork of forks) {
    const activityWeight = (() => {
      if (fork.daysSinceForkSync === null) {
        return 0.4;
      }
      if (fork.daysSinceForkSync <= 14) {
        return 1;
      }
      if (fork.daysSinceForkSync <= 30) {
        return 0.75;
      }
      if (fork.daysSinceForkSync <= 90) {
        return 0.45;
      }
      return 0.25;
    })();

    for (const tag of fork.frameworkTags) {
      const current = frameworkMap.get(tag) ?? { forksUsing: 0, weightedTotal: 0 };
      current.forksUsing += 1;
      current.weightedTotal += activityWeight;
      frameworkMap.set(tag, current);
    }
  }

  const denominator = forks.length || 1;
  const upstreamDenominator = scopedRepos.length || 1;
  const allFrameworks = new Set<string>([...frameworkMap.keys(), ...upstreamFrameworkMap.keys()]);

  const frameworkAdoption: FrameworkAdoption[] = Array.from(allFrameworks)
    .map((framework) => {
      const forkData = frameworkMap.get(framework) ?? { forksUsing: 0, weightedTotal: 0 };
      const upstreamUsing = upstreamFrameworkMap.get(framework) ?? 0;
      const coverageRatio = forkData.forksUsing / denominator;
      const upstreamCoverageRatio = upstreamUsing / upstreamDenominator;
      const driftGap = Math.abs(coverageRatio - upstreamCoverageRatio);
      const driftStatus = resolveDriftStatus(driftGap);
      const driftMessage =
        driftStatus === "No drift" && driftGap <= 0.0001
          ? "No drift (fork matches upstream usage)"
          : driftStatus;

      return {
        framework,
        forksUsing: forkData.forksUsing,
        upstreamUsing,
        coverageRatio,
        upstreamCoverageRatio,
        weightedAdoptionScore: forkData.weightedTotal / denominator,
        driftStatus,
        driftGap,
        driftMessage,
      };
    })
    .sort((a, b) => b.coverageRatio - a.coverageRatio);

  return {
    scanMode: resolved.mode,
    commitDepth: resolved.commitDepth,
    lagThresholdMode: resolved.lagThresholdMode,
    totalRepos: scopedRepos.length,
    totalForksAvailable: forkTasks.length,
    analyzedForks: forks.length,
    laggingForks: forks.filter((fork) => fork.status === "Lagging").length,
    forks,
    frameworkAdoption,
  };
}
