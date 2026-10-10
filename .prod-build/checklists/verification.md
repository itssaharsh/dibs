# Verification: evidence, tests, browser checks, bug hunt, final audit

## Contents
1. What counts as evidence
2. Evidence matrix per surface (completion requirements)
3. Testing strategy
4. Browser and product verification
5. Bug hunt ("how can I break this?")
6. The four "would I ship this?" reviews
7. Delivery report template

---

## 1. What counts as evidence

| Method | How it's recorded | Counts for "done"? |
|---|---|---|
| **ran**: a command executed with its exit code captured | `pb.py verify T` (all of the task's verify commands), `pb.py run --task T -- <cmd>`, `pb.py smoke <url>` | Yes, if it was expected to pass. RED runs (`--expect-fail`) prove a test can fail; they never close a task |
| **observed**: you saw it in a real browser or on the real system | `pb.py evidence add --method observed --summary … --where prod --url … --file shot.png` | Yes, when specific ("J1 completed 3×, no console errors, screenshot qa/j1-390.png") |
| **reported**: an agent or person says it happened, with pasted output | `pb.py evidence add --method reported …` | No, until re-run or corroborated |

- Every ledger entry records the git SHA, a dirty flag, where it ran (local, ci, preview, prod), and a fingerprint of the working tree.
- `task done` refuses evidence gathered on different code. Committing after a passing run is fine, since the content is unchanged; editing a file is not.
- A check against local code is not evidence about production.
- The ledger is hash-chained, so hand-edited or invented entries fail `pb.py evidence list`, intake and the report check.
- A failing check is evidence too. Record it; don't rerun until green and forget the red. `task done` looks at the **latest** run of each verify command.
- Output tails are stored. Never print secrets (pass `--tail 0` for commands that echo credentials). If one leaks: rotate it, then run `pb.py evidence redact --id E00xx --pattern '<secret>' --reason '<why>'`.

## 2. Evidence matrix: what "complete" requires per surface

Nothing is complete because code was written, tests were written or a build succeeded.

| Surface | Hackathon | Product (hybrid: product column for anything real users touch) |
|---|---|---|
| **Frontend** | Build + typecheck + lint; tests on UI logic that decides things; browser pass of the demo flow at 390 and 1440; no console errors; prod-ui A8 gates if UI is judged | Build + typecheck + lint + component/E2E tests on the core journeys; browser pass at 390/1024/1440 over default, loading, error and empty states; axe with no critical violations; Web Vitals budget |
| **Backend** | Build + unit tests on decision functions + API calls for the demo flow, including one error path | Build + unit + integration tests; API verification of every endpoint in the journeys; error paths (4xx validation, 401/403, 404, 409 conflict, 5xx from a dependency); idempotency where retried |
| **Database** | Seed script runs clean from zero; schema matches the models | Migrations apply from zero and from the last release; schema checks; integration tests against a real DB (container or branch); rollback/down path or expand-contract plan; backups configured |
| **AI** | Golden cases for the demo inputs (tool choice, args, schema-valid output); the unhappy-path case; kill-switch fallback works; step and token caps set | The full eval matrix in `ai-products.md` on fixtures in CI; prompt-injection canaries; permission-boundary tests; traces showing model and tool spans with token usage; budgets enforced |
| **Deployment** | Production build + deploy success + `pb.py smoke` on the URL + the demo flow ×3 on the deployed URL, logged out, after a cold start | Hackathon deployment evidence + preview → prod promotion + migrations applied (recorded) + health/readiness green + browser smoke across viewports + rollback path known (last good deploy ID in state.md) + alerts receiving |

Evidence must exist for the mode's column before the milestone or the build is called done. When something can't be checked from here (no browser, no credentials), say "not run", say why, and give Saharsh the exact command. That goes in the delivery report, never a silent pass.

## 3. Testing strategy

Use the smallest test set that would catch this product's likely failures. Coverage percentages are not a goal; regression prevention on what matters is.

- **Start from the acceptance criteria.** Each AC maps to at least one test or scripted check; name tests after the AC or the bug ("rejects swap leaving <11h rest (AC-2)").
- **RED gate** (for business rules and bug fixes):
  - the test target compiles and the new test actually executes;
  - it fails because of the intended missing behaviour or the bug, not a syntax error, broken setup or missing dependency;
  - `pb.py run --expect-fail` records it; then implement; then GREEN.

  A test that was written but never seen failing proves nothing.
- **Failure paths** for every critical flow: invalid input, empty data, dependency down or slow (timeout), retry after failure (no duplicates), permission denied, concurrent edits, partial success.
- **Types of test, by need:**
  - unit tests for rules and decision functions;
  - integration tests at the DB and external boundaries (real DB in a container, or recorded fixtures);
  - API or contract tests where two lanes share a boundary;
  - component tests for complex UI state machines;
  - E2E for the core journeys only;
  - AI evals (see `ai-products.md`);
  - visual checks through screenshots;
  - smoke tests against deployed URLs.
- **Deterministic by default.** Seeded data, frozen clocks where time matters, recorded fixtures for third-party APIs, mock mode for paid APIs in CI. Keep one live smoke run outside the fast path.
- **Flaky tests:** reproduce with `--repeat-each=10` (Playwright), `-count=10` (Go) or `pytest --count` (plugin). Fix the wait or the race; never add sleeps, and never mark them skipped to go green.
- **Held-out checks:** the orchestrator runs checks the builder didn't write (smoke, E2E on the deployed URL, the demo script). Agents can pass their own visible tests while hidden checks fail.
- **Never weaken tests.** `pb.py diffcheck` flags skipped or focused tests, deleted test files, removed assertions, and changed lint/type/test configs.

## 4. Browser and product verification

Use whatever real browser the session has: Playwright in the workspace (Chromium is often preinstalled; never run `playwright install` there), Claude in Chrome, or the built-in browser. Verify the local build before deploying, and the deployed product after.

**Checklist, per environment:**
- The landing page loads and the first screen shows the core loop with data (no login wall for judged demos).
- Navigation: every visible link and button goes somewhere real; the back button behaves.
- Authentication: sign-in and sign-out, the protected route while logged out (permission-denied state), an expired session.
- The main workflow, end to end, with a visible outcome.
- API calls: the network panel shows the expected requests with no 4xx/5xx; no requests to localhost from production.
- Forms: validation messages, disabled submit with a reason, double-submit protection, input kept on error.
- Loading, error and empty states reachable (`?state=` harness if prod-ui built one).
- Responsive at 390, 1024 and 1440: no horizontal scroll, and touch targets of at least 44px on mobile.
- Console: zero errors. Treat warnings as leads.
- Network: no failed requests, no 404 assets, no mixed content, fonts and images load.
- Obvious accessibility: keyboard path through the main flow, visible focus, labels, contrast; axe with no critical violations.
- A 404 route shows a designed page with a way back.

Some budgets depend on the GPU, such as frames per second for 3D scenes, and cloud workspaces render WebGL in software. Mark those checks "not run here" and give Saharsh the DevTools steps for a real device (Performance panel, 4× CPU throttle). Measure the CPU-side budgets here: LCP, JS size, long tasks.

**Tools:**
- `pb.py smoke <url> --routes / /app` for HTTP status, broken assets and error markers (no browser needed).
- `assets/smoke.spec.ts` for console errors, failed requests, viewports and axe. Copy it to `tests/smoke/`, then run `BASE_URL=<url> ROUTES=/,/app npx playwright test tests/smoke`.
- Record what you saw with `pb.py evidence add --method observed` (+ `--file` screenshots).

**Hackathon demo flow.** Run the exact demo script from start to finish three times in a row on the deployed URL, logged out, in a fresh incognito window, after a cold start. Reset the demo between runs with the reset shortcut or the seed script. The signature interaction must work all three times. Record a backup take of a clean run the first time the path works end to end, not only before a live pitch.

**The judged path, measured** (hackathon and hybrid; record each with `pb.py run --task <ID> -- <command>` or `pb.py evidence add`, so it lands in the ledger; `pb.py window` and `pb.py submit check` record themselves once a plan exists):
- **The first screen.** `python3 <prod-ui skill folder>/scripts/foldcheck.py <url> --action "text=<label of the primary action>" --result "<CSS selector of the element showing the product's work>" --promise <words from the backing data that the name promises> --out qa/fold`. prod-ui is a separate plugin, so it is not inside this skill's folder. Find it: `find / -name foldcheck.py -path '*prod-ui*' 2>/dev/null | head -1` (in a checkout of the plugins it is `../../../prod-ui/skills/prod-ui/scripts/` from this skill's folder). Only when that search finds nothing is prod-ui not installed. It fails when the named action or the result is missing, hidden or below the first screen at 1440×900 or 390×844 with no input, on a sign-in wall, a blank page, an HTTP error or a sideways scroll, and warns on a setup form above the action, a dialog over it, or an action that is not a real button. Exit 2 means it could not run or could not measure a size: that is never a pass, so check that size by eye and record it as done by hand. Read its screenshots as well; it measures position, not sense. If prod-ui is not installed, open the URL at both sizes with no input and check the same things by eye, and record that it was done by hand.
- **The promise.** Open the default view with no input and check it against contract §12's promise coverage: the promised place, group or category leads. Count it (how many of the first ten rows, how many of the seeded items).
- **The capabilities.** For each line of §12's capability coverage, the moment in the run where it happens: first in the planned run, then in the backup take once one exists. One that does not happen is a task or a prize dropped, never a claim kept.
- **One unseen input.** Run the flow once on input nobody prepared, and once with the main dependency off, and record what the product did.
- **History and page.** `pb.py window`, then `pb.py submit check --description <form text> --video <file>`, then again with `--live <url> --video-url <url> --online` once both exist. A FAIL from either blocks submission. SKIP lines are yours to check by hand, and the report says which were.
- **A stranger.** A fresh agent or a person gets only the first 180 characters of the description and says what the product is and does. If they cannot, rewrite it.

