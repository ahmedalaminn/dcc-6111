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