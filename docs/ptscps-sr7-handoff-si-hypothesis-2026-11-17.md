# PTSCPS - Is high SI caused by native SR7 slider completion after early LCP? (2026-11-17)

## Distinction
The user asks whether the whole banner is visually completed only after Slider Revolution initialization, increasing **Speed Index** even though the initial CSS poster is recorded as LCP. Previous replies focused too narrowly on first LCP. FCP/LCP and Speed Index are not interchangeable; SI integrates changing visual progress of the viewport. A CSS poster can register LCP without proving the native Canvas/overlays are visually stable.

## Controlled read-only timeline
- Production read-only [run #44119307948](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44119307948), **2/2 jobs success**, mobile (150ms RTT, ~210KiB/s, CPU 4x), desktop unthrottled, **2 cold-cache sessions per device**.
- Script `scripts/ptscps-sr7-visual-handoff.cjs`, workflow `.github/workflows/ptscps-sr7-visual-handoff.yml`.
- Actual Chrome snapshots around LCP, ~400ms before and after `sr.module.ready`. Compare 5px sampled JPEG-decoded pixel changes (per-channel average difference >=20/255) inside native SR7 hero bounding box and the full first viewport. Native slider and scripts were not modified. Screenshot/JSON evidence archived.
- All four runs valid; same native first-slide identifier across directly compared frames (no recorded slide swap), no JS page errors.

| Device | LCP | sr.module.ready | Hero change before/after ready | Whole viewport change before/after ready |
|---|---:|---:|---:|---:|
| Mobile 1 | 2896ms | 5782ms | 1.8% | 0.4% |
| Mobile 2 | 2700ms | 5592ms | 1.3% | 0.3% |
| Desktop 1 | 2180ms | 2927ms | 0.4% | 4.7% |
| Desktop 2 | 1960ms | 2736ms | 56.5% | 29.2% |

- Mobile median hero changed **68.3%** when comparing screenshot roughly LCP+300ms to roughly ready+800ms. That is compelling evidence of visual changes *after LCP and before completion of the native slider sequence*, but does not isolate the responsible canvas, preloader, overlay, animation, font, or other DOM visual. It is **not** proof that the `ready` event itself gates those changes; immediately around ready mobile change is just ~1.55%.
- Desktop is inconsistent: one minimal hero change, one 56.5% change around native ready. Investigate frame-by-frame timing and per-element region; do not generalize from two desktop runs.
- A visual screenshot pixel-delta percentage is not Google's Lighthouse Speed Index. Compression tolerance, 350ms snapshot cadence, variable timing/TTFB, CSS effects, and carousel animation are confounders. Native first-slide identifier stayed the same in compared frames but its Canvas/layers or transition can still animate.
- Previous Lighthouse 3× mobile [#44111181913](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44111181913) median SI 4526ms / LCP 2167ms, desktop SI 1661ms / LCP 613ms, confirming post-LCP visual activity is worth isolating.
- Previous controlled A/B of extra foreground poster ([#44062600013](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44062600013)) did not improve whole-viewport pixel-proxy SI, so do **not** deploy that previously rejected variant as a shortcut.

## Next safe test
1. Native SR7 image and CSS poster are already preloaded. Do not add more preload or global CSS/JS deferral.
2. Under *same runner and HTML*, do a browser-only A/B where SR7 runtime remains but the first-slide Canvas/preloader handoff is held visually stable during early viewport painting (no changes to slide ordering/URL/editor data), or temporarily turn off early animation/autoplay in browser only. Measure the actual Lighthouse Speed Index in both variants with at least 5 alternating matched samples and watch FCP/LCP/CLS/TBT.
3. Correlate crop pixel change timestamps with native computed opacity/visibility, Canvas bitmap mutations and `sr.module.ready` to discriminate animation from initial render.
4. Only roll to production via reversible MU-plugin with Slider Revolution/Elementor admin edits and mobile/desktop functional QA after clear reproducible gains.

## Production status
**No production changes** in this experiment. Diagnosis updated, native slider editing and other optimizations preserved.
