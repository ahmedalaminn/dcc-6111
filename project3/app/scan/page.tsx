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
    return "slb-badge slb-badge--ok";
  }
  if (value === "Moderate change") {
    return "slb-badge slb-badge--warn";
  }
  return "slb-badge slb-badge--danger";
}

function AuthCard({
  title,
  body,
  href,
  action,
}: {
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <div className="slb-auth-shell">
      <main className="slb-auth-card">
        <span className="slb-kicker">Project Scan</span>
        <h1>{title}</h1>
        <p>{body}</p>
        <div className="slb-action-row" style={{ marginTop: "20px" }}>
          <Link href={href} className="slb-button">
            {action}
          </Link>
        </div>
      </main>
    </div>
  );
}

export default async function ScanPage({ searchParams }: ScanPageProps) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <AuthCard
        title="Sign In Required"
        body="Authentication is required before running project-level fork analysis."
        href="/api/auth/signin/github"
        action="Sign In With GitHub ->"
      />
    );
  }

  if (!session.accessToken) {
    return (
      <AuthCard
        title="Access Token Required"
        body="The GitHub access token is missing from the current session. Sign out and sign in again."
        href="/api/auth/signout"
        action="Sign Out ->"
      />
    );
  }

  let analysisError: string | null = null;
  let repoOptions: Array<{ id: number; fullName: string; forksCount: number }> = [];
  let projectAnalysis: ProjectForkAnalysis | null = null;

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
    <div className="slb-page">
      <section className="slb-card">
        <div className="slb-section-head">
          <div>
            <span className="slb-kicker">Scan Workspace</span>
            <h1>Project Fork Analysis</h1>
          </div>
          <Link href="/" className="slb-button-secondary">
            Back To Repositories ->
          </Link>
        </div>
        <div className="slb-card-body slb-stack">
          <p className="slb-body-copy">
            Configure repository scope, scan depth, and lag policy before running the SLB fork-monitoring analysis.
          </p>
          <ScanControls
            selectedScanMode={selectedScanMode}
            selectedCustomCommitDepth={customCommitDepth}
            selectedCustomLagCommitThreshold={customLagCommitThreshold}
            selectedCustomLagNoSyncDaysThreshold={customLagNoSyncDaysThreshold}
            selectedRepoIds={selectedRepoIds}
            repoOptions={repoOptions}
            targetPath="/scan"
          />
        </div>
      </section>

      {!selectedScanMode ? (
        <section className="slb-alert slb-alert--warn">Select a scan profile, then run the scan.</section>
      ) : null}

      {analysisError ? <section className="slb-alert slb-alert--error">{analysisError}</section> : null}

      {projectAnalysis ? (
        <>
          <section className="slb-kpi-grid">
            <article className="slb-kpi">
              <p className="slb-kpi__label">Scan Mode</p>
              <p className="slb-kpi__value" style={{ textTransform: "capitalize" }}>{projectAnalysis.scanMode}</p>
              <p className="slb-kpi__note">Depth: {projectAnalysis.commitDepth} commits</p>
            </article>
            <article className="slb-kpi">
              <p className="slb-kpi__label">Repositories</p>
              <p className="slb-kpi__value">{projectAnalysis.totalRepos}</p>
              <p className="slb-kpi__note">Lag mode: {projectAnalysis.lagThresholdMode}</p>
            </article>
            <article className="slb-kpi">
              <p className="slb-kpi__label">Forks Analyzed</p>
              <p className="slb-kpi__value">
                {projectAnalysis.analyzedForks} / {projectAnalysis.totalForksAvailable}
              </p>
              <p className="slb-kpi__note">Forks completed in the current run</p>
            </article>
            <article className="slb-kpi">
              <p className="slb-kpi__label">Lagging Forks</p>
              <p className="slb-kpi__value">{projectAnalysis.laggingForks}</p>
              <p className="slb-kpi__note">
                {projectAnalysis.laggingForks} of {projectAnalysis.analyzedForks} forks are marked as lagging.
              </p>
            </article>
          </section>

          <section className="slb-card">
            <div className="slb-section-head">
              <div>
                <span className="slb-kicker">Framework Signals</span>
                <h2>Framework Adoption</h2>
              </div>
            </div>
            <div className="slb-card-body">
              {projectAnalysis.frameworkAdoption.length === 0 ? (
                <p className="slb-body-copy">No framework signatures detected in analyzed forks.</p>
              ) : (
                <div className="slb-table-wrap">
                  <table className="slb-table">
                    <thead>
                      <tr>
                        <th>Framework</th>
                        <th>Forks Using</th>
                        <th>Upstream Using</th>
                        <th>Fork Coverage</th>
                        <th>Upstream Coverage</th>
                        <th>Weighted Adoption</th>
                        <th>Drift Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectAnalysis.frameworkAdoption.map((framework) => (
                        <tr key={framework.framework}>
                          <td>{framework.framework}</td>
                          <td>{framework.forksUsing}</td>
                          <td>{framework.upstreamUsing}</td>
                          <td>{toPercent(framework.coverageRatio)}</td>
                          <td>{toPercent(framework.upstreamCoverageRatio)}</td>
                          <td>{toPercent(framework.weightedAdoptionScore)}</td>
                          <td>{framework.driftMessage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <section className="slb-card">
            <div className="slb-section-head">
              <div>
                <span className="slb-kicker">Alignment View</span>
                <h2>Fork Alignment Table</h2>
              </div>
            </div>
            <div className="slb-card-body">
              {projectAnalysis.forks.length === 0 ? (
                <p className="slb-body-copy">No fork comparisons were completed in this scan.</p>
              ) : (
                <div className="slb-table-wrap">
                  <table className="slb-table">
                    <thead>
                      <tr>
                        <th>Fork</th>
                        <th>Behind</th>
                        <th>Ahead</th>
                        <th>No Sync (days)</th>
                        <th>Status</th>
                        <th>Frameworks</th>
                        <th>File Change Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectAnalysis.forks.map((fork) => (
                        <tr key={`${fork.upstreamOwner}/${fork.upstreamRepo}:${fork.forkOwner}/${fork.forkRepo}`}>
                          <td>
                            <div>Parent: {fork.upstreamOwner}/{fork.upstreamRepo}</div>
                            <div className="slb-note" style={{ marginTop: "4px" }}>
                              Fork: {fork.forkOwner}/{fork.forkRepo}
                            </div>
                            <div style={{ marginTop: "8px" }}>
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
                                className="slb-link-arrow"
                              >
                                Open Detail View ->
                              </Link>
                            </div>
                          </td>
                          <td>{displayNumber(fork.behindBy)}</td>
                          <td>{displayNumber(fork.aheadBy)}</td>
                          <td>{displayNumber(fork.daysSinceForkSync)}</td>
                          <td>
                            <div>{fork.status}</div>
                            <div className="slb-note" style={{ marginTop: "4px" }}>
                              {fork.statusReason}
                            </div>
                          </td>
                          <td>{fork.frameworkTags.length > 0 ? fork.frameworkTags.join(", ") : "none detected"}</td>
                          <td>
                            {displayNumber(fork.totalFilesChanged)} files / {displayNumber(fork.totalChanges)} lines
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <section className="slb-card">
            <div className="slb-section-head">
              <div>
                <span className="slb-kicker">File Divergence</span>
                <h2>Project File Comparison Summary</h2>
              </div>
            </div>
            <div className="slb-card-body">
              {projectAnalysis.forks.length === 0 ? (
                <p className="slb-body-copy">No fork comparisons were completed in this scan.</p>
              ) : (
                <>
                  <div className="slb-table-wrap">
                    <table className="slb-table">
                      <thead>
                        <tr>
                          <th>Fork</th>
                          <th>Files Changed</th>
                          <th>Lines Added</th>
                          <th>Lines Removed</th>
                          <th>Classification</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectAnalysis.forks.map((fork) => (
                          <tr key={`summary-${fork.upstreamOwner}/${fork.upstreamRepo}:${fork.forkOwner}/${fork.forkRepo}`}>
                            <td>{fork.forkOwner}/{fork.forkRepo}</td>
                            <td>{displayNumber(fork.totalFilesChanged)}</td>
                            <td>{displayNumber(fork.totalAdditions)}</td>
                            <td>{displayNumber(fork.totalDeletions)}</td>
                            <td>
                              <span className={classificationBadgeClass(fork.fileComparisonSize)}>
                                {fork.fileComparisonSize}
                              </span>
                            </td>
                            <td>
                              {fork.fileComparisonMessage ? <div>{fork.fileComparisonMessage}</div> : null}
                              <div className="slb-note" style={{ marginTop: "4px" }}>
                                {fork.fileComparisonEstimateReason ?? "Direct diff metrics"}
                              </div>
                              <div style={{ marginTop: "8px" }}>
                                <a href={fork.compareUrl} target="_blank" rel="noopener noreferrer" className="slb-link-arrow">
                                  Open GitHub Comparison ->
                                </a>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {projectAnalysis.forks.some((fork) => fork.isFileComparisonEstimated) ? (
                    <p className="slb-note" style={{ marginTop: "14px" }}>
                      Detailed diff unavailable due to GitHub API limits. Open the GitHub comparison page link in each
                      row for the full comparison view.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
