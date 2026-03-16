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
  forksCount: number;
  forks: ForkSummary[];
};

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

const MAX_REPOS = 20;
const MAX_FORKS_PER_REPO = 20;
const COMMIT_SCAN_PAGES = 5;
const COMMITS_PER_PAGE = 100;
const COMMITS_PREVIEW_LIMIT = 8;

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
): Promise<CommitSummary[]> {
  const commits: CommitSummary[] = [];

  for (let page = 1; page <= COMMIT_SCAN_PAGES; page += 1) {
    const response = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: branch,
      per_page: COMMITS_PER_PAGE,
      page,
    });

    commits.push(...response.data.map(toCommitSummary));

    if (response.data.length < COMMITS_PER_PAGE) {
      break;
    }
  }

  return commits;
}

async function estimateDistanceFromHistory(
  octokit: Octokit,
  upstreamOwner: string,
  upstreamRepo: string,
  upstreamBranch: string,
  forkOwner: string,
  forkRepo: string,
  forkBranch: string,
) {
  const [upstreamHistory, forkHistory] = await Promise.all([
    fetchCommitHistory(octokit, upstreamOwner, upstreamRepo, upstreamBranch),
    fetchCommitHistory(octokit, forkOwner, forkRepo, forkBranch),
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
): Promise<ForkComparison> {
  const octokit = new Octokit({ auth: accessToken });
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
