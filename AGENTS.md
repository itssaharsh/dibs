# dibs

<!-- prod-build:memory-protocol -->
## Build memory protocol
- Before planning or changing a component: read `docs/memory/INDEX.md`; run
  `python3 .prod-build/pb.py mem find --paths <files> --terms <keywords>` and apply what fits.
- On any error: search failures by the error text first (`mem find --terms "<signature>"`); do not retry
  an approach a failure record says failed unless you have a new root cause.
- A record is a hint until its cited files still match (`mem check` flags stale ones).
- Run checks through `python3 .prod-build/pb.py run --task <ID> -- <command>` so results land in the
  evidence ledger; "done" means passing evidence exists, not that code was written.
- Task briefs: `.prod-build/briefs/<ID>.md`. Reports: `.prod-build/reports/<ID>.md`.
<!-- /prod-build:memory-protocol -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
