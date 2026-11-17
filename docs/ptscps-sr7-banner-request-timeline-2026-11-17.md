# Slider Revolution: timing of banner 1 LCP against slide 2/3 requests (2026-11-17)

## Production read-only measurement

[GitHub Actions #44013939276](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44013939276): **2/2 matrix jobs success**, Chrome desktop unthrottled and mobile with 150ms RTT, 210 KiB/s download, 4x CPU throttling; 2 cold-cache cycles each. Read-only, no production changes.

| Device | Run | Banner 1 network complete | Banner 1 LCP render | Banner 2 request start | Banner 3 request start | Slide first activated (data-current=1) |
|---|---:|---:|---:|---:|---:|---:|
| Desktop | 1 | 2102ms | 2356ms | 4190ms | 4192ms | 3748ms |
| Desktop | 2 | 1060ms | 1288ms | 2721ms | 2957ms | 2309ms |
| Mobile throttled | 1 | 3634ms | 3892ms | 9571ms | 9579ms | 9080ms |
| Mobile throttled | 2 | 2117ms | 2456ms | 8376ms | 8423ms | 7911ms |

Findings:
- **All four measurements:** neither slide 2 nor slide 3 starts downloading before first banner image is finished or before first banner registered as an LCP element. This refutes the hypothesis that the other images are competing with the **initial** banner network fetch for these runs.
- The first `ruby-banner.jpg` was requested with High priority due to the dynamic preload in head. Its rendering as LCP occurred 223–258ms after network completion on desktop and 258–339ms after on throttled mobile.
- `sr.module.ready` events occurred at 2035/3482ms desktop, 7135/8283ms mobile; module `data-current=1` activation occurred later at 2309/3748ms desktop, 7911/9080ms mobile. Thus **SR7 JS interactive activation lags first-image LCP**, significantly on mobile.
- API slide2/slide3 requests begin just before subsequent banner images start loading; they do not block the initial LCP by preempting first-image network bandwidth. Slide 2/3 begin within ~0.5 seconds after initial JS slide activation, however. This loading can still affect later rendering/transitions and CPU usage, and there is no evidence proving they are free of other costs.
- On mobile, first-image LCP is the CSS background poster of `sr7-module#SR7_1_1`, and does **not** mean Slider Revolution JS itself has painted its full first slide. Poster can be visible while first `sr7-slide` has `visibility:hidden`.
- On all runs, module changes from `data-current=1` to `3`, then `2`, then `1` at about 9-second intervals. The slide sequence may be configured by SR7; do not alter without admin intent.
- **No change to production in this investigation.** Future optimization focus: reduce SR7 initialization latency (SR7 JS boot, class/style manipulation, API requests, long dependency chain) without affecting controls, CLS or LCP; compare read-only filmstrip and production A/B before any change.

Machine-readable evidence: `scripts/ptscps-sr7-banner-timeline.cjs` and `.github/workflows/ptscps-sr7-banner-timeline.yml`, archived workflow artifacts from both jobs.

Interpretation caveat: these metrics reflect four monitored cold-cache browser sessions, not the distribution of real user devices. LCP image/background and `data-current` are the directly observed signals, not a pixel-diff test of when all layers are visually complete.
