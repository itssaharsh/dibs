# Deploy: choose, prepare, ship, verify, roll back

Never deploy blindly, and never treat a successful deploy as verification.

## Contents
1. Is deployment required?
2. Platform choice (2026 notes)
3. Environment variables
4. Data and migrations
5. Pre-deploy checklist
6. Credit-safe demo mode (hackathon)
7. Deploy, then verify what's live
8. Rollback awareness
9. Boring CI
10. Deploy-specific failures

---

## 1. Is deployment required?

Deploy when judges open a URL, when real users will use it, when the sponsor requires a hosted URL on their platform (read the rules verbatim), or when the user asks. For a judged entry, deploy even when it is optional: at one event the shortlist had a live link 78% of the time against 51% for the rest, and one organiser says plainly "We as judges are not going to build it locally" (how many judges run a build at other events is not known, so assume none will). When the sponsor is a host, deploy on the sponsor; an entry hosted on a rival drew "This makes me angry because the idea was amazing." The deployment stays up until judging closes, which can be three days after the deadline: keep free tiers awake and credits funded through that date, and put the date in `state.md`. Otherwise, a verified local production build plus a runbook is honest; say "not deployed" in the report.

## 2. Platform choice (verify limits for your account; these change)

| Need | Good default | Notes (as of Sep 2026) |
|---|---|---|
| Next.js / React / static front end + light API routes | **Vercel** | Zero-config Next.js; preview URL per branch; `vercel env pull` (writes `.env.local`) or `vercel env run -- <cmd>`; Hobby is non-commercial only; function body limit 4.5 MB; duration limits by plan; instant rollback |
| Static / SPA + functions | **Netlify**, **Cloudflare Pages/Workers** | Netlify sync functions ~60 s, 6 MB payload; Workers free plan has a tight CPU budget per request (10 ms), fine for I/O-bound handlers |
| A separate long-running API or worker | **Render**, **Railway**, **Fly.io** | Render free web services sleep after 15 min idle, ~1 min cold start, free Postgres expires after 30 days; Railway one-time trial credit, then a small monthly credit; Fly scale-to-zero unless `min_machines_running=1` |
| Postgres | **Supabase**, **Neon** | Supabase free projects pause after 7 idle days; Neon free autosuspends after ~5 min idle (first query wakes it; slower); put the DB in the functions' region |
| Realtime-first app | **Convex** | Reactive queries, crons, file storage built in; deploy URL on `convex.site`/`convex.cloud` |
| ML demo UI | **HF Spaces** (static), or front end on Vercel + model API | New Gradio/Docker Spaces need a paid (PRO) plan; static Spaces are free; free accounts can host 2 Gradio Spaces on ZeroGPU |
| AWS-mandated events | **Amplify Hosting** (+ Lambda, Step Functions) | SSR env vars must be written into `.env.production` during the build to exist at runtime |
| Containers you control | Docker Compose locally; Fly/Render/Railway to host | `docker compose watch` (Compose ≥ 2.22) for hot reload |

Hackathon: keep the API as same-app routes on the front-end host when possible, since one deployable means one thing to fail. Product: paid plans for anything commercial, and databases with backups.

## 3. Environment variables

