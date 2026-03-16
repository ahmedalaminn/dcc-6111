import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { fetchOwnedReposWithForks } from "@/lib/github";
import type { RepoWithForks } from "@/lib/github";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const displayUser = session?.user?.name ?? session?.githubLogin ?? session?.user?.email ?? "GitHub user";

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 py-12 text-zinc-900">
        <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">GitHub Login</h1>
          <div className="mt-6 space-y-4">
            <p className="text-sm text-zinc-700">You are not signed in. Use GitHub to authenticate.</p>
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
          <h1 className="text-2xl font-semibold tracking-tight">GitHub Repositories</h1>
          <p className="mt-4 text-sm text-zinc-700">
            Missing GitHub access token. Please sign out and sign back in.
          </p>
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

  let errorMessage: string | null = null;
  let repositories: RepoWithForks[] = [];

  try {
    repositories = await fetchOwnedReposWithForks(session.accessToken);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Failed to load repositories.";
  }

  return (
    <div className="min-h-screen bg-zinc-100 px-6 py-10 text-zinc-900">
      <main className="mx-auto w-full max-w-5xl space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">GitHub Repositories</h1>
          <p className="mt-2 text-sm text-zinc-700">
            Signed in as <span className="font-semibold">{displayUser}</span>
          </p>
          <div className="mt-4">
            <Link
              href="/api/auth/signout"
              className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Sign out
            </Link>
          </div>
        </section>

        {errorMessage ? (
          <section className="rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700 shadow-sm">
            {errorMessage}
          </section>
        ) : (
          <section className="space-y-4">
            {repositories.map((repository) => (
              <article key={repository.id} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={repository.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg font-semibold hover:underline"
                  >
                    {repository.fullName}
                  </a>
                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                    {repository.isPrivate ? "private" : "public"}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                    forks: {repository.forksCount}
                  </span>
                </div>

                <div className="mt-4">
                  {repository.forks.length === 0 ? (
                    <p className="text-sm text-zinc-600">No forks found.</p>
                  ) : (
                    <ul className="space-y-2">
                      {repository.forks.map((fork) => (
                        <li key={fork.id} className="text-sm">
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
                            className="text-zinc-800 hover:underline"
                          >
                            {fork.fullName}
                          </Link>
                          <span className="ml-2 text-zinc-500">by {fork.ownerLogin} </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
