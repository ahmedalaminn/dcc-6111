# Release Notes — Git Fork Monitor

## Version 1.0 — Initial Release

**Release Date:** April 2026
**Platform:** Any machine with Node.js 18+; deployed as a Next.js web application accessible via browser

---

## New Features

This is the first release. The following primary features were developed by the team:

### GitHub OAuth Authentication
- Users sign in with their GitHub account via **NextAuth** and a registered GitHub OAuth App.
- The authenticated session carries a GitHub access token used for all API calls.
- Scan preferences (scan mode, lag mode, selected repositories, custom thresholds) are persisted in the encrypted NextAuth session token — preferences survive page refreshes without a database.
- Unauthenticated users are redirected to a sign-in card; sessions with a missing access token prompt the user to re-authenticate.

### Repository Inventory
- After sign-in, the home page lists all **owned repositories** (up to 20) fetched from the GitHub API.
- Each repository entry shows fork count, visibility (public / private), and links to individual fork detail pages.
- A toggle lets the user switch between showing only repositories that have forks and showing all repositories.

### Project-Level Fork Scan
- The **Scan Workspace** (`/scan`) runs a configurable multi-repository fork analysis across all owned repositories with forks.
- Repository scope can be narrowed to a specific subset using a multi-select picker.
- Four **scan modes** control how many commits of history are fetched per branch:

  | Mode | Commit Depth |
  |---|---|
  | Quick | 100 commits |
  | Standard | 300 commits |
  | Deep | 600 commits |
  | Custom | 20 – 1000 commits (user-specified) |

- Four **lag threshold modes** control when a fork is classified as *Lagging*:

  | Mode | Behavior |
  |---|---|
  | Strict | ~25% tighter than the baseline thresholds |
  | Balanced | Default size-tiered thresholds |
  | Relaxed | ~50% more tolerant than baseline |
  | Custom | User-specified commit lag and no-sync days thresholds |

- Baseline lag thresholds are tiered by repository size:

  | Repository Size | Commit Lag | No-Sync Days |
  |---|---|---|
  | Small (< 5 MB) | 20 commits | 14 days |
  | Medium (5 – 50 MB) | 50 commits | 21 days |
  | Large (> 50 MB) | 100 commits | 30 days |

- Custom threshold inputs are validated server-side (commit lag: 1–5000; no-sync days: 1–3650).

### Fork Alignment Analysis
- For each analyzed fork the system computes:
  - **Ahead / behind commit counts** via the GitHub compare API.
  - **Days since last fork sync** derived from the fork's most recent commit date.
  - **Fork status**: Up-to-date / Slightly behind / Lagging, with a plain-English reason string.
  - **File change summary**: total files changed, lines added, lines removed, and a size classification (Small change / Moderate change / Large divergence).
- Results are ranked by status severity (Lagging first), then by commit distance.
- Each fork row links directly to a detailed fork comparison page (`/fork/:owner/:repo`).

### GitHub API Diff Fallback
- When the GitHub compare API cannot produce a diff (very large repositories or diverged history), the system automatically falls back to **commit history scanning**: it fetches the commit histories of both branches and locates the common ancestor SHA to estimate ahead/behind counts.
- The fallback is transparent to the user; affected rows are annotated with an explanation and link to the GitHub comparison page for the full result.

### Framework Adoption Analysis
- Detects the technology stack used in each analyzed fork by scanning the repository root for framework signature files (e.g., `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pom.xml`).
- Supported frameworks: Node.js, Python, Go, Rust, Java, .NET, Ruby, PHP.
- Reports for each detected framework:
  - **Fork coverage ratio** — fraction of analyzed forks using the framework.
  - **Upstream coverage ratio** — fraction of scanned upstream repositories using the framework.
  - **Weighted adoption score** — activity-weighted usage (recently active forks contribute more weight).
  - **Drift status** — No drift / Moderate drift / High drift based on the gap between fork and upstream usage.

### Concurrent API Fetching
- All fork comparisons are fetched concurrently with a concurrency limit of 4 to stay within GitHub API rate limits while minimizing scan time.

---

## Bug Fixes

The following bugs were identified and resolved during development:

| # | Bug | Root Cause | Fix |
|---|---|---|---|
| 1 | **Custom scan depth not applied when lag threshold mode is also custom** | The `resolveScanConfig` function processed lag-custom and depth-custom branches independently; the combined case fell through without applying the custom depth | Added explicit handling for the combined `lagThresholdMode === "custom"` + `customCommitDepth !== undefined` case in `resolveScanConfig` |
| 2 | **Scan preferences not restored across page navigations** | Session token was read but preferences were not re-applied to the scan form on subsequent page loads | Scan parameters are now seeded from `session.scanPreferences` when the URL query string does not supply them, giving query-string values priority over stored preferences |
| 3 | **`daysSinceForkSync` computed with stale `new Date()` across concurrent forks** | `new Date()` was called inside each concurrent fork worker, making the reference time drift slightly across the batch | `now` is captured once before the concurrent map begins and passed into each worker |

---

## Known Bugs and Defects

| # | Issue | Impact | Workaround |
|---|---|---|---|
| 1 | **Repository list is capped at 20 repos, forks at 20 per repo** | Accounts with more than 20 repositories or repositories with more than 20 forks will see truncated results | No workaround in the current release; the cap is a deliberate guard against GitHub API rate limit exhaustion |
| 2 | **Framework detection only scans the repository root** | Frameworks declared in subdirectories (e.g., a monorepo with `services/api/package.json`) are not detected | The full tree is requested from the GitHub API, but only the file names (not paths) are matched against signatures — a monorepo may report a framework as missing even if it is present in a subdirectory |
| 3 | **Scan does not run automatically when the page loads** — the user must select a scan mode and submit the form before results appear | Users arriving at `/scan` for the first time see an empty results area with a prompt to select a scan profile | Select a scan profile from the form controls and click the scan button to trigger the analysis |
| 4 | **GitHub API rate limit (5000 requests/hour for authenticated users)** can be exhausted by deep scans across many large repositories | The scan may fail partway through with a 403 or 429 response from the GitHub API | Use Quick mode and narrow the repository scope when scanning accounts with many large repositories |
| 5 | **No server-side caching of scan results** | Each page load re-fetches all data from the GitHub API; repeated scans in quick succession consume rate limit budget | Wait at least 60 seconds between scans on the same account |
| 6 | **The detailed fork comparison page (`/fork/:owner/:repo`) is not included in the initial release** | Clicking a fork row from the scan results or repository inventory opens a route that may return a 404 | Navigate using the "Open GitHub Comparison" link in the file divergence table, which opens the comparison directly on GitHub |