- **Build-time vs runtime.** `NEXT_PUBLIC_*`, `VITE_*` and `EXPO_PUBLIC_*` are inlined into the bundle at build time. They must be set before the build, and changing one requires a redeploy. They must never hold secrets. Dynamic access such as `process.env[name]` is not inlined.
- **Scope per environment.** On Vercel and similar hosts, preview and production have separate variables. A variable set only in production breaks previews, and the reverse.
- **Validate at boot.** Parse env with a schema (zod `createEnv`, pydantic-settings) so a missing variable fails at startup with its name, not deep inside a request.
- **`.env.example`** lists every variable with a placeholder and a one-line comment. It is committed; `.env*` real files are gitignored from the first commit.
- **Record** the variable table (name, scope, build/runtime, where it's set) in ARCHITECTURE.md §Deployment.

## 4. Data and migrations

- Use migrations from the first table: `prisma migrate deploy`, `drizzle-kit migrate`, `supabase db push` against migrations, `alembic upgrade head`. `db push`-style schema sync is only for throwaway databases.
- Never use `--accept-data-loss`, `push --force` or destructive auto-migrations against a shared or production database.
- **Expand / contract** for anything live:
  1. add new columns or tables and dual-write;
  2. backfill;
  3. switch reads;
  4. remove the old ones in a later release.

  Rolling back code doesn't roll back data.
- Review generated migrations; autogenerate tools are not perfect.
- Run migrations in CI or the release step before promoting traffic, and record each migration's ID and environment in `state.md` ("Changes that need care").
- Keep seed data separate from migrations. The demo seed script is idempotent (`scripts/seed.*`).
- Backups before destructive operations (product): take a snapshot and confirm you can restore it.

## 5. Pre-deploy checklist

1. A clean production build from the lockfile, on Linux (CI) if you develop on macOS or Windows. This catches case-sensitive imports and undeclared dependencies.
2. Tests green on the commit being deployed, recorded in the ledger.
3. Security gate passed (`security.md`).
4. Env table complete for the target environment; public-prefixed vars set before the build; boot validation present.
5. Migrations reviewed, expand-only for this release, and run in the release step.
6. Health endpoints:
   - `/healthz` is cheap (process alive);
   - `/readyz` checks the DB and the migration version.

   Point the platform health check at readiness (Render needs a 2xx/3xx within 5 s).
7. Platform limits checked against the heaviest flow (body size, function duration, edge runtime restrictions).
8. Rollback path known, and the last good deployment ID recorded (§8).
9. Product with a custom domain:
   - DNS pointed at the platform (a change that needs Saharsh's go-ahead);
   - a platform-managed TLS certificate issued;
   - HTTP redirects to HTTPS, with one canonical host (apex or www);
   - HSTS set once HTTPS works everywhere.

   Verify with `curl -sSI https://<domain>` (status, `strict-transport-security`, the redirect chain) and check the certificate's expiry.
10. Hackathon: `?demo=1` works with no external credentials; seeded data loads; the warm-up plan is ready.

## 6. Credit-safe demo mode (hackathon)

1. **`?demo=1` / `DEMO_MODE=true`** short-circuits paid or flaky calls to curated fixtures. The fixtures have exactly the real response shape so the same rendering path runs. It doubles as the CI fast path and as insurance against rate limits mid-demo.
2. **Cache upstream responses.** Even a naive 10-minute in-memory cache helps.
3. **Set hard budget and quota alerts** on paid APIs before the event.
4. **Assert on content, not status.** HTTP 200 doesn't guarantee usable data; in fallback mode, check the fields you render.
5. **Warm up.** Hit the deployed URL a few minutes before judging, and keep free-tier databases and APIs awake during the judging window.

## 7. Deploy, then verify what's live

Hackathon: deploy by about 40% of the time and redeploy on every milestone, so deploy problems surface early. Product: deploy to preview first and promote to production after the preview is verified.

After each deploy:
1. `pb.py smoke <url> --routes / <journey routes> --where preview|prod`: statuses, broken assets, error markers, slow cold starts.
2. The browser pass from `verification.md` §4 on the deployed URL: console, network, viewports, main flow, auth, forms, states, 404, logged-out incognito. Use `assets/smoke.spec.ts` for the repeatable part.
3. Hackathon: the demo flow three times in a row, with a reset between runs; then the judged-path checks in `verification.md` §4 (first screen measured, promise, capabilities, `pb.py submit check --online`).
4. Product: readiness green, migrations recorded, logs and alerts receiving events, error tracking capturing a test error.
5. If the shell can't reach the URL (sandboxed networks), verify in the session's browser and record it with `pb.py evidence add --method observed --where prod --url <url>`.

**If you can't deploy from this session** (no platform credentials):
1. Run the production build locally as the closest check: the container, `next start` / `node dist` / `uvicorn` in production mode. Smoke it with `pb.py smoke http://localhost:<port> --where local`.
2. Write the deploy steps as a relay prompt, or as exact commands for Saharsh.
3. Mark the delivery report "not deployed".
4. Verify the URL he returns with the full post-deploy pass.

Pushing to a remote, deploying and changing DNS all need his go-ahead.

## 8. Rollback awareness (keep it in `state.md`)

For every significant change, know:
- what changed, and which files;
- what could break;
- how to revert (commit or PR);
- which migrations have been applied, and where;
- whether the deployment can roll back, and to which deployment ID.

Be especially conservative with destructive changes: data deletes, schema drops, history rewrites, DNS or domain moves. Ask first, back up first, and have a way back.

- Vercel: instant rollback to a previous deployment, then `vercel promote` to resume normal promotion.
- Cloudflare Workers: `wrangler rollback`.
- Render and Railway: redeploy a previous deploy.
- Code rollback doesn't revert the database or KV; that's why expand/contract matters.

## 9. Boring CI (quality signals in under 30 minutes)

One workflow: install → lint → typecheck → unit tests (mock mode) → build, plus secret scanning. A green check on every PR is the whole package for a hackathon; products add the audit, SAST and E2E on the preview.

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4          # product: pin third-party actions by SHA
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint --if-present
      - run: npm run typecheck --if-present
      - run: npm test --if-present
        env: { DEMO_MODE: "true" }
      - run: npm run build
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
```

Add `pre-commit` with formatting, lint and a secret scan so problems are caught before they reach CI. For Python, swap in `uv sync --locked` / `pip install -r requirements.txt`, `ruff check`, `pytest`.

## 10. Deploy-specific failures (check these before blaming the code)

| Failure | How it shows | Fix |
|---|---|---|
| Build-time env inlined wrong or missing (`NEXT_PUBLIC_*` set after the build) | `undefined` URLs, requests to `localhost`, console errors on the live site only | Set before the build, redeploy; runtime values via an API or server component |
| Preview ≠ production vars | Works in one environment only | Add to both scopes; boot-time env validation |
| Amplify SSR env missing | `undefined` at runtime on the server | Write `.env.production` in the build step |
| CORS | Browser console only (curl works) | Origin allowlist + `Vary: Origin`; test from the real origin |
| Cold start / sleeping free tier | First hit 502 or times out; judges see a spinner | Warm-up before the demo, keep-alive during judging, min instances (product) |
| Case-sensitive paths | "Module not found" on Linux builds only | Fix the import casing; `git mv` in two steps; CI on Linux |
| Missing migrations | 500s on new columns; readiness red | Migrate in the release step before promote; ORM CLI in dependencies (hosts prune devDependencies) |
| Edge runtime limits | No `fs`, `eval` or native modules; 500s on edge routes | Use the Node runtime (default in Next 16's `proxy.ts`) |
| Function timeout / body limit | 504 `FUNCTION_INVOCATION_TIMEOUT`; 413 on uploads | Stream, move to a background job, upload directly to storage |
| Proxy/middleware matcher too broad | CSS/JS 4xx, redirect loops | Negative matcher for static assets |
| npm 12 skipped install scripts | Native module errors at build/run time | `npm approve-scripts` for the packages that need them |
| Auth callback URLs | Login works locally, fails in prod | Register the production and preview callback URLs with the provider |
| Mixed content / wrong base URL | Blocked requests over http | Use relative URLs or the env-configured https origin |
