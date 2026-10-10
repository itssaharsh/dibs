# Security gate (depth per mode)

Run it at two points:
- **Before the first public deploy,** including a hackathon's early deploy or a product's preview: at least the Secrets and Client exposure rows.
- **Before the release deploy:** the whole table for the mode.

Security is part of implementation, not a phase you might skip. A prototype is not exempt from obvious failures: leaked keys, open admin routes and SQL injection end hackathon demos and startups alike. Record each check as evidence (`pb.py run --kind security -- …`).

## Checklist

| Area | Check | Hackathon | Product |
|---|---|---|---|
| **Secrets** | No secrets in git (current tree *and* history); `.env*` gitignored from commit 1; `.env.example` has placeholders only; scanner passes | ✅ | ✅ + push protection on |
| **Client exposure** | No private keys in client code or public env prefixes (`NEXT_PUBLIC_`, `VITE_`, `EXPO_PUBLIC_`); grep the built bundle for key patterns | ✅ | ✅ |
| **Env vars** | Every var listed per environment (local/preview/prod); validated at boot (zod/pydantic settings) with a clear error | ✅ basic | ✅ |
| **Authentication** | Real provider (Clerk/Auth.js/Better Auth/Supabase Auth/…), no hand-rolled crypto; session expiry; logout works; MFA for staff/admin accounts that see personal or health data | Guest/demo OK if single-user | ✅ |
| **Authorization** | Enforced server-side in *every* route, server action, RPC and DB policy; object-level checks (can this user access *this* ID?); not just hidden UI | ✅ if multi-user data | ✅ + tests for cross-tenant access |
| **Input validation** | Schema validation at every boundary (body, query, params, webhooks); size limits | Write paths | ✅ all |
| **Injection** | Parameterized queries/ORM only; no string-built SQL, shell, or HTML; output encoding; `dangerouslySetInnerHTML`/`v-html` only on sanitized input | ✅ | ✅ + SAST |
| **File uploads** | Type and size allowlist, stored outside the web root or in object storage with private ACL, random names, no server-side execution, virus scan if user-shared | If present | ✅ |
| **API exposure** | Only intended endpoints public; no debug/admin routes in prod; no stack traces in responses; GraphQL introspection off in prod | ✅ | ✅ |
| **CORS** | Explicit origin allowlist with `Vary: Origin`; never `*` with credentials; test from the real origin in a browser | ✅ | ✅ |
| **CSRF** | Cookie-auth mutations use SameSite=Lax/Strict + CSRF token or same-origin checks (framework defaults verified) | If cookie auth | ✅ |
| **Rate limiting / abuse** | Costly or abusable endpoints limited by rate and size: AI calls, auth, email/SMS, uploads, and **public or link-guarded write endpoints** (forms, invites, patient/customer links). Use a shared store (Upstash/Redis/Vercel WAF) on serverless or with more than one instance; in-memory is fine on a single long-running instance | AI + auth + public writes | ✅ |
| **Dependencies** | Audit high/critical; lockfile committed; install with `npm ci`/locked installs; every *new* package verified to exist and be established | ✅ | ✅ + release-age gate |
| **Insecure defaults** | Debug mode off, default passwords changed, DB not publicly reachable, storage buckets private, admin panels behind auth | ✅ | ✅ |
| **Sensitive logging** | No tokens, passwords, full PII or prompt contents in logs; redaction in the logger | ✅ | ✅ |
| **Database access** | Least-privilege DB user for the app; RLS/tenant scoping where multi-user; no service-role key in the client | ✅ | ✅ |
| **Third-party credentials** | Scoped per environment, least privilege, rotatable; webhook signatures verified | ✅ | ✅ |
| **Headers** | HSTS, `X-Content-Type-Options: nosniff`, `frame-ancestors`/`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a CSP where feasible | Nice to have | ✅ |

OWASP Top 10:2025 for orientation: A01 Broken Access Control (now includes SSRF) · A02 Security Misconfiguration · A03 Software Supply Chain Failures · A04 Cryptographic Failures · A05 Injection · A06 Insecure Design · A07 Authentication Failures · A08 Software or Data Integrity Failures · A09 Security Logging & Alerting Failures · A10 Mishandling of Exceptional Conditions. AI features also get the checklist in `ai-products.md` §6.

## Commands (install what's missing, pin versions in CI)

```bash
# secrets — all stacks
gitleaks git -v --redact .            # history
gitleaks dir -v --redact .            # working tree
trufflehog git file://. --results=verified,unknown --fail

# JS / TS
npm ci                                                  # locked install, not `npm install`
npm audit --omit=dev --audit-level=high ; npm audit signatures
osv-scanner scan -r .
semgrep scan --config p/default --error                 # or CodeQL default setup on GitHub

# Python
pip-audit -r requirements.txt --strict                  # or: pip-audit . / uv/poetry lock equivalents
osv-scanner scan -r . ; semgrep scan --config p/default --error

# Go
govulncheck ./...                                       # reachability-aware
osv-scanner scan -r . ; semgrep scan --config p/default --error

# built bundle: no secrets shipped to the browser
if grep -rEl "(sk-[A-Za-z0-9_-]{20,}|sk_live_|AKIA[0-9A-Z]{16}|service_role|-----BEGIN)" .next/static dist build 2>/dev/null; then echo "secret-like strings in the bundle (files above)"; exit 1; fi
```

## Supply chain (2026 realities)

- **Hallucinated packages ("slopsquatting").** Models invent plausible package names, and attackers register them. Before adding any dependency, run `npm view <pkg> time.created repository.url` (or check PyPI/pkg.go.dev). It must exist, match the docs, have real history and point to the right repo.
- **Release-age gates.**
  - npm 11+: `min-release-age=3` in `.npmrc`. Older npm ignores the key silently; check with `npm config get min-release-age`.
  - pnpm: `minimumReleaseAge` (1 day by default since v11), with `trustPolicy: no-downgrade`.
  - Worms in 2025–2026 published malicious versions that were caught within days.
- **Provenance is not safety.** Malicious packages have shipped with valid provenance attestations. Keep the lockfile, `npm ci` and the audit.
- **npm 12 install scripts.** npm 12 no longer runs dependency install scripts by default. Approve the native builds you need with `npm approve-scripts`, and check that a stale `ignore-scripts=true` isn't silently overriding the allowlist.
- **GitHub Actions.** Product: pin third-party actions by commit SHA. Hackathon: version tags are acceptable.

## If a secret was committed

1. Rotate or revoke it at the provider first; history can be copied before you clean it.
2. Move it to env or the secret manager, and add the scanner to pre-commit and CI.
3. Rewriting history (`git filter-repo`) is irreversible and disruptive, so ask before doing it. On public repos, treat the secret as leaked regardless.
4. Record the incident with `pb.py mem add failure` (without the secret itself).

## Mode depth

- **Hackathon:** secrets + client exposure + authz if multi-user + validation on write paths + injection-safe queries + CORS + rate limits on AI and auth endpoints + a high/critical dependency audit.
- **Product:** the whole table + SAST + headers + cross-tenant tests + push protection + a supply-chain policy. Route anything touching auth, payments or PII through the security reviewer (`roles.md`).
