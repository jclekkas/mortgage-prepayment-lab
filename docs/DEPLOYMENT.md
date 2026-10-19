# Deployment runbook

The priority-0 (P0) app is a static site: `npm run build` writes `dist/`, which any static host can
serve. Routing is hash-based (`#/lab`), so refreshing a deep link never needs a server
fallback. There are no secrets, environment variables or servers.

## Before any deployment

1. The commit to deploy has green continuous integration (CI) checks: typecheck, lint, numerics, unit, build, end-to-end.
2. The destination is confirmed by the product owner. Nothing deploys automatically.
3. Record: commit hash (SHA), model version (`mpl-engine-1.0.0`), build date, web address (URL), smoke-test result, rollback command.

## Review preview: `gh-pages` branch (no merge required)

The public, synthetic-data review preview is published from a separate `gh-pages`
branch holding only built files, so pull request (PR) #1 does not need to be merged. (Option A's
Actions workflow can only be started from the default branch, which does not have it yet.)

1. Check out the exact commit to publish; it must have green CI, and the tree must be clean.
2. `scripts/build-preview.sh /tmp/preview` builds with `BASE_PATH=/mortgage-prepayment-lab/`
   and the commit stamped in `build.json` and the footer. It also adds `.nojekyll`,
   `SOURCE_COMMIT` and the smoke workflow (`deploy/preview-smoke.yml`).
3. Commit `/tmp/preview` as the `gh-pages` branch and push it. Never force-push over
   history someone else depends on; each publish is a new commit on `gh-pages`.
4. One-time: in repository Settings > Pages, set Source to **Deploy from a branch**,
   branch **gh-pages**, folder **/ (root)**, if GitHub has not enabled it automatically.
5. The `Preview smoke test (hosted URL)` workflow runs on the push. It waits until
   `https://jclekkas.github.io/mortgage-prepayment-lab/build.json` reports the commit,
   then runs `tests/preview` in Chromium and WebKit against the live URL. The deployment
   counts only when that run passes.

**Rollback:** push a new `gh-pages` commit built from the previous good source commit
(step 2), or check out the previous `gh-pages` commit's tree and commit it again.

## Option A: GitHub Pages via Actions (after merge)

1. Repository Settings > Pages > Source: **GitHub Actions**.
2. Actions > "Deploy synthetic demo to GitHub Pages" > Run workflow, entering the commit SHA or tag that passed CI.
3. The workflow builds with `BASE_PATH=/<repo-name>/`, writes `dist/build.json` (commit and build time), and deploys.
4. Smoke test (below) against `https://<owner>.github.io/<repo-name>/`.

**Rollback:** re-run the same workflow with the previous good SHA or tag. Tag each release (`git tag v1.0.0 <sha> && git push origin v1.0.0`) so the previous artifact is always one input away.

## Option B: Vercel or another static host

Framework preset Vite, build `npm run build`, output `dist`, no environment variables
(`BASE_PATH` defaults to `/`). Roll back by promoting the previous deployment in the
host's dashboard. Do not report a deployment as successful until the smoke test passes
on the live URL.

## Smoke test (live URL)

1. `#/start` loads; Start with the mixed book shows five headline cards with the Synthetic data badge.
2. Scenario lab: set rate shock -100, Run; the badge reads "Results match inputs" and the explanation mentions the lower-rate assumption.
3. Ledger reconciliation reads "within tolerance".
4. Refresh on `#/validation`; the validation lab reloads.
5. Decision room: save a JavaScript Object Notation (JSON) scenario file with Export JSON, then Import the same file; "Reproduced N of N saved results exactly".
6. Browser console shows no errors (the production Content Security Policy (CSP) blocks any external request).

## Security posture

- Content-Security-Policy injected at build: `default-src 'self'`, no external scripts or connections, `object-src 'none'`, `form-action 'none'`.
- No analytics or external requests. Imported files are parsed locally, limited to 10 megabytes (MB) and 10,000 loans, validated by a strict schema, never fetched from URLs.
- The exported comma-separated values (CSV) file neutralizes spreadsheet formula injection.
- Hosts that support headers should also send `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `X-Frame-Options: DENY`.

## A corporate (for example FICO) deployment is a separate configuration

It requires the organization's approved host, authentication, a security review and a
data policy before any business data is enabled. The role selector is not authorization.
Keep the public synthetic demo and any authenticated deployment as distinct deployments.
