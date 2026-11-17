# PTSCPS slider vs Speed Index – Lighthouse filmstrip evidence (2026-11-17)

Source: [Lighthouse run #44001754110](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44001754110). Read-only. New script: `scripts/ptscps-home-slider-si-lighthouse.cjs`, workflow `.github/workflows/ptscps-home-slider-si-audit.yml`.

## 4 runs on existing production

| Device | Run | Performance | FCP | LCP | SI | TBT | CLS |
|---|---:|---:|---:|---:|---:|---:|---:|
| Desktop | 1 | 95 | 484ms | 510ms | 2233ms | 0ms | 0.00529 |
| Desktop | 2 | 98 | 517ms | 543ms | 1503ms | 0ms | 0.00529 |
| Mobile | 1 | 91 | 1900ms | 1946ms | **6879ms** | 6ms | 0 |
| Mobile | 2 | 69 | 4140ms | 4140ms | **14412ms** | 1ms | 0.000237 |

## What screenshots show

Desktop cycle 1 filmstrip: screenshots at 647, 1294, 1940 ms have identical small (1819B) blank/near-blank compressed image; substantial visual change at 2587ms and again at 3234–5174ms.

Desktop cycle 2: 498 and 996ms similarly near-blank, later frames differ at 1494–3984ms.

Mobile cycle 1: 721, 1443, 2164ms identical near-blank frames; first large visual change at 2886ms, continued changes at 3607, 5050 and 5771ms.

Mobile cycle 2: 1965, 3929, 5894ms identical near-blank frames, visual change at 7859ms and continues through 15717ms.

Evidence is consistent with delayed *visual completeness*, possibly a late-initializing large Slider Revolution region. This is **not** direct proof of causation: the Lighthouse audits do not map each filmstrip pixel to the slide element.

## Network evidence

The Lighthouse network requests include first slide `ruby-banner.jpg` (~71kB transferred), next slides `banner2.jpg` (~95kB) and `banner3.jpg` (~99kB), two `sliderrevolution/sliders/1` XHRs, `tptools.js` (~80kB transfer), and `sr7.js` (~112kB transfer). These requests have an initiator chain within Slider Revolution and banner images are classified as low priority in Lighthouse. The original DevTools screenshot from user shows banners 2 and 3 finishing in 5.82s and 5.90s.

The exported timing fields in `audits.network-requests.details.items` were zero/absent for these URLs in the extraction script, so do **not** infer exact request initiation/completion timestamps from the generated audit summary. The user screenshot has real durations. Need better request timing via CDP or DevTools for causal diagnosis.

Important: images for slides 2/3 may be loaded intentionally for smooth transitions, and finishing late does **not** necessarily worsen SI if no visible region uses them during Lighthouse filmstrip. Do not delete those slides, block API calls, change Slide Revolution builder config blindly, or force `fetchpriority="high"` on all images.

## Suggested next controlled experiments (browser-only first)

1. Collect screenshots at 250ms intervals with pixel-level difference vs the final screenshot, plus timestamp when slide one `ruby-banner.jpg` is rendered (not merely downloaded) and when SR7 root becomes visible.
2. Pair randomized runs with (A) unchanged control, (B) only first slide poster preloaded with `fetchpriority="high"` and no slide2/3 priority change, (C) defer offscreen later slides until first image is displayed. Keep image sizes/responsiveness and preserve all 3 actual slides and API builder.
3. Compare **measured Lighthouse SI**, FCP, LCP, TBT and CLS over repeated mobile and desktop runs. Control for high TTFB variance; stop if no stable improvement.
4. Implement only after benefit proven; use owned MU plugin, WP cache purge, rollback, full slider transitions and Elementor/Slider editor checks. Existing Exo font and CSS optimizations remain untouched.

## Status

Audit completed, **no production changes in this Speed Index task**. Existing site remains intact.
