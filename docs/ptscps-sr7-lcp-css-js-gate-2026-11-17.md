# PTSCPS - Does first-banner LCP wait for JS or CSS? Production read-only audit, 2026-11-17

## User question
User observed a possible ~1.9s interval between image download and LCP and suspects SR7 only paints after JS/CSS activates. Validate using matched real navigations before changing production.

## Evidence / references
- Initial CDP run [#44117430231](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44117430231) collected 3 JS-enabled cases per device, but overall workflow failed because Playwright no-JS screenshot waited for web fonts on desktop and timed out. The JS-enabled samples still have useful timing; no website changes.
- Fixed the diagnostic to use CDP `Page.captureScreenshot` instead of Playwright's font-waiting screenshot. Final run [#44117933013](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44117933013) **SUCCESS** for mobile and desktop, 3 JS-enabled cold-cache samples plus one no-JS control per device. All samples retrieve real production pages and assets; 150ms RTT, ~210KiB/s and CPU x4 for mobile; desktop unthrottled.
- Script `scripts/ptscps-sr7-lcp-gate-audit.cjs`; workflow `.github/workflows/ptscps-sr7-lcp-gate-audit.yml`; raw JSON plus no-JS screenshots archived.
- CDP network `loadingFinished` timestamps and PerformanceObserver LCP measured in same navigation-relative time domain; JS `sr.module.ready` observed separately. CSS audit lists actual stylesheet request completion, not necessarily last moment render-blocking CSS was applied.

## Final run summary (medians across 3 JS-enabled samples)
| Metric | Mobile | Desktop |
|---|---:|---:|
| Navigation responseStart (TTFB) | 871ms | 1181ms |
| First high-priority banner `ruby-banner.jpg` (served as WebP), network complete | 2530ms | 1651ms |
| FCP | 2936ms | 1944ms |
| LCP | 2936ms | 1988ms |
| Image end -> LCP delay | **494ms** | **464ms** |
| SR7 ready event | **5709ms** | **3219ms** |

- Banner 1 is LCP for **3/3 samples on mobile and 3/3 desktop**; element `SR7-MODULE#SR7_1_1`, CSS poster marker present; dynamic `fetchpriority=high` preload present. The `.jpg` public URL delivers actual `image/webp` response; do not mistake name suffix for MIME.
- Desktop slow-tail JS-enabled run: source banner network completed at 2852ms, LCP at 4772ms (**1920ms gap**), `sr.module.ready` at 8848ms, while late stylesheets `asp/style.basic-ho-po-no-da-co-se.css` and `css/revicons.css` completed at 4710/4711ms, around 61–62ms before LCP. This **supports a render-blocking CSS/styling hypothesis**, not direct proof of exclusive causality.
- Mobile stylesheet `css/style.min.css` (Jannah) finished at 3115/2620/2643ms, before LCP at 3372/2912/2936ms respectively (257–293ms gap). Many other scripts and CSS finished later, demonstrating not all CSS/JS downloads are required for the poster to become LCP.
- All 6 JS-enabled cases: SR7 ready occurred **after LCP** (for one previous desktop sample ready event was not captured by the end of observation; final corrected 3/3 did capture it). The native ready event **cannot be a prerequisite for LCP**, although earlier JS may still influence sizing or style/DOM mutation.
- No-JS mobile control: sampled hero rect 382 × 202px, screenshot ~77.3% blue pixel sample and 0% white within the hero clip, strongly supporting a visible CSS poster independent of SR7 JavaScript.
- No-JS desktop control: SR7 module bounding box height **0px**, and screenshot had mostly white pixels. **Do not claim desktop no-JS renders the hero correctly**. Investigate how SR7 desktop height gets established; desktop may depend on earlier JS/inline CSS layout. This does not override observed desktop JS-enabled LCP preceding `sr.module.ready`.
- Under this heavily throttled standalone Chrome audit mobile CLS observer ~0.0537 across cases, higher than separate Lighthouse CLS 0 in earlier runs. This is a measurement/environment difference; no production CSS/JS was changed. Do not claim a new CLS regression solely from this test.

## Diagnosis and operational decision
1. Confirmed user suspicion of a real gap between banner network completion and LCP: typically ~0.5s, and a desktop outlier ~1.9s in the latest run.
2. **Not** waiting for full SR7 initialization (`sr.module.ready`); mobile poster demonstrably renders with JavaScript off. Distinguish *native full initialization* from earlier JS code that could set desktop layout before ready.
3. Multiple important CSS resources finish shortly before LCP, making render-blocking/style/layout the leading hypothesis. Proximity is correlation, not proof. Previous critical-Jannah-CSS asynchronous A/B was rejected due breakage; do not blindly defer Jannah CSS, jQuery or remove SR7.
4. Follow-up, if needed: browser-only paired A/B measuring first viewport with stable HTML, exact key CSS request timing and desktop SR7 module height establishment. Test only a carefully scoped, non-blocking layout/poster alternative and measure actual Lighthouse SI/FCP/LCP/CLS/TBT with functional QA. No production changes without robust benefits and rollback.
5. This audit made **no** modifications to production files, plugins, builder content, cache, or DNS.

## Source references
- `deploy/ptscps-sr7-first-poster.php` v1.0.3 provides dynamic preload plus first-image CSS poster and retains all actual native SR7 slides/admin editing.
- Prior static hero A/B and foreground overlay A/B were rejected for lack of demonstrated benefit.
