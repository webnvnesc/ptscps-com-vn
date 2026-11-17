# PTSCPS — native SR7 Canvas vs first-image CSS overlay handoff (2026-11-17)

## Request and hypothesis

User inspected the live SR7 DOM and showed `<canvas data-use-for="BGContentImage">` nested under `<sr7-bg>` for each slide, including `ruby-banner.jpg`. The existing MU plugin already places an early dynamic CSS `background-image` on `sr7-module#SR7_1_1`, preloads the current first published slide, and preserves SR7. DevTools had shown a commented-out background-image declaration, but this alone cannot establish when SR7 modifies/overrides it or how soon the banner is actually painted.

Asked to test:
- **A:** production HTML and SR7 Canvas/current early module CSS poster unchanged.
- **B:** same current first-slide URL as an additional foreground CSS pseudo-element overlay (no hardcoded image in deployed code), shown immediately and removed after the native `sr.module.ready` event, or when the current slide changes, or by a 9-second safety timeout. SR7 and all native scripts, Canvas and admin-edited slides remain present.

## Browser-only controlled experiment

Workflow [#44062600013](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44062600013), script [scripts/ptscps-sr7-canvas-poster-ab.cjs](../scripts/ptscps-sr7-canvas-poster-ab.cjs).

- Chrome mobile viewport 412×850, slow-network emulation 150ms RTT / ~210KiB/s, 4× CPU slowdown, cache disabled, fresh browser context per run.
- One copy of genuine source homepage HTML pinned for both variants. The B change is made **only through Playwright HTML response interception**, not on the live WordPress installation.
- Four A/B alternating paired cycles; Chrome PaintTiming FCP, LCP observer, CLS observer; screen capture and sample non-white-pixel density in first viewport and banner region. Video-derived metrics are **custom visual occupancy proxies**, not Google's standardized Lighthouse Speed Index. Filmstrip JPEG and case JSON saved as workflow artifacts.
- SR7 JS still loads in B, so Canvas remains the actual final renderer and native slide changes are retained for the test.

### Results

3 of 4 pairs passed basic validity gate. One B cycle had large network/dependency errors (`jQuery is not defined` ×7, `elementorModules is not defined` ×2), FCP 7.9s versus 2.2s for its paired A, CLS ~0.0548, 9-second timeout handoff. It was **excluded** from numerical medians, but retained as a serious risk and evidence of intermittent network problems in the remote runner.

| Metric (B minus A, valid paired median) | Result | Interpretation |
|---|---:|---|
| FCP | **+20 ms** | B not faster |
| LCP | **-4 ms** | no meaningful change |
| Banner reaches 80% observed non-white extent | **-71 ms** | B poster paints first-banner region slightly earlier |
| Whole viewport non-white area proxy (integral) | **+63 ms** | B *worse* on this non-standard SI proxy |
| CLS | **0** | same in 3 valid pairs |

Valid pairs:
- Cycle 0: FCP A=2316ms, B=2256ms (-60); LCP A=2464ms, B=2388ms (-76); banner80 -71ms, viewport area +150ms.
- Cycle 2: FCP A=2224ms, B=2368ms (+144); LCP A=2336ms, B=2368ms (+32); banner80 -54ms, viewport area +63ms.
- Cycle 3: FCP A=2184ms, B=2204ms (+20); LCP A=2280ms, B=2276ms (-4); banner80 -146ms, viewport area -62ms.
- Cycle 1: B failed due to jQuery/Elementor dependency errors, unreliable screenshot filmstrip, so no meaningful performance score can be extracted from that cycle.

On valid B runs, `sr.module.ready` fired around 6.2–7.1 seconds after navigation; the overlay was removed at that event. This is **after** FCP and LCP (~2.2–2.5s), supporting that the native SR7 CSS poster already achieves first image paint *without waiting for Canvas initialization*. The B overlay's minor early hero pixel difference did not result in faster overall FCP or meaningful LCP gains. Do not attribute the full PSI "element render delay" to a Canvas redraw solely because a canvas exists.

### Decision

**REJECT / do not deploy B on production.** No material FCP/LCP gain, whole-viewport SI proxy not better, and one inconsistent/faulty run. Keep existing SR7 MU poster/high-priority dynamic first-image preload, original admin-editable slider and current offscreen mobile news `content-visibility:auto` trial intact. **No DNS, WP, SR7, HTML cache, or production files were modified for this A/B**.

Follow-up: if still pursuing lower SI/FCP, use Chrome/Lighthouse tracing (real SI and CSS/render-blocking timeline) in a matched mobile profile, investigate why the entire viewport is only visually complete around 3.5–4.0s while hero reaches ~2.3–2.5s. Focus on header and below-hero first-viewport content as well as stylesheets/fonts, not solely the banner Canvas.

## Reproduction
Workflow: [ptscps-sr7-canvas-poster-ab.yml](../.github/workflows/ptscps-sr7-canvas-poster-ab.yml). Run with `workflow_dispatch`. Output artifact contains per-run JSON and filmstrip screenshots; script code never deploys to FTPS.
