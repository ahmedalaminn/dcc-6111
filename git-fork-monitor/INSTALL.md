# Installation Guide — Git Fork Monitor

---

## Prerequisites

### Hardware

Any machine capable of running Node.js 18+. No specialized hardware is required. The application is a Next.js web app served over HTTP and accessed via browser.

Validated on:
- macOS 13+ (x86-64 and Apple Silicon)
- Ubuntu 22.04 / 24.04 (x86-64)
- Windows 11 via WSL2

### Software

| Requirement | Minimum Version | Download |
|---|---|---|
| Node.js | 18.x LTS | https://nodejs.org/en/download |
| npm | 9.x | Included with Node.js |
| git | 2.x | https://git-scm.com/downloads |

Verify your installation:

```bash
node --version    # must be 18.x or higher
npm --version
git --version
```

### GitHub Account and OAuth App

The application authenticates users with GitHub OAuth. Before installing, you must create a GitHub OAuth App in your (or your organization's) GitHub account.

#### Create the OAuth App

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App** (direct link: https://github.com/settings/applications/new).
2. Fill in the form:

   | Field | Value |
   |---|---|
   | Application name | Git Fork Monitor (or any name) |
   | Homepage URL | `http://localhost:3000` |
   | Authorization callback URL | `http://localhost:3000/api/auth/callback/github` |

3. Click **Register application**.
4. On the next page, note the **Client ID**.
5. Click **Generate a new client secret** and note the **Client Secret** (it is only shown once).

---

## Dependent Libraries

All dependencies are installed automatically by `npm install`. Key runtime dependencies:

| Library | Version | Purpose | Link |
|---|---|---|---|
| Next.js | 16.x | React framework and server runtime | https://nextjs.org/ |
| NextAuth | 4.x | GitHub OAuth authentication | https://next-auth.js.org/ |
| Octokit | 5.x | GitHub REST API client | https://github.com/octokit/octokit.js |
| React | 19.x | UI framework | https://react.dev/ |
| Tailwind CSS | 4.x | Utility CSS framework | https://tailwindcss.com/ |
| TypeScript | 5.x | Type checking | https://www.typescriptlang.org/ |

---

## Download Instructions

Clone the repository from GitHub:

```bash
git clone https://github.com/ahmedalaminn/dcc-6111.git
cd dcc-6111/git-fork-monitor
```

If you do not have git, download a ZIP archive from the repository's GitHub page using **Code → Download ZIP**, then extract it:

```bash
unzip dcc-6111-main.zip
cd dcc-6111-main/git-fork-monitor
```

---

## Build Instructions

### Development mode (recommended for evaluation)

No build step is required for development mode. `npm run dev` compiles on demand.

### Production build (optional)

```bash
npm run build
```

This compiles the Next.js application and outputs optimized assets. Required before running `npm start` (the production server).

---

## Installation

### Step 1 — Install Node.js dependencies

```bash
cd dcc-6111/git-fork-monitor
npm install
```

This installs all packages listed in `package.json` into `node_modules/`. It may take 1–2 minutes on first run.

### Step 2 — Create the environment variable file

Create a file named `.env.local` in the `git-fork-monitor/` directory. This file is not committed to git and must be created manually on each machine.

```bash
# git-fork-monitor/.env.local

GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace_with_a_long_random_secret
```

Replace the placeholders:
- `GITHUB_CLIENT_ID` — the Client ID from your GitHub OAuth App (step 4 of the OAuth App creation above).
- `GITHUB_CLIENT_SECRET` — the Client Secret from step 5.
- `NEXTAUTH_SECRET` — any long random string; used to sign the session cookie. Generate one with:

  ```bash
  openssl rand -base64 32
  ```

> **Never commit `.env.local` to git.** The `.gitignore` already excludes it.

---

## Run Instructions

### Development mode

```bash
cd dcc-6111/git-fork-monitor
npm run dev
```

The application starts at:

```
http://localhost:3000
```

Open the URL in a browser and click **Sign In With GitHub** to authenticate.

### Production mode

Build first, then start the production server:

```bash
npm run build
npm start
```

The production server also serves on `http://localhost:3000` by default.

### Linting

```bash
npm run lint
```

---

## Troubleshooting

### `node: command not found` or `npm: command not found`

Node.js is not installed or not on the PATH.

- **macOS:** Install via https://nodejs.org/en/download or Homebrew: `brew install node`
- **Ubuntu/Debian:** `sudo apt install nodejs npm` (ensure version ≥ 18; use `nvm` if the system package is older)
- **Windows:** Install the LTS release from https://nodejs.org/en/download and restart your terminal

---

### `npm install` fails with network errors

The machine may not have internet access or npm's registry may be unreachable.

```bash
# Check connectivity
ping registry.npmjs.org

# Retry with verbose output to identify which package failed
npm install --verbose
```

---

### `Error: GITHUB_CLIENT_ID is not set` or similar environment errors at startup

The `.env.local` file is missing or empty. Create it as described in Step 2 of the Installation section.

---

### Sign-in fails with "redirect_uri_mismatch" error on GitHub

The callback URL registered in your GitHub OAuth App does not match the one the application is using. Verify that the **Authorization callback URL** in your OAuth App settings is exactly:

```
http://localhost:3000/api/auth/callback/github
```

If you are running on a different port or hostname, update both the OAuth App settings on GitHub and the `NEXTAUTH_URL` in `.env.local`.

---

### Sign-in completes but the page shows "Access Token Required"

The GitHub access token was not returned by NextAuth. Sign out and sign back in. If the problem persists, verify that the `NEXTAUTH_SECRET` in `.env.local` is set and consistent across server restarts.

---

### Scan returns an error about GitHub API rate limits (403 / 429)

GitHub's API allows 5000 requests per hour for authenticated users. Deep scans across many large repositories can exhaust this limit.

- Switch to **Quick** mode (100 commits per branch).
- Narrow the repository scope using the repository selector.
- Wait until the rate limit resets (the X-RateLimit-Reset header in the API response gives the reset time).

---

### Fork comparison shows "Not available" for all metrics

The GitHub compare API returned a diff-unavailable error for that fork pair. The application has automatically fallen back to commit history estimation. Open the **GitHub Comparison** link in the file divergence table to see the full result on GitHub.

---

### `npm run build` fails with TypeScript errors

Run the linter to see the errors:

```bash
npm run lint
```

Ensure all `.env.local` variables are set before building, as some type checks reference environment variable shapes.

---

### Port 3000 is already in use

Another process is using port 3000.

```bash
# Find the process
lsof -i :3000

# Kill it, or run Next.js on a different port
PORT=3001 npm run dev
```

If you change the port, also update `NEXTAUTH_URL` in `.env.local` and the **Authorization callback URL** in your GitHub OAuth App to match.
