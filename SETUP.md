# Set up Creed Open

Creed Open is a private, single-owner application. It runs anywhere that can host a Node.js application and uses Supabase for its database, Auth, and file storage.

The guided installer is the recommended path. Manual instructions are included for environments where an interactive terminal is unavailable.

## What you need

- Node.js 22 or newer
- npm 10 or newer
- Git
- A free or paid Supabase project

The repository includes a pinned Supabase CLI. You do not need to install it globally. No email provider, payment provider, hosted login provider, or Creed-managed AI key is required.

## Guided local setup

Clone Creed and install its dependencies:

```bash
git clone https://github.com/connorhpbrn/creed.git
cd creed
npm install
```

Create a Supabase project at [database.new](https://database.new). Keep the database password somewhere safe because the Supabase CLI may request it when linking the project.

Run the installer:

```bash
npm run setup
```

The installer:

1. checks Node.js, npm, Git, and the pinned Supabase CLI;
2. collects and validates the site URL and Supabase keys;
3. generates the private owner and encryption secrets;
4. creates or safely updates `apps/open/.env.local` with private file permissions;
5. signs into the Supabase CLI when needed;
6. derives and links the project reference;
7. previews the database migrations;
8. asks before applying any database change;
9. verifies the finished installation.

The installer never prints saved secrets. Existing unrelated environment values and comments are preserved.

When setup succeeds, start Creed:

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001), enter the generated owner secret from `apps/open/.env.local`, and complete Personal onboarding.

## Check an installation

Run the read-only doctor at any time:

```bash
npm run doctor
```

It checks local requirements, required configuration, Supabase connectivity, and the Creed database version without changing files or database state. The previous command remains available as an alias:

```bash
npm run setup -- --check
```

## Supabase values

Open the Supabase project's **Connect** dialog or **Settings → API Keys** and use:

- Project URL for `NEXT_PUBLIC_SUPABASE_URL`
- Publishable key, beginning with `sb_publishable_`, for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Secret key, beginning with `sb_secret_`, for `SUPABASE_SECRET_KEY`

The publishable key is included in browser requests and relies on Row Level Security. The secret key has elevated server access and must never be exposed to the browser, committed, shared in an issue, or prefixed with `NEXT_PUBLIC_`.

Creed's migrations enable RLS and install the tables, functions, grants, policies, and storage configuration the application needs.

## Manual setup

Copy the environment template:

```bash
cp apps/open/.env.example apps/open/.env.local
```

Generate the private secrets:

```bash
openssl rand -base64 48
openssl rand -base64 32
```

Set every required value in `apps/open/.env.local`, then restrict the file:

```bash
chmod 600 apps/open/.env.local
```

Link Supabase and preview the database changes:

```bash
cd apps/open
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
```

Apply the migrations after reviewing the preview:

```bash
npx supabase db push
cd ../..
npm run doctor
```

The project reference is the first part of the project URL. For `https://abcdefgh.supabase.co`, it is `abcdefgh`.

## Deploy to Vercel

1. Fork Creed and import the repository into Vercel.
2. Set the Vercel project root directory to `apps/open`.
3. Add the required values from `apps/open/.env.example` to the Production environment.
4. Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS origin without a trailing slash.
5. From a local clone, link the production Supabase project and run `npx supabase db push --dry-run` from `apps/open`.
6. Review and apply the migrations with `npx supabase db push`.
7. Deploy, open the final URL, and claim the installation with `CREED_OWNER_SECRET`.
8. Verify onboarding, a database save, export, and one agent connection.

Do not place server secrets in variables prefixed with `NEXT_PUBLIC_`. Use separate Supabase projects and secrets for production and development installations that contain real data.

## Other Node.js hosts

Creed's runtime is platform-neutral. A host needs to:

1. install dependencies with `npm install`;
2. build the Open workspace with `npm run build --workspace creed-open`;
3. start it with `npm run start --workspace creed-open`;
4. provide the required environment values;
5. expose the configured `NEXT_PUBLIC_SITE_URL` origin over HTTPS.

The supported v1 deployment guide is Vercel. Railway and Docker presets can be added later without changing the shared application or Supabase database model.

## Owner access

`CREED_OWNER_SECRET` authorises a browser once. Creed then stores a signed, HTTP-only owner cookie and a hidden Supabase session in that browser. There is no recurring login screen.

- Use the same owner secret to authorise another browser.
- Rotate the secret and restart or redeploy to revoke all existing owner cookies.
- Keep the owner and encryption secrets in a password manager.
- Losing the owner secret means generating a replacement.
- Losing the encryption secret can make stored integration credentials unreadable.

## Optional GitHub version control

Create a GitHub OAuth App with this callback URL:

```text
https://your-creed.example/auth/github/callback
```

Add `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` to the environment. Leave both blank to run without GitHub. GitHub is a repository connection, not an account or login provider.

## Optional AI features

The editor and agent connections work without an AI key. Analysis, Panel, Tab, and onboarding composition use the owner's OpenRouter key. Add it under **Settings → Model usage** after onboarding. Creed Open never falls back to managed Cloud credits.

## Updates

Pull the new version, install dependencies, preview migrations, and apply them before restarting:

```bash
git pull
npm install
cd apps/open
npx supabase db push --dry-run
npx supabase db push
cd ../..
npm run doctor
```

Read `CHANGELOG.md` before updating. Never skip a documented breaking or recovery step.

## Backups and recovery

Back up the Supabase database and storage bucket before a significant update. A Markdown export is portable, but a complete restoration also requires revisions, proposals, settings, tokens, and avatars.

Use `CREED_ENCRYPTION_SECRET_PREVIOUS` only during a planned key rotation. Remove it after stored credentials have been refreshed through normal use.

## Troubleshooting

### The browser says Database needs setup

Run:

```bash
npm run setup
```

The installer will relink the project, preview unapplied migrations, and ask before applying them.

### Supabase linking rejects the password

Use the database password created with the Supabase project, not the account password or API secret key. Reset it from the Supabase database settings if it has been lost.

### The doctor cannot verify Supabase

Confirm the project is active, the URL belongs to that project, and `SUPABASE_SECRET_KEY` is its current server secret. Then run:

```bash
npm run doctor
```

### Setup must run without an interactive terminal

Use the manual setup instructions, provide environment values through the hosting platform, apply migrations from a trusted local or CI environment, and run `npm run doctor` before opening the installation.
