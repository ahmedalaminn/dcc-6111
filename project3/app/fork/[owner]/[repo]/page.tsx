import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { fetchForkComparison, fetchRepoBranches } from "@/lib/github";
import type { BranchSummary, ForkComparison } from "@/lib/github";

function deriveStatus(behindBy: number | null) {
  if (behindBy === null || behindBy === 0) {
    return "Up-to-date";
  }
  if (behindBy > 0 && behindBy < 20) {
    return "Slightly behind";
  }
  return "Lagging";
}

function displayNumber(value: number | null) {
  return value === null ? "Not available" : value;
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
        <span className="slb-kicker">Fork Comparison</span>
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

type ComparePageProps = {
  params: Promise<{
    owner: string;
    repo: string;
  }>;
  searchParams: Promise<{
    upstreamOwner?: string;
    upstreamRepo?: string;
    upstreamBranch?: string;
    forkBranch?: string;
  }>;
};

export default async function ForkComparePage({ params, searchParams }: ComparePageProps) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <AuthCard
        title="Sign In Required"
        body="Authentication is required before comparing fork branches against upstream repositories."
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

  const routeParams = await params;
  const query = await searchParams;

  const upstreamOwner = query.upstreamOwner;
  const upstreamRepo = query.upstreamRepo;
  const upstreamBranch = query.upstreamBranch;
  const forkBranch = query.forkBranch;

  if (!upstreamOwner || !upstreamRepo || !upstreamBranch || !forkBranch) {
    return (
      <AuthCard
        title="Comparison Context Missing"
        body="Return to the repository inventory and reopen the fork so the upstream and branch context is restored."
        href="/"
        action="Back To Repositories ->"
      />
    );
  }

  let upstreamBranches: BranchSummary[] = [];
  let forkBranches: BranchSummary[] = [];

  try {
    [upstreamBranches, forkBranches] = await Promise.all([
      fetchRepoBranches(session.accessToken, upstreamOwner, upstreamRepo),
      fetchRepoBranches(session.accessToken, routeParams.owner, routeParams.repo),
    ]);
  } catch {
    upstreamBranches = [];
    forkBranches = [];
  }

  let comparison: ForkComparison | null = null;
  let errorMessage: string | null = null;

  try {
    comparison = await fetchForkComparison(
      session.accessToken,
      upstreamOwner,
      upstreamRepo,
      upstreamBranch,
      routeParams.owner,
      routeParams.repo,
      forkBranch,
    );
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Failed to compare fork with upstream repository.";
  }

  if (errorMessage || !comparison) {
    return (
      <div className="slb-page">
        <section className="slb-alert slb-alert--error">{errorMessage ?? "Unable to compute comparison."}</section>
        <div className="slb-action-row">
          <Link href="/" className="slb-button-secondary">
            Back To Repositories ->
          </Link>
        </div>
      </div>
    );
  }

  const forkRepositoryUrl = `https://github.com/${comparison.forkOwner}/${comparison.forkRepo}`;
  const status = deriveStatus(comparison.behindBy);

  return (
    <div className="slb-page">
      <section className="slb-card">
        <div className="slb-section-head">
          <div>
            <span className="slb-kicker">Fork Comparison</span>
            <h1>
              <a href={forkRepositoryUrl} target="_blank" rel="noopener noreferrer">
                {comparison.forkOwner}/{comparison.forkRepo}
              </a>
            </h1>
          </div>
          <Link href="/" className="slb-button-secondary">
            Back To Repositories ->
          </Link>
        </div>

        <div className="slb-card-body slb-stack">
          <p className="slb-body-copy">
            Comparing fork branch <span className="slb-mono">{comparison.forkBranch}</span> against upstream{" "}
            <span className="slb-mono">
              {comparison.upstreamOwner}/{comparison.upstreamRepo}:{comparison.upstreamBranch}
            </span>
            .
          </p>

          <form method="GET" className="slb-form-grid slb-form-grid--2">
            <input type="hidden" name="upstreamOwner" value={upstreamOwner} />
            <input type="hidden" name="upstreamRepo" value={upstreamRepo} />

            <label className="slb-field">
              <span>Upstream Branch</span>
              <select name="upstreamBranch" defaultValue={upstreamBranch} className="slb-select">
                {upstreamBranches.length > 0
                  ? upstreamBranches.map((branch) => (
                      <option key={branch.name} value={branch.name}>
                        {branch.name}
                      </option>
                    ))
                  : [
                      <option key={upstreamBranch} value={upstreamBranch}>
                        {upstreamBranch}
                      </option>,
                    ]}
              </select>
            </label>

            <label className="slb-field">
              <span>Fork Branch</span>
              <select name="forkBranch" defaultValue={forkBranch} className="slb-select">
                {forkBranches.length > 0
                  ? forkBranches.map((branch) => (
                      <option key={branch.name} value={branch.name}>
                        {branch.name}
                      </option>
                    ))
                  : [
                      <option key={forkBranch} value={forkBranch}>
                        {forkBranch}
                      </option>,
                    ]}
              </select>
            </label>

            <div className="slb-action-row">
              <button type="submit" className="slb-button">
                Compare Branches ->
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="slb-kpi-grid">
        <article className="slb-kpi">
          <p className="slb-kpi__label">Ahead</p>
          <p className="slb-kpi__value">{displayNumber(comparison.aheadBy)}</p>
        </article>
        <article className="slb-kpi">
          <p className="slb-kpi__label">Behind</p>
          <p className="slb-kpi__value">{displayNumber(comparison.behindBy)}</p>
        </article>
        <article className="slb-kpi">
          <p className="slb-kpi__label">Status</p>
          <p className="slb-kpi__value">{status}</p>
        </article>
        <article className="slb-kpi">
          <p className="slb-kpi__label">Files Changed</p>
          <p className="slb-kpi__value">{displayNumber(comparison.totalFilesChanged)}</p>
        </article>
      </section>

      <section className="slb-card">
        <div className="slb-section-head">
          <div>
            <span className="slb-kicker">Comparison Metrics</span>
            <h2>Detailed Diff Summary</h2>
          </div>
        </div>
        <div className="slb-card-body">
          <div className="slb-grid-3">
            <article className="slb-inset-card">
              <span className="slb-kicker">Commit Distance</span>
              {comparison.aheadBy !== null && comparison.behindBy !== null ? (
                <div className="slb-stack" style={{ marginTop: "10px" }}>
                  <p className="slb-body-copy">
                    Fork -&gt; Upstream: <span className="slb-mono">+{comparison.aheadBy}</span>
                  </p>
                  <p className="slb-body-copy">
                    Upstream -&gt; Fork: <span className="slb-mono">+{comparison.behindBy}</span>
                  </p>
                  <p className="slb-note">Arrow direction shows where commits need to be merged.</p>
                  {comparison.commonAncestorSha ? (
                    <p className="slb-note">Common ancestor: {comparison.commonAncestorSha.slice(0, 12)}</p>
                  ) : null}
                </div>
              ) : (
                <p className="slb-body-copy" style={{ marginTop: "10px" }}>
                  Not available.
                </p>
              )}
            </article>

            <article className="slb-inset-card">
              <span className="slb-kicker">Line Changes</span>
              {comparison.diffUnavailable ? (
                <p className="slb-body-copy" style={{ marginTop: "10px" }}>
                  Not available.
                </p>
              ) : (
                <div className="slb-stack" style={{ marginTop: "10px" }}>
                  <p className="slb-body-copy">+{comparison.totalAdditions} added</p>
                  <p className="slb-body-copy">-{comparison.totalDeletions} deleted</p>
                  <p className="slb-body-copy">{comparison.totalChanges} total changed</p>
                </div>
              )}
            </article>

            <article className="slb-inset-card">
              <span className="slb-kicker">File Changes</span>
              {comparison.diffUnavailable ? (
                <p className="slb-body-copy" style={{ marginTop: "10px" }}>
                  Not available.
                </p>
              ) : (
                <div className="slb-stack" style={{ marginTop: "10px" }}>
                  <p className="slb-body-copy">{comparison.totalFilesChanged} changed files</p>
                  <p className="slb-body-copy">{comparison.filesAdded} added</p>
                  <p className="slb-body-copy">{comparison.filesDeleted} deleted</p>
                  <p className="slb-body-copy">{comparison.filesModified} modified</p>
                  <p className="slb-body-copy">{comparison.filesRenamed} renamed</p>
                </div>
              )}
            </article>
          </div>
        </div>
      </section>

      <section className="slb-grid-2">
        <article className="slb-card">
          <div className="slb-section-head">
            <div>
              <span className="slb-kicker">Upstream Head</span>
              <h3>{comparison.upstreamHead.sha.slice(0, 12)}</h3>
            </div>
          </div>
          <div className="slb-card-body slb-stack">
            <p>{comparison.upstreamHead.message}</p>
            <p className="slb-note">
              {comparison.upstreamHead.authorName} • {new Date(comparison.upstreamHead.committedDate).toLocaleString()}
            </p>
            <a href={comparison.upstreamHead.commitUrl} target="_blank" rel="noopener noreferrer" className="slb-link-arrow">
              View Upstream Head Commit ->
            </a>
          </div>
        </article>

        <article className="slb-card">
          <div className="slb-section-head">
            <div>
              <span className="slb-kicker">Fork Head</span>
              <h3>{comparison.forkHead.sha.slice(0, 12)}</h3>
            </div>
          </div>
          <div className="slb-card-body slb-stack">
            <p>{comparison.forkHead.message}</p>
            <p className="slb-note">
              {comparison.forkHead.authorName} • {new Date(comparison.forkHead.committedDate).toLocaleString()}
            </p>
            <a href={comparison.forkHead.commitUrl} target="_blank" rel="noopener noreferrer" className="slb-link-arrow">
              View Fork Head Commit ->
            </a>
          </div>
        </article>
      </section>

      {comparison.diffUnavailable ? (
        <section className="slb-alert slb-alert--warn">
          <p>{comparison.diffUnavailableReason ?? "GitHub could not generate the diff for this comparison."}</p>
          <p style={{ marginTop: "8px" }}>
            This is a GitHub API limitation for this comparison range. Estimated commit distance and recent unique
            commits are shown below.
          </p>
          <div className="slb-action-row" style={{ marginTop: "12px" }}>
            <a href={comparison.compareUrl} target="_blank" rel="noopener noreferrer" className="slb-link-arrow">
              Open Comparison On GitHub ->
            </a>
          </div>
        </section>
      ) : null}

      {comparison.diffUnavailable ? (
        <section className="slb-grid-2">
          <article className="slb-card">
            <div className="slb-section-head">
              <div>
                <span className="slb-kicker">Estimated Distance</span>
                <h3>Recent Fork-Only Commits</h3>
              </div>
            </div>
            <div className="slb-card-body">
              {comparison.forkUniqueCommits.length === 0 ? (
                <p className="slb-body-copy">No fork-only commits found in scanned history.</p>
              ) : (
                <div className="slb-stack">
                  {comparison.forkUniqueCommits.map((commit) => (
                    <div key={commit.sha} className="slb-inset-card">
                      <a href={commit.commitUrl} target="_blank" rel="noopener noreferrer" className="slb-link-arrow">
                        {commit.sha.slice(0, 10)} ->
                      </a>
                      <p style={{ marginTop: "8px" }}>{commit.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>

          <article className="slb-card">
            <div className="slb-section-head">
              <div>
                <span className="slb-kicker">Estimated Distance</span>
                <h3>Recent Upstream-Only Commits</h3>
              </div>
            </div>
            <div className="slb-card-body">
              {comparison.upstreamUniqueCommits.length === 0 ? (
                <p className="slb-body-copy">No upstream-only commits found in scanned history.</p>
              ) : (
                <div className="slb-stack">
                  {comparison.upstreamUniqueCommits.map((commit) => (
                    <div key={commit.sha} className="slb-inset-card">
                      <a href={commit.commitUrl} target="_blank" rel="noopener noreferrer" className="slb-link-arrow">
                        {commit.sha.slice(0, 10)} ->
                      </a>
                      <p style={{ marginTop: "8px" }}>{commit.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        </section>
      ) : null}

      {comparison.files.length > 0 ? (
        <section className="slb-card">
          <div className="slb-section-head">
            <div>
              <span className="slb-kicker">Changed Files</span>
              <h2>Patch Review</h2>
            </div>
          </div>
          <div className="slb-card-body slb-stack">
            {comparison.files.map((file) => (
              <article key={file.filename} className="slb-inset-card">
                <div className="slb-inline-meta">
                  <span className="slb-pill">{file.status}</span>
                  <span className="slb-mono">{file.filename}</span>
                  <span className="slb-note">+{file.additions}</span>
                  <span className="slb-note">-{file.deletions}</span>
                  <span className="slb-note">{file.changes} changes</span>
                </div>
                {file.patch ? (
                  <pre className="slb-pre" style={{ marginTop: "12px" }}>
                    {file.patch}
                  </pre>
                ) : (
                  <p className="slb-note" style={{ marginTop: "12px" }}>
                    No patch text available for this file.
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