## 5. Bug hunt: "how can I break this?"

Switch modes once the product looks complete. For each core journey, try these and fix what breaks through a failing test first:

- **Edge input:** empty, whitespace, 10,000 characters, unicode and emoji, RTL, HTML/script, SQL-like strings, negative or huge numbers, past and future dates, time zones.
- **Duplicate requests:** double-click submit, resubmit after a network error, two tabs, the browser back button after submit.
- **Retries:** kill the dependency mid-request, then retry. No duplicate rows, charges or emails (idempotency keys).
- **Race conditions and stale state:** two users edit the same record; the UI shows stale data after mutation; optimistic updates never roll back.
- **Error handling:** force each dependency to fail (DB down, model timeout, 429, malformed JSON). Is the error visible, actionable and non-destructive? Does it get logged?
- **Missing validation:** call the API directly, bypassing UI validation.
- **Authorization:** change IDs in URLs and payloads to another user's or tenant's resources; call admin endpoints as a normal user; check server actions and API routes, not just pages.
- **Mobile:** 390px width, a soft keyboard covering inputs, touch targets, slow 3G throttling.
- **Navigation:** deep links, refresh on every route, 404s, redirects after login.
- **Dead UI:** buttons that do nothing, links to "#", unused routes and components, "coming soon" in the demo path.
- **Failed API states:** every data region with a 500, an empty result and a slow result.
- **Deployment-specific:** production env vars missing or build-time-inlined wrong, CORS from the real origin, cold start timeouts, case-sensitive imports, edge runtime limits.
- **Leaks and waste:** intervals and listeners not cleaned up, growing memory on long sessions, requests fired on every render, unbounded queries, missing pagination.
- **Environment variables:** a missing variable should fail fast at boot with a clear message, not deep inside a request.

