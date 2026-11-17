# PTSCPS - Post SVG/preconnect Lighthouse 20-run review (2026-11-17)

## Checkpoint and scope
- Previous production trial: CSS SVG masks for the homepage customer-carousel arrow glyphs; removal of two unused Google Fonts preconnects. [Successful deploy #44092560116](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44092560116), 10/10 browser QA, Exo and Jannah untouched.
- New **read-only** Lighthouse run [#44094582100](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44094582100): 10 mobile + 10 desktop reports, both jobs successful, stock Lighthouse 13.5.0, same source script/preset as baseline `scripts/ptscps-lighthouse-repeat-10.cjs`. No production change in this workflow.
- Closest previous baseline: [WebP postdeploy #44074880739](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44074880739), 5 mobile + 5 desktop Lighthouse reports 13.5.0, before the SVG/preconnect trial. A historical 10+10 baseline also exists in `docs/ptscps-independent-lighthouse-20-run-2026-11-17.md` but precedes intervening WebP optimizations; not a strict comparator.

## Median Lighthouse comparison

| Metric | Before mobile (5) | After mobile (10) | Before desktop (5) | After desktop (10) |
|---|---:|---:|---:|---:|
| Performance | 93 | 94 | 97 | 98 |
| FCP | 1903.876 ms | 1914.087 ms | 526.955 ms | 451.624 ms |
| LCP | 2348.331 ms | 2225.886 ms | 584.955 ms | 504.374 ms |
| Speed Index | 4853.451 ms | 4360.381 ms | 1839.239 ms | 1681.214 ms |
| TBT | 3 ms | 3.5 ms | 0 ms | 0 ms |
| CLS | 0 | 0 | 0.0052903 | 0.0249046 |

- Mobile new run: score mean 94.6, median 94, range 93–96; FCP median 1914ms; LCP median 2226ms; SI median 4360ms, range 3847–5263ms; TBT median 3.5ms; CLS 0 throughout.
- Desktop new run: score mean 97.4, median 98, range 95–98; FCP median 452ms, range 406–846ms; LCP median 504ms, range 456–906ms; SI median 1681ms, range 1466–1897ms; TBT 0 throughout; CLS median 0.0249, range 0.0237–0.0294.
- Mobile SI median improved ~493ms (~10.2%); desktop SI improved ~158ms (~8.6%). FCP mobile effectively flat; desktop lower ~75ms.
- These are **between-run observations, not causal attribution**. Sample counts differ (5 before / 10 after), lab conditions may fluctuate, and the after run overlapped an independent customer-carousel WebP backfill workflow [#44095072369](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44095072369) started 13:40:24Z while mobile samples ran until 13:40:42Z and desktop until 13:41:36Z. Depending on when its files began changing, late measurements may have different WebP state. Do not attribute changes solely to SVG/preconnect.

## CLS attribution follow-up
- Independent read-only Chrome trace [#44095348895](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44095348895).
- Desktop fast: CLS sum 0.017147 (not identical to Lighthouse throttled 0.0249); major shift at ~2011ms valued 0.01645. `nav#main-nav` and `article#the-post` moved vertically ~38.6px. The menu/header sticky state was in trace; carousel arrow glyphs were not the primary layout shift sources identified.
- Additional smaller shift at ~1999ms 0.000697 from article metadata/menu geometry.
- Mobile fast: CLS 0; mobile throttled: CLS sum ~0.054829, shifts at ~5789ms 0.045177 (`article#the-post`, mobile header components) and ~6939ms 0.009652 (Elementor section). One mobile-throttled browser diagnostic logged `el.getBoundingClientRect is not a function`, so results should be interpreted with care; no effect was observed in Lighthouse mobile (10/10 CLS zero).
- The increase in desktop CLS is material for trend tracking but still under the 0.1 good threshold. Do not assume SVG caused it; no controlled rollback/A-B has isolated cause. Separate header geometry study should precede production changes, avoiding regression to good FCP/LCP.

## Decision
- **Retain existing tested production SVG/preconnect trial.** No evidence from this measurement justifies immediate rollback. 20/20 Lighthouse measurements completed, performance score medians stable or better, mobile CLS zero, desktop CLS below 0.1.
- Do not claim that all SI improvement comes from SVG or eicons removal, given concurrent WebP work.
- No additional production mutations made as part of this measurement or this checkpoint.
- Future follow-up: if desktop CLS rises again or regression appears in real-user field data, compare fresh matched Lighthouse A/B with/without sticky nav behavior in a browser-only controlled test before editing Jannah or Elementor markup.

## Repository / operations
- Workflow: `.github/workflows/ptscps-lighthouse-repeat-10.yml`.
- Browser layout trace: `.github/workflows/ptscps-cls-diagnostics.yml`.
- All original Lighthouse reports are retained in the run artifacts. Production rollback for SVG/preconnect remains governed by `.github/workflows/ptscps-font-head-svg-live.yml` and its owned MU plugin scripts.
