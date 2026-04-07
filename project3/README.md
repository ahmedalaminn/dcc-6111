# Project 3 - Git Fork Monitor

## GitHub Login Setup

This project now includes GitHub login logic using NextAuth.

### 1. Create a GitHub OAuth App

In GitHub settings, create an OAuth app with:

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

### 2. Add local environment variables 

Create `project3/.env.local` with:

```bash
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace_with_a_long_random_secret
```

### 3. Run the app

```bash
npm run dev
```

Open `http://localhost:3000` and use the `Sign in with GitHub` button.

## Project-Level Fork Scan

After signing in, the home page supports project-level scanning across all owned repositories and their forks.

### Scan modes

- Quick preset: scans 100 commits of history per branch.
- Standard preset: scans 300 commits of history per branch.
- Deep preset: scans 600 commits of history per branch.
- Custom mode: requires an explicit commit depth input.

Custom depth is validated server-side and must be a whole number between 20 and 1000.

### Lag threshold modes

- Strict: tighter stale-fork threshold (about 25% stricter than baseline).
- Balanced: default baseline thresholds by repository size tier.
- Relaxed: looser threshold (about 50% more tolerant than baseline).
- Custom: uses explicit custom values for commit lag and no-sync days.

Custom lag values are validated server-side:

- Commit threshold: 1 to 5000
- No-sync days threshold: 1 to 3650

### What the scan reports

- Fork alignment by commit distance (`ahead`/`behind`) and changed files/lines.
- Lagging fork ranking using repository-size tiers and no-sync age:
	- Small repositories: lagging at 20+ commits behind or 14+ days without sync.
	- Medium repositories: lagging at 50+ commits behind or 21+ days without sync.
	- Large repositories: lagging at 100+ commits behind or 30+ days without sync.
- Framework adoption from repository root signatures (for example `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`) with:
	- Coverage ratio (`forks using framework / analyzed forks`)
	- Weighted adoption score (activity-weighted usage across analyzed forks)

### Notes

- Scan mode selection is required before analysis runs.
- Scan preferences are persisted in the authenticated NextAuth session token.
- Fork rows link directly to the detailed fork comparison page.
- If GitHub cannot provide a detailed diff for a pair, the app falls back to estimated distance from scanned commit history.