Fix what is safe to fix now. Anything deferred goes to "Known limitations" with its user impact.

## 6. "Would I ship this?" (four separate reviews at the very end)

Run each as its own pass, ideally with a fresh subagent per lens, and fix the obvious findings when practical.

1. **User review.** Would a real user understand this without you? Walk J1 as a first-timer and note every moment of hesitation: unclear copy, missing feedback, a surprising state, jargon.
2. **Engineering review.** Would another engineer be comfortable maintaining it? Check the README quickstart works from a clean clone, ARCHITECTURE.md matches the code, no clever code without a reason, tests explain behaviour, and there are no secrets or hard-coded environment specifics.
3. **Reliability review.** What happens when things fail? Take each failure boundary in ARCHITECTURE.md and confirm its behaviour was actually exercised (link the evidence IDs), and name the ones that weren't.
4. **Founder review.** If this launched tomorrow, what would embarrass us? Broken first impressions, placeholder text, fake numbers presented as real, a privacy gap, a slow first load, a dead button on the main screen, a claim in the README that isn't true.

## 7. Delivery report (`.prod-build/DELIVERY.md`)

`pb.py report .prod-build/DELIVERY.md` must pass:
- every bullet under Verification, Deployment and Bugs cites an evidence ID, or says "not run", "not deployed" or "n/a";
- every cited ID exists and passed (or the bullet says it failed);
- a RED run is cited only as RED;
- a deployment claim cites preview or prod evidence;
- the ledger chain is intact.

```markdown
# Delivery report — <product> (<mode>, <date>)

## Built
- What was actually implemented, by journey (J1…); what was cut (and to which horizon).

## Architecture
- The chosen shape in 2–4 lines and why (ADR ids). What was deliberately not built.

## Verification
- Unit + integration suite: 84 passed [E0031]
- Demo flow ×3 on the deployed URL, no console errors [E0040, E0041, E0042]
- Lighthouse: not run (no browser in this session); command: `npx @lhci/cli autorun --collect.url=<url>`

## Deployment
- Production: https://… deployed from a1b2c3d [E0045]; smoke passed [E0046]; rollback: previous deploy dpl_… (state.md)

## Bugs found and fixed
- Double submit created two swap requests; fixed with an idempotency key (test added) [E0036, E0037]

## Known limitations
- What remains incomplete and its user impact; untested areas, stated honestly.

## Cleanup
- Removed: … (tool + grep evidence, commit c0ffee1); dependencies removed: …

## Optimization
- Initial JS 412 KB → 268 KB by lazy-loading the 3D scene [E0050, E0052]  (or "none needed: measured X")

## Memory
- ADR-0001, ADR-0002, F-0001 (build-time env), L-0001 (global candidate: warm Render before demos) | none

## Next steps
- Only genuinely useful next actions, highest value first.
```

End every build with an **Evidence missing** line inside Known limitations: the checks the mode requires that did not run. An honest gap beats a silent pass.
