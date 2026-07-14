# Manual Vercel Deploys

How to deploy any of the four OpusFesta web apps to Vercel on demand from your machine, without waiting on a Git push.

## Overview

Four apps in this monorepo deploy to Vercel, all under the **`opus-festa`** team (the team that owns the `opusfesta.com` domain):

| App directory | Vercel project | Production domain |
| --- | --- | --- |
| `apps/opus_website` | `opus-festa-website` | `www.opusfesta.com` |
| `apps/opus_admin` | `opus-admin` | `admin.opusfesta.com` |
| `apps/opus_pass` | `opus-pass` | `opus-pass.vercel.app` |
| `apps/vendors_portal` | `vendors-portal` | `vendorsportal.opusfesta.com` |

The two Expo apps (`apps/of_mobile`, `apps/opus_pass_mobile`) are not Vercel targets.

Vercel builds remotely — the script uploads your working tree and Vercel runs the build, so a deploy reflects your local files, including uncommitted changes.

## Prerequisites

- Vercel CLI installed (`brew install vercel-cli`)
- Logged in and a member of the `opus-festa` team (`vercel login`, verify with `vercel whoami`)
- `apps/vendors_portal` present locally. This repo uses sparse-checkout, so if the folder is missing:
  ```bash
  git sparse-checkout add apps/vendors_portal
  ```

## Deploying

Preview deploys (own throwaway URL, does not touch production):

```bash
npm run deploy:website
npm run deploy:admin
npm run deploy:pass
npm run deploy:vendors
```

Production deploys (promotes to the live domain — see the warning below):

```bash
npm run deploy:website -- --prod
npm run deploy -- all --prod     # all four apps
```

The underlying script takes the same arguments directly:

```bash
scripts/deploy.sh <website|admin|pass|vendors|all> [--prod]
```

Each run prints a URL. Check a deployment's status any time with:

```bash
vercel inspect <deployment-url> --scope opus-festa
```

## Environment variables

Builds use the environment variables configured on each **Vercel project**, not your local `.env`. A manual deploy and a Git deploy therefore build against exactly the same config. To change a build's env vars, change them in Vercel project settings.

## How it works

Two constraints in this repo shaped `scripts/deploy.sh`, and both are easy to trip over:

**Deploys must run from the repo root.** Every Vercel project has its Root Directory set to `apps/<name>`. Vercel applies that itself, so the CLI has to upload the whole workspace from the repo root. Running `vercel` from inside an app folder makes Vercel look for `apps/opus_admin/apps/opus_admin` and fail.

**Projects are targeted by ID, not by link file.** A single `.vercel/project.json` can only point at one project, and four apps share this repo. The script sets `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` per invocation instead, so no linking or re-linking is needed. Project IDs are hardcoded in the script — if a project is ever recreated in Vercel, its ID changes and the script needs updating.

**Uploads go up as a tarball.** The monorepo is ~19,800 files, over Vercel's 15,000-file-per-deploy cap, so the script passes `--archive=tgz`. Without it the deploy is rejected with `missing_archive`.

## Things to know

**A production deploy goes live immediately.** `--prod` promotes to the real domain — there is no confirmation step. Deploy a preview first and check it.

**Manual deploys do not disable automatic ones.** These projects may still have a Git integration that deploys on push. Manual and automatic deploys coexist, and whichever finishes last wins on the production domain. To make deploys manual-only, turn off the Git integration in each project's settings in the Vercel dashboard.

**Deploys include uncommitted local changes.** Convenient for testing, but it means a production deploy can ship code that is not in `main`. Confirm your working tree is clean before shipping to production.
