import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import ScanControls from "@/app/components/scan-controls";
import { fetchOwnedReposWithForks, fetchProjectForkAnalysis } from "@/lib/github";
import type { LagThresholdMode, ProjectForkAnalysis, ScanMode } from "@/lib/github";

type ScanPageProps = {
  searchParams?: Promise<{
    scanMode?: string;
    customCommitDepth?: string;
    lagThresholdMode?: string;
    customLagCommitThreshold?: string;
    customLagNoSyncDaysThreshold?: string;
    selectedRepoIds?: string | string[];
  }>;
};

function parseOptionalInt(value?: string) {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseRepoIds(value?: string | string[]) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw
    .map((id) => Number.parseInt(id, 10))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function isScanMode(value?: string): value is ScanMode {
  return value === "quick" || value === "standard" || value === "deep" || value === "custom";
}

function isLagThresholdMode(value?: string): value is LagThresholdMode {
  return value === "strict" || value === "balanced" || value === "relaxed" || value === "custom";
}

function toPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function normalizeScanMode(value?: string): ScanMode | undefined {
  if (!isScanMode(value)) {
    return undefined;
  }
  return value === "custom" ? "standard" : value;
}

function displayNumber(value: number | null) {
  return value === null ? "Not available" : value;
}

function classificationBadgeClass(value: "Small change" | "Moderate change" | "Large divergence") {
  if (value === "Small change") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (value === "Moderate change") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-red-100 text-red-800";
}

export default async function ScanPage({ searchParams }: ScanPageProps) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 py-12 text-zinc-900">
        <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Project Scan</h1>
          <p className="mt-4 text-sm text-zinc-700">You are not signed in.</p>
          <div className="mt-6">
            <Link
              href="/api/auth/signin/github"
              className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Sign in with GitHub
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!session.accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 py-12 text-zinc-900">
        <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Project Scan</h1>
          <p className="mt-4 text-sm text-zinc-700">Missing GitHub access token. Sign out and sign in again.</p>
          <div className="mt-6">
            <Link
              href="/api/auth/signout"
              className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Sign out
            </Link>
          </div>
        </main>
      </div>
    );
  }

  let projectAnalysis: ProjectForkAnalysis | null = null;
  let analysisError: string | null = null;
  let repoOptions: Array<{ id: number; fullName: string; forksCount: number }> = [];

  const query = (await searchParams) ?? {};
  const persisted = session.scanPreferences;

  const selectedScanMode = normalizeScanMode(query.scanMode) ?? normalizeScanMode(persisted?.scanMode);
  const selectedLagThresholdMode = isLagThresholdMode(query.lagThresholdMode)
    ? query.lagThresholdMode
    : isLagThresholdMode(persisted?.lagThresholdMode)
      ? persisted.lagThresholdMode
      : "balanced";

  const customCommitDepth = parseOptionalInt(query.customCommitDepth) ?? persisted?.customCommitDepth;
  const customLagCommitThreshold =
    parseOptionalInt(query.customLagCommitThreshold) ?? persisted?.customLagCommitThreshold;
  const customLagNoSyncDaysThreshold =
    parseOptionalInt(query.customLagNoSyncDaysThreshold) ?? persisted?.customLagNoSyncDaysThreshold;
  const selectedRepoIds = (() => {
    const fromQuery = parseRepoIds(query.selectedRepoIds);
    if (fromQuery.length > 0) {
      return fromQuery;
    }
    return (persisted?.selectedRepoIds ?? []).filter((id) => Number.isInteger(id) && id > 0);
  })();

  try {
    const repos = await fetchOwnedReposWithForks(session.accessToken);
    repoOptions = repos
      .filter((repo) => repo.forks.length > 0)
      .map((repo) => ({
        id: repo.id,
        fullName: repo.fullName,
        forksCount: repo.forksCount,
      }));
  } catch {
    repoOptions = [];
  }

  if (selectedScanMode) {
    try {
      projectAnalysis = await fetchProjectForkAnalysis(session.accessToken, {
        mode: selectedScanMode,
        customCommitDepth,
        lagThresholdMode: selectedLagThresholdMode,
        customLagCommitThreshold,
        customLagNoSyncDaysThreshold,
        selectedRepoIds,
      });
    } catch (error) {
      analysisError = error instanceof Error ? error.message : "Failed to run project scan.";
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 px-6 py-10 text-zinc-900">
      <main className="mx-auto w-full max-w-5xl space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Project Scan</h1>
            <Link href="/" className="text-sm text-zinc-700 underline">
              Back to repositories
            </Link>
          </div>

          <ScanControls
            selectedScanMode={selectedScanMode}
            selectedCustomCommitDepth={customCommitDepth}
            selectedCustomLagCommitThreshold={customLagCommitThreshold}
            selectedCustomLagNoSyncDaysThreshold={customLagNoSyncDaysThreshold}
            selectedRepoIds={selectedRepoIds}
            repoOptions={repoOptions}
            targetPath="/scan"
          />
        </section>

        {selectedScanMode ? null : (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
            Select a scan profile, then run the scan.
          </section>
        )}

        {analysisError ? (
          <section className="rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700 shadow-sm">
            {analysisError}
          </section>
        ) : null}

        {projectAnalysis ? (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Scan Mode</p>
                <p className="mt-2 text-lg font-semibold capitalize">{projectAnalysis.scanMode}</p>
                <p className="text-xs text-zinc-600">Depth: {projectAnalysis.commitDepth} commits</p>
              </article>
              <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Repositories</p>
                <p className="mt-2 text-lg font-semibold">{projectAnalysis.totalRepos}</p>
              </article>
              <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Forks Analyzed</p>
                <p className="mt-2 text-lg font-semibold">
                  {projectAnalysis.analyzedForks} / {projectAnalysis.totalForksAvailable}
                </p>
              </article>
              <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Lagging Forks</p>
                <p className="mt-2 text-lg font-semibold">{projectAnalysis.laggingForks}</p>
                <p className="text-xs text-zinc-600">
                  {projectAnalysis.laggingForks} of {projectAnalysis.analyzedForks} forks are marked as Lagging.
                </p>
              </article>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Framework Adoption</h2>
              {projectAnalysis.frameworkAdoption.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600">No framework signatures detected in analyzed forks.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead>
                      <tr className="text-left text-zinc-600">
                        <th className="px-3 py-2 font-medium">Framework</th>
                        <th className="px-3 py-2 font-medium">Forks Using</th>
                        <th className="px-3 py-2 font-medium">Upstream Using</th>
                        <th className="px-3 py-2 font-medium">Fork Coverage</th>
                        <th className="px-3 py-2 font-medium">Upstream Coverage</th>
                        <th className="px-3 py-2 font-medium">Weighted Adoption</th>
                        <th className="px-3 py-2 font-medium">Drift Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {projectAnalysis.frameworkAdoption.map((framework) => (
                        <tr key={framework.framework}>
                          <td className="px-3 py-2 font-medium text-zinc-800">{framework.framework}</td>
                          <td className="px-3 py-2 text-zinc-700">{framework.forksUsing}</td>
                          <td className="px-3 py-2 text-zinc-700">{framework.upstreamUsing}</td>
                          <td className="px-3 py-2 text-zinc-700">{toPercent(framework.coverageRatio)}</td>
                          <td className="px-3 py-2 text-zinc-700">{toPercent(framework.upstreamCoverageRatio)}</td>
                          <td className="px-3 py-2 text-zinc-700">{toPercent(framework.weightedAdoptionScore)}</td>
                          <td className="px-3 py-2 text-zinc-700">{framework.driftMessage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Fork Alignment Table</h2>
              {projectAnalysis.forks.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600">No fork comparisons were completed in this scan.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead>
                      <tr className="text-left text-zinc-600">
                        <th className="px-3 py-2 font-medium">Fork</th>
                        <th className="px-3 py-2 font-medium">Behind</th>
                        <th className="px-3 py-2 font-medium">Ahead</th>
                        <th className="px-3 py-2 font-medium">No Sync (days)</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Frameworks</th>
                        <th className="px-3 py-2 font-medium">File Change Summary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {projectAnalysis.forks.map((fork) => (
                        <tr key={`${fork.upstreamOwner}/${fork.upstreamRepo}:${fork.forkOwner}/${fork.forkRepo}`}>
                          <td className="px-3 py-2 text-zinc-800">
                            <div className="font-medium">Parent: {fork.upstreamOwner}/{fork.upstreamRepo}</div>
                            <div className="text-xs text-zinc-600">Fork: {fork.forkOwner}/{fork.forkRepo}</div>
                            <Link
                              href={{
                                pathname: `/fork/${fork.forkOwner}/${fork.forkRepo}`,
                                query: {
                                  upstreamOwner: fork.upstreamOwner,
                                  upstreamRepo: fork.upstreamRepo,
                                  upstreamBranch: fork.upstreamBranch,
                                  forkBranch: fork.forkBranch,
                                },
                              }}
                              className="text-xs text-zinc-600 underline"
                            >
                              Open detail view
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-zinc-700">{displayNumber(fork.behindBy)}</td>
                          <td className="px-3 py-2 text-zinc-700">{displayNumber(fork.aheadBy)}</td>
                          <td className="px-3 py-2 text-zinc-700">{displayNumber(fork.daysSinceForkSync)}</td>
                          <td className="px-3 py-2 text-zinc-700">
                            <div className="font-medium">{fork.status}</div>
                            <div className="text-xs text-zinc-600">{fork.statusReason}</div>
                          </td>
                          <td className="px-3 py-2 text-zinc-700">
                            {fork.frameworkTags.length > 0 ? fork.frameworkTags.join(", ") : "none detected"}
                          </td>
                          <td className="px-3 py-2 text-zinc-700">
                            {displayNumber(fork.totalFilesChanged)} files / {displayNumber(fork.totalChanges)} lines
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Project File Comparison Summary</h2>
              {projectAnalysis.forks.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600">No fork comparisons were completed in this scan.</p>
              ) : (
                <>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full divide-y divide-zinc-200 text-sm">
                      <thead>
                        <tr className="text-left text-zinc-600">
                          <th className="px-3 py-2 font-medium">Fork</th>
                          <th className="px-3 py-2 font-medium">Files Changed</th>
                          <th className="px-3 py-2 font-medium">Lines Added</th>
                          <th className="px-3 py-2 font-medium">Lines Removed</th>
                          <th className="px-3 py-2 font-medium">Classification</th>
                          <th className="px-3 py-2 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {projectAnalysis.forks.map((fork) => (
                          <tr key={`summary-${fork.upstreamOwner}/${fork.upstreamRepo}:${fork.forkOwner}/${fork.forkRepo}`}>
                            <td className="px-3 py-2 text-zinc-800">{fork.forkOwner}/{fork.forkRepo}</td>
                            <td className="px-3 py-2 text-zinc-700">{displayNumber(fork.totalFilesChanged)}</td>
                            <td className="px-3 py-2 text-zinc-700">{displayNumber(fork.totalAdditions)}</td>
                            <td className="px-3 py-2 text-zinc-700">{displayNumber(fork.totalDeletions)}</td>
                            <td className="px-3 py-2 text-zinc-700">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classificationBadgeClass(
                                  fork.fileComparisonSize,
                                )}`}
                              >
                                {fork.fileComparisonSize}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-zinc-700">
                              {fork.fileComparisonMessage ? <div>{fork.fileComparisonMessage}</div> : null}
                              {fork.fileComparisonEstimateReason ? (
                                <div className="text-xs text-zinc-600">{fork.fileComparisonEstimateReason}</div>
                              ) : (
                                "Direct diff metrics"
                              )}
                              <a
                                href={fork.compareUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex text-xs underline"
                              >
                                Open GitHub comparison page
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {projectAnalysis.forks.some((fork) => fork.isFileComparisonEstimated) ? (
                    <p className="mt-3 text-sm text-zinc-600">
                      Detailed diff unavailable due to GitHub API limits. For full comparison, open the GitHub comparison page link in
                      each row.
                    </p>
                  ) : null}
                </>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
