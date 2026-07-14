---
name: shared-devops
description: "DevOps, CI/CD, testing, security hardening, monitoring, performance, deployment — production readiness."
---

# Shared DevOps

## Deployment Stack

| Service | Purpose |
|---------|---------|
| Vercel | Next.js app hosting (`opus_website`, `opus_admin`, `opus_pass`, `vendors_portal`) |
| Supabase | Postgres database, storage, auth, edge functions |
| GitHub Actions | CI/CD pipelines |
| Clerk | Authentication |

Vercel projects live under the **`opus-festa`** team, which owns the `opusfesta.com` domain. The Expo apps (`of_mobile`, `opus_pass_mobile`) do not deploy to Vercel.

`apps/studio` is a real Next.js app in the repo but is **not currently deployable**: it has no project in the `opus-festa` team, and `studio.opusfesta.com` has no DNS record. Its only Vercel project sits in a separate, stale `opusfesta` team that does not own the domain. Deploying it means first creating a project under `opus-festa`.

## Environments

| Environment | Branch | Supabase Project | Vercel |
|-------------|--------|-------------------|--------|
| Development | feature branches | dev project | Preview deploys |
| Staging | `staging` | staging project | Preview URL |
| Production | `main` | prod project | Production URL |

## GitHub Actions CI Pipeline

```yaml
# Key stages in order:
# 1. Lint & typecheck
# 2. Unit tests
# 3. Build all apps
# 4. Security scan (npm audit, license check)
# 5. Deploy (Vercel auto-deploy on push)
```

## Manual Vercel Deploys

Any web app can be deployed on demand, without waiting on a Git push. Full guide: `docs/MANUAL_VERCEL_DEPLOY.md`.

```bash
npm run deploy:website           # preview deploy
npm run deploy:admin
npm run deploy:pass
npm run deploy:vendors

npm run deploy:website -- --prod # promote to the live domain
npm run deploy -- all --prod     # all four apps
```

Backed by `scripts/deploy.sh`. Three constraints are baked into that script and are easy to trip over if you deploy by hand instead:

- **Run from the repo root.** Each Vercel project sets Root Directory to `apps/<name>` and applies it itself, so running `vercel` from inside an app folder makes it look for `apps/opus_admin/apps/opus_admin` and fail.
- **Projects are targeted by ID.** One `.vercel/project.json` cannot serve four apps, so the script sets `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` per invocation rather than using link files.
- **Uploads must be archived.** The monorepo exceeds Vercel's 15k-file-per-deploy cap; without `--archive=tgz` the deploy is rejected with `missing_archive`.

Manual deploys do **not** disable Git auto-deploys — the two coexist, and whichever finishes last wins the production domain. A manual deploy also uploads the working tree, so it can ship uncommitted code; check `git status` before using `--prod`.

### Monorepo Build

- Each app builds independently: `turbo run build --filter=@opusfesta/opus-admin`
- Shared packages are built first as dependencies
- Cache turbo build artifacts between CI runs

## Supabase Migrations in CI

```bash
# Apply migrations to staging/prod via CLI
supabase db push --db-url $SUPABASE_DB_URL

# Always test migrations on staging before production
# Never run destructive migrations (DROP TABLE, DROP COLUMN) without backup
```

## Security Hardening

- **CSP headers** configured in `next.config.js`
- **Rate limiting** on API routes (especially auth and payment endpoints)
- **Input sanitization** — never trust client input, validate server-side
- **Secrets** — environment variables only, never committed to repo
- **Dependencies** — `npm audit` in CI, keep dependencies updated
- **OWASP Top 10** awareness: XSS prevention (React handles), CSRF (SameSite cookies), injection (parameterized queries via Supabase)

## Monitoring & Alerting

- Vercel Analytics for Core Web Vitals
- Supabase Dashboard for database performance
- Error tracking: capture and log API errors with context
- Uptime monitoring on critical paths (`/`, `/portal`, `/api/health`)

## Zero-Downtime Deployment

- Vercel handles rolling deployments automatically
- Database migrations must be backward-compatible (add columns nullable, never rename in-place)
- Feature flags for gradual rollout of new features

## Testing Strategy

| Type | Tool | Scope |
|------|------|-------|
| Unit | Vitest | Utility functions, hooks |
| Integration | Vitest + MSW | API routes, data flows |
| E2E | Playwright | Critical user journeys (booking, payment) |
| Visual | Playwright screenshots | Brutalist design regression |
