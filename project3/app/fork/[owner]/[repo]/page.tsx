import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { fetchForkComparison, fetchRepoBranches } from "@/lib/github";
import type { BranchSummary } from "@/lib/github";

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
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 py-12 text-zinc-900">
        <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Fork Comparison</h1>
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
          <h1 className="text-2xl font-semibold tracking-tight">Fork Comparison</h1>
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

  const routeParams = await params;
  const query = await searchParams;

  const upstreamOwner = query.upstreamOwner;
  const upstreamRepo = query.upstreamRepo;
  const upstreamBranch = query.upstreamBranch;
  const forkBranch = query.forkBranch;

  if (!upstreamOwner || !upstreamRepo || !upstreamBranch || !forkBranch) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 py-12 text-zinc-900">
        <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Fork Comparison</h1>
          <p className="mt-4 text-sm text-zinc-700">
            Missing comparison context. Please return to the repository list and open the fork again.
          </p>
          <div className="mt-6">
            <Link href="/" className="text-sm text-zinc-700 underline">
              Back to repositories
            </Link>
          </div>
        </main>
      </div>
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
    // Keep comparison usable even if branch listing fails.
  }

  let comparison;
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
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 py-12 text-zinc-900">
        <main className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-red-700">Comparison Error</h1>
          <p className="mt-4 text-sm text-red-700">{errorMessage ?? "Unable to compute comparison."}</p>
          <div className="mt-6">
            <Link href="/" className="text-sm text-zinc-700 underline">
              Back to repositories
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const forkRepositoryUrl = `https://github.com/${comparison.forkOwner}/${comparison.forkRepo}`;

  return (
    <div className="min-h-screen bg-zinc-100 px-6 py-10 text-zinc-900">
      <main className="mx-auto w-full max-w-6xl space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">
              <a
                href={forkRepositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 hover:underline"
              >
                {comparison.forkOwner}/{comparison.forkRepo}
              </a>
            </h1>
            <Link href="/" className="text-sm text-zinc-700 underline">
              Back to repositories
            </Link>
          </div>
          <p className="mt-2 text-sm text-zinc-600">
            Comparing fork branch <span className="font-mono">{comparison.forkBranch}</span> against upstream
            <span className="ml-1 font-mono">
              {comparison.upstreamOwner}/{comparison.upstreamRepo}:{comparison.upstreamBranch}
            </span>
          </p>

          <form method="GET" className="mt-4 grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="upstreamOwner" value={upstreamOwner} />
            <input type="hidden" name="upstreamRepo" value={upstreamRepo} />

            <label className="text-sm text-zinc-700">
              <span className="mb-1 block">Upstream branch</span>
              <select
                name="upstreamBranch"
                defaultValue={upstreamBranch}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
              >
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

            <label className="text-sm text-zinc-700">
              <span className="mb-1 block">Fork branch</span>
              <select
                name="forkBranch"
                defaultValue={forkBranch}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
              >
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

            <button
              type="submit"
              className="self-end rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Compare
            </button>
          </form>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Commit Distance</p>
            {comparison.aheadBy !== null && comparison.behindBy !== null ? (
              <>
                <p className="mt-2 text-sm text-zinc-700">
                  Fork -&gt; Upstream: <span className="font-mono text-green-700">+{comparison.aheadBy}</span>
                </p>
                <p className="text-sm text-zinc-700">
                  Upstream -&gt; Fork: <span className="font-mono text-amber-700">+{comparison.behindBy}</span>
                </p>
                <p className="mt-1 text-xs text-zinc-500">Arrow direction shows where commits need to be merged.</p>
                {comparison.commonAncestorSha ? (
                  <p className="mt-2 text-xs text-zinc-500">Common ancestor: {comparison.commonAncestorSha.slice(0, 12)}</p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-zinc-600">Unavailable for this compare request.</p>
            )}
          </article>
          <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Line Changes</p>
            {comparison.diffUnavailable ? (
              <p className="mt-2 text-sm text-zinc-600">Unavailable for this compare request.</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-green-700">+{comparison.totalAdditions} added</p>
                <p className="text-sm text-red-700">-{comparison.totalDeletions} deleted</p>
                <p className="text-sm text-zinc-700">{comparison.totalChanges} total changed</p>
              </>
            )}
          </article>
          <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">File Changes</p>
            {comparison.diffUnavailable ? (
              <p className="mt-2 text-sm text-zinc-600">Unavailable for this compare request.</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-zinc-700">{comparison.totalFilesChanged} changed files</p>
                <p className="text-sm text-zinc-700">{comparison.filesAdded} added</p>
                <p className="text-sm text-zinc-700">{comparison.filesDeleted} deleted</p>
                <p className="text-sm text-zinc-700">{comparison.filesModified} modified</p>
                <p className="text-sm text-zinc-700">{comparison.filesRenamed} renamed</p>
              </>
            )}
          </article>
        </section>

        {comparison.diffUnavailable ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-900 shadow-sm">
            <h2 className="text-base font-semibold">Detailed Diff Not Available</h2>
            <p className="mt-2 text-sm">
              {comparison.diffUnavailableReason ?? "GitHub could not generate the diff for this comparison."}
            </p>
            <p className="mt-2 text-sm">
              This is a GitHub API limitation for this comparison range. Estimated commit distance and recent unique
              commits are shown below.
            </p>
            <a
              href={comparison.compareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex text-sm font-medium underline"
            >
              Open comparison on GitHub
            </a>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Upstream Head</p>
            <p className="mt-2 text-sm font-mono text-zinc-900">{comparison.upstreamHead.sha.slice(0, 12)}</p>
            <p className="mt-1 text-sm text-zinc-800">{comparison.upstreamHead.message}</p>
            <p className="mt-1 text-xs text-zinc-600">
              {comparison.upstreamHead.authorName} • {new Date(comparison.upstreamHead.committedDate).toLocaleString()}
            </p>
            <a
              href={comparison.upstreamHead.commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex text-xs font-medium underline"
            >
              View upstream head commit
            </a>
          </article>

          <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Fork Head</p>
            <p className="mt-2 text-sm font-mono text-zinc-900">{comparison.forkHead.sha.slice(0, 12)}</p>
            <p className="mt-1 text-sm text-zinc-800">{comparison.forkHead.message}</p>
            <p className="mt-1 text-xs text-zinc-600">
              {comparison.forkHead.authorName} • {new Date(comparison.forkHead.committedDate).toLocaleString()}
            </p>
            <a
              href={comparison.forkHead.commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex text-xs font-medium underline"
            >
              View fork head commit
            </a>
          </article>
        </section>

        {comparison.diffUnavailable ? (
          <section className="grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-800">Recent Fork-Only Commits</h3>
              {comparison.forkUniqueCommits.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600">No fork-only commits found in scanned history.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {comparison.forkUniqueCommits.map((commit) => (
                    <li key={commit.sha} className="text-sm">
                      <a href={commit.commitUrl} target="_blank" rel="noopener noreferrer" className="underline">
                        {commit.sha.slice(0, 10)}
                      </a>
                      <span className="ml-2 text-zinc-700">{commit.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-800">Recent Upstream-Only Commits</h3>
              {comparison.upstreamUniqueCommits.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600">No upstream-only commits found in scanned history.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {comparison.upstreamUniqueCommits.map((commit) => (
                    <li key={commit.sha} className="text-sm">
                      <a href={commit.commitUrl} target="_blank" rel="noopener noreferrer" className="underline">
                        {commit.sha.slice(0, 10)}
                      </a>
                      <span className="ml-2 text-zinc-700">{commit.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        ) : null}

        {comparison.files.length > 0 ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Changed Files</h2>
            <ul className="mt-4 space-y-4">
              {comparison.files.map((file) => (
                <li key={file.filename} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded bg-zinc-200 px-2 py-0.5 font-mono text-xs uppercase text-zinc-700">
                      {file.status}
                    </span>
                    <span className="font-mono text-zinc-900">{file.filename}</span>
                    <span className="text-green-700">+{file.additions}</span>
                    <span className="text-red-700">-{file.deletions}</span>
                    <span className="text-zinc-700">{file.changes} changes</span>
                  </div>
                  {file.patch ? (
                    <pre className="mt-3 overflow-x-auto rounded-md border border-zinc-200 bg-white p-3 text-xs leading-5 text-zinc-800">
                      {file.patch}
                    </pre>
                  ) : (
                    <p className="mt-3 text-xs text-zinc-500">No patch text available for this file.</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
