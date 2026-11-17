# PTSCPS - SR7 visual readiness checkpoint (2026-11-17)

## Purpose and safety
Continue after commit `f01811e` without redoing the already successful first-image dynamic preload or changing production. New read-only GitHub Actions run [#44014666244](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44014666244) records 2 cold-cache sessions each for Chrome desktop and 4x CPU / slow network mobile. Script: `scripts/ptscps-sr7-visual-readiness.cjs`. Both jobs emitted 2 measured results; JSON and cropped PNG frames archived as workflow artifacts.

## Results
| Device | Cycle | TTFB | FCP | Banner 1 LCP | SR7 ready | Image pixels before first-slide JS visible |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Desktop | 1 | 2736ms | 3360ms | 3360ms | 4975ms | 3902ms: 99.5% non-white; first slide hidden |
| Desktop | 2 | 753ms | 1368ms | 1368ms | 2141ms | 1801ms: 99.3% non-white; first slide hidden |
| Mobile | 1 | 1154ms | 2696ms | 2696ms | 7147ms | 2874ms: 98.6% non-white; first slide hidden |
| Mobile | 2 | 771ms | 2396ms | 2396ms | 6549ms | 2809ms: 98.6% non-white; first slide hidden |

The image pixel statistic is **only within the cropped SR7 hero module**, not full-viewport Speed Index; a dark/saturated poster contributes to nonwhite sampling. Screenshots and browser LCP entries independently support that poster paints before the SR7 JS first-slide activation. Cold-cache TTFB varied substantially; this is not a controlled SI A/B or field estimate. Crop `nonwhite` is not a quantitative visual-completeness score. No pageerrors. Desktop cumulative CLS sampling ~0.00048; mobile sampled ~0.00983 (not the standardized Lighthouse CLS metric).

Prior CDP timeline run [#44013939276](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44013939276) showed slides 2 and 3 start only after banner 1 network complete and LCP in all four sessions; defer or deprioritize them is not justified as an initial hero bottleneck.

## Decision and next work
1. **Keep production MU plugin v1.0.3**, dynamic source image high-priority preload and CSS poster. No change to SR7 image order, autoplay, API fastpath, Jannah or Elementor.
2. **Do not claim SI solved:** full Lighthouse filmstrip has blank/near-blank frames even though SR7 crop is already colorful. Next isolate full-viewport visual progress versus hero, header, overlay, CSS render and lower sections with pixel-diff to a settled frame, under matched conditions.
3. If test proves SR7 preloader/late CSS layer causes SI, A/B one safe browser-only intervention (e.g., foreground first-image poster) with repeated Lighthouse FCP/LCP/SI/TBT/CLS and functional QA, then production canary with rollback if beneficial.
4. Do not change slider JavaScript activation blindly: native transitions/control interaction, admin editing, preview and all slide layers must remain intact.
5. Note sampling caveat: timing screenshot series is target-based but actual capture can lag target under throttled renderer; use measured `t`, not intended target timestamps.

## Status
Diagnostic step implemented on `main`; production unchanged during this step.