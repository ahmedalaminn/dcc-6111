import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { fetchOwnedReposWithForks } from "@/lib/github";
import type { RepoWithForks } from "@/lib/github";

type HomeProps = {
  searchParams?: Promise<{
    showAllRepos?: string;
  }>;
};

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
        <span className="slb-kicker">Authentication</span>
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

export default async function Home({ searchParams }: HomeProps) {
  const session = await getServerSession(authOptions);
  const query = (await searchParams) ?? {};
  const showOnlyWithForks = query.showAllRepos !== "1";
  const displayUser = session?.user?.name ?? session?.githubLogin ?? session?.user?.email ?? "GitHub user";

  if (!session) {
    return (
      <AuthCard
        title="GitHub Login"
        body="You are not signed in. Use GitHub to authenticate for repository and fork analysis."
        href="/api/auth/signin/github"
        action="Sign In With GitHub ->"
      />
    );
  }

  if (!session.accessToken) {
    return (
      <AuthCard
        title="Access Token Required"
        body="The GitHub access token is missing from the current session. Sign out and sign back in to continue."
        href="/api/auth/signout"
        action="Sign Out ->"
      />
    );
  }

  let errorMessage: string | null = null;
  let repositories: RepoWithForks[] = [];

  try {
    repositories = await fetchOwnedReposWithForks(session.accessToken);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Failed to load repositories.";
  }

  const visibleRepositories = showOnlyWithForks
    ? repositories.filter((repository) => repository.forks.length > 0)
    : repositories;

  return (
    <div className="slb-page">
      <section className="slb-card">
        <div className="slb-section-head">
          <div>
            <span className="slb-kicker">Project 3</span>
            <h1>Repository Inventory</h1>
          </div>
          <Link href={showOnlyWithForks ? "/?showAllRepos=1" : "/"} className="slb-button-secondary">
            {showOnlyWithForks ? "Show All Repositories ->" : "Show Only Forked Repositories ->"}
          </Link>
        </div>
        <div className="slb-card-body slb-stack">
          <p className="slb-body-copy">
            Signed in as <strong>{displayUser}</strong>. Review owned repositories, identify forked estates, and open
            the project scan workspace for deeper alignment analysis.
          </p>

          <div className="slb-inline-meta">
            <span className="slb-pill">Owned repositories: {repositories.length}</span>
            <span className="slb-pill">Visible repositories: {visibleRepositories.length}</span>
            <span className="slb-pill">Filter: {showOnlyWithForks ? "forks only" : "all repositories"}</span>
          </div>

          <div className="slb-action-row">
            <Link href="/scan" className="slb-button">
              Open Scan Workspace -&gt;
            </Link>
            <Link href="/api/auth/signout" className="slb-button-secondary">
              Sign Out -&gt;
            </Link>
          </div>

          <section className="slb-inset-card">
            <span className="slb-kicker">Scan Capability</span>
            <p className="slb-body-copy" style={{ marginTop: "8px" }}>
              Run project-level fork alignment, lagging analysis, framework adoption, and file comparison across the
              selected repository set.
            </p>
            <div className="slb-action-row" style={{ marginTop: "14px" }}>
              <Link href="/scan" className="slb-link-arrow">
                Enter Project Scan -&gt;
              </Link>
            </div>
          </section>
        </div>
      </section>

      {errorMessage ? (
        <section className="slb-alert slb-alert--error">{errorMessage}</section>
      ) : (
        <section className="slb-list">
          {visibleRepositories.map((repository) => (
            <article key={repository.id}>
              <div className="slb-inline-meta">
                <a href={repository.htmlUrl} target="_blank" rel="noopener noreferrer">
                  <h3>{repository.fullName}</h3>
                </a>
                <span className="slb-pill">{repository.isPrivate ? "private" : "public"}</span>
                <span className="slb-pill">forks: {repository.forksCount}</span>
              </div>

              {repository.forks.length > 0 ? (
                <div className="slb-fork-list">
                  {repository.forks.map((fork) => (
                    <div key={fork.id} className="slb-fork-item">
                      <Link
                        href={{
                          pathname: `/fork/${fork.ownerLogin}/${fork.name}`,
                          query: {
                            upstreamOwner: repository.ownerLogin,
                            upstreamRepo: repository.name,
                            upstreamBranch: repository.defaultBranch,
                            forkBranch: fork.defaultBranch,
                          },
                        }}
                      >
                        {fork.fullName}
                      </Link>
                      <p className="slb-note" style={{ marginTop: "6px" }}>
                        Owner: {fork.ownerLogin}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="slb-note" style={{ marginTop: "14px" }}>
                  No forks available for this repository under the current inventory slice.
                </p>
              )}
            </article>
          ))}

          {visibleRepositories.length === 0 ? (
            <article>
              <span className="slb-kicker">No Matching Results</span>
              <p className="slb-body-copy" style={{ marginTop: "8px" }}>
                No repositories matched the current fork filter.
              </p>
            </article>
          ) : null}
        </section>
      )}
    </div>
  );
}
