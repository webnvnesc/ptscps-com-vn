# PTSCPS - Lighthouse Speed Index filmstrip regional attribution (2026-11-17)

## Current request
User wants lower Speed Index while preserving Slider Revolution admin editability, existing LCP preload/CSS poster, CLS and TBT. Do not regress previously verified optimized production.

## Read-only measurements
- GitHub Actions [#44111181913](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44111181913) (both mobile and desktop jobs SUCCESS), pinned Lighthouse 13.5.0, 3 runs per device, no production mutation, browser request blocking or injected CSS.
- Source `scripts/ptscps-si-filmstrip-regions.cjs`, workflow `.github/workflows/ptscps-si-filmstrip-regions.yml`. Store full Lighthouse JSON and screenshots as runner artifacts.
- **Mobile median**: score 95, SI 4526ms, FCP 1869ms, LCP 2167ms, TBT 3ms, CLS 0.
- **Desktop median**: score 97, SI 1661ms, FCP 553ms, LCP 613ms, TBT 0, CLS 0.02372.
- Filmstrip divided into five *approximate viewport-height* bands (header upper 0–18%; hero upper 18–40%; hero lower 40–63%; below-hero 63–83%; viewport bottom 83–100%). These bands **are not pixel-perfect DOM component boundaries**. Each frame compared via 3px sample pixel delta against early reference at/around max(3800ms, LCP+1400ms) capped 6500ms.
- Mobile median first frame within 10% changed pixels relative to early reference is 2418ms for all bands. At first filmstrip frame at or after LCP, delta vs early reference was header 1.2%, hero upper 3%, hero lower 0%, below-hero 0%, bottom 0%. Later **max** sequential frame changes up to 85% in hero and 74% below-hero; that maximum may reflect autoplay/slide transitions rather than late initial paint.
- Desktop medians settle at 2297ms for header and hero, 2871ms for below-hero. Pixel difference at first frame at/after LCP vs early reference: header 38.7%, hero upper 93.2%, hero lower 90.2%, below-hero 56.1%, bottom 35.1%. Changes after LCP are broad. This is evidence of late visual progression but cannot attribute cause to Canvas, CSS preloader or animation without frame inspection.
- Compare earlier [SR7 visual-readiness](ptscps-sr7-visual-readiness-2026-11-17.md), [canvas foreground overlay A/B](ptscps-sr7-canvas-poster-ab-2026-11-17.md), [static hero A/B](ptscps-mobile-fcp-slider-vs-static-2026-11-17.md). Poster paints ahead of JS; extra foreground overlay gave no meaningful FCP/LCP benefit and worse whole-view pixel proxy in 3 valid pairs, so was rejected. Banner 2/3 request after first image/LCP, not upfront contention. Do not repeat or deploy those failed candidates.
- Crucial: Lighthouse Speed Index is computed from visual completion of the **entire first viewport**. Our band-diff is an attribution *proxy*, not the standardized SI; frames sampled sparsely (Lighthouse thumbnail timings) so settling timestamps should not be used as exact paint event timestamps. URL changes or autoplay may make the last frame a poor visual target. Results do **not prove SR7 is sole culprit**.

## Recommendation and next experiment
1. Keep production SR7 first-image CSS poster and dynamic head preload; keep JS/CSS dependencies, auto WebP and all admin editing. No speculative global defer, remove Slider Revolution, duplicate preload or eager load slides 2/3.
2. For a future *controlled* browser-only A/B, hold exactly first native slide (or disable autoplay temporarily) during Lighthouse capture, while preserving slide interaction and restoring autoplay after the test, and separately test suppressing only SR7 preloader overlay (not rendering) if isolated. Use same mobile runner; compare **actual Lighthouse SI** over repeated alternating pairs plus screenshot filmstrip, FCP, LCP, TBT, CLS and JS/runtime errors.
3. In filmstrip, attribute pixels by actual DOM bounding boxes (header, SR7 module, first below-banner block) and check whether the high late-region delta is merely autoplay rather than initial incomplete rendering. Avoid changing production unless a candidate repeatedly improves SI without CLS/TBT/slider breakage.
4. Preserve screenshot-level evidence in artifacts; do not claim a speculative SI improvement or hosting/WordPress cause.

## Status
Read-only diagnostics committed, production unchanged. The open item is finding and validating a safe, *causal* Speed Index intervention.
