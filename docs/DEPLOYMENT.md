# Deployment runbook

The P0 app is a static site: `npm run build` writes `dist/`, which any static host can
serve. Routing is hash-based (`#/lab`), so refreshing a deep link never needs a server
fallback. There are no secrets, environment variables or servers.

## Before any deployment

1. The commit to deploy has green CI (typecheck, lint, numerics, unit, build, e2e).
2. The destination is confirmed by the product owner. Nothing deploys automatically.
3. Record: commit SHA, model version (`mpl-engine-1.0.0`), build date, URL, smoke-test result, rollback command.

## Option A: GitHub Pages (configured)

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
5. Decision room: Export JSON, Import the same file; "Reproduced N of N saved results exactly".
6. Browser console shows no errors (the production CSP blocks any external request).

## Security posture

- Content-Security-Policy injected at build: `default-src 'self'`, no external scripts or connections, `object-src 'none'`, `form-action 'none'`.
- No analytics or external requests. Imported files are parsed locally, limited to 10 MB and 10,000 loans, validated by a strict schema, never fetched from URLs.
- Exported CSV neutralizes spreadsheet formula injection.
- Hosts that support headers should also send `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `X-Frame-Options: DENY`.

## A corporate (for example FICO) deployment is a separate configuration

It requires the organization's approved host, authentication, a security review and a
data policy before any business data is enabled. The role selector is not authorization.
Keep the public synthetic demo and any authenticated deployment as distinct deployments.
