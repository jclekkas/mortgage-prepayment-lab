# Performance

Targets (PRD section 9): first useful display within 2.5 s; 1,000 loans x full maturity
within 1 s at p95 after load; 10,000 loans under 5 s with progress and cancellation.

## Measured (October 19, 2026)

Environment: cloud development container, 4 vCPU Intel Xeon @ 2.10 GHz, Node 22.22,
Chromium 141 (Playwright build 1194), local `vite preview` of the production build, so
network transfer is excluded. This is a reference measurement, not a documented
modern-laptop reference environment; re-measure there before quoting to users.

| Measure | Result | Source |
| --- | --- | --- |
| Engine, 1,000 loans to full maturity (357 months), behavioral | p50 54.5 ms, p95 64.6 ms (20 runs) | `npm run bench` (Node) |
| Engine, 10,000 loans to full maturity, behavioral | p50 523 ms, p95 531 ms (5 runs) | `npm run bench` (Node) |
| Browser, first useful display (navigation to headline cards) | 246-372 ms across 3 runs | `tests/e2e/perf.spec.ts` |
| Browser, Run click to "results match inputs", 1,000 loans, including worker round trip and render | p50 125-153 ms, p95 174-179 ms (3 runs of 20) | `tests/e2e/perf.spec.ts` |
| Browser, 10,000-loan import, run with progress, cancel, re-run | passes | `tests/e2e/robustness.spec.ts` |
| Production bundle | 487 KB JS (145 KB gzip), 31 KB worker, 9 KB CSS | `npm run build` |

The engine runs in a Web Worker in chunks of 250 loans with a yield between chunks, so
the main thread stays responsive and a cancel takes effect within one chunk. Results are
cached in the worker by input hash plus population filter (24 entries, LRU).

The tests assert generous ceilings (1 s, 5 s, 2.5 s) to catch pathological regressions
without making CI flaky on slower runners.
