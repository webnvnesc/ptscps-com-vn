# PTSCPS — production content-visibility: auto pilot (2026-11-17)

## Goal
User requested a **reversible production trial** of `content-visibility: auto` for offscreen sections, then will manually compare Google PageSpeed Insights. Preserve desktop PSI 100, mobile CLS ~0 and TBT ~20ms, Slider Revolution functionality and native Elementor editing.

## Predeployment element geometry
Read-only Chrome audit workflow [#44035369401](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44035369401), mobile 412×850 and desktop 1440×900:

| Elementor section ID | Contents | Mobile top/height | Desktop top/height | Decision |
|---|---|---|---|---|
| `77137dd` | SR7 first banner | y102, h212 | y168, h331 | Never defer |
| `920fc5e` | first content | y313, h221 | y499, h110 | Never defer |
| `a34b2bb` | services | y534, h536 | y609, h161 | Never defer |
| `1c36b17` | news | y1070, h991 | y770, h495 | **Mobile only**, intrinsic auto 991px |
| `1be3f74` | customers carousel | y2061, h148* | y1265, h214 | Do not defer |

The carousel's mobile height dynamically changed to ~288px on scroll, so guessed intrinsic height could increase CLS. The first trial included customer carousel and its QA rejected height/text assumptions. Rollback succeeded and homepage cache was cleared in workflow [#44035736543](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44035736543). No unsupported edits left by that attempt.

## Live pilot v1.0.1

**Deployed and production-verified** in workflow [#44035998759](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44035998759) SUCCESS:
- Owned MU file: `/wp-content/mu-plugins/ptscps-content-visibility-pilot.php`; source `deploy/ptscps-content-visibility-pilot.php`.
- Inline `<style id="ptscps-offscreen-content-visibility-v1">` in homepage head, only anonymous non-editor, behind `@supports(content-visibility:auto)` and `@media(max-width:767px)`.
- Applies **solely** to `body.home .elementor.elementor-5 > section.elementor-element-1c36b17` (mobile news): `content-visibility: auto; contain-intrinsic-size: auto 991px;`. Desktop and tablets ≥768px are unchanged, as are SR7 hero, news desktop, customers carousel, header and Jannah/Elementor assets.
- Homepage WP Super Cache HTML cache selectively cleared to expose pilot; no DNS, JS, CSS critical defer, theme source or Elementor data edits.

Production QA passed:
- Mobile: news `contentVisibility=auto`, intrinsic `auto 991px`; height 991px and top 1070px, restored textLength 1035 on scroll. Customers `contentVisibility=visible`, height 288px and 21/21 images loaded. SR7 first CSS poster still visible, 412px document width, no JS errors. Mobile CLS ~**0.00215** through scrolling (not the standardized PSI CLS score).
- Desktop: news and customers `contentVisibility=visible`, correct geometry and carousel 29/29 loaded; SR7 poster visible, no JS errors; CLS ~0.00074 through scrolling.
- Non-home `/lien-he`: 200, no pilot style. Production plugin checksum verified via FTPS in workflow.
- Automatic rollback step skipped because QA succeeded.

**No claim of SI/FCP gains yet.** The user plans to compare PSI. Baseline screenshot 2026-11-17 desktop Performance 100, FCP 0.4s, LCP 0.5s, SI 1.0s, TBT 0, CLS 0.006; mobile Performance 73, FCP 2.3s, LCP 5.7s, SI 5.0s, TBT 20ms, CLS 0. CSS may provide only small improvement because news starts 220px below mobile viewport and browsers may treat near-viewport content as relevant.

## Rollback
If PSI mobile SI does not improve or FCP/LCP/CLS regress, run manual [ptscps-content-visibility-rollback.yml](../.github/workflows/ptscps-content-visibility-rollback.yml). This runs `python3 scripts/ptscps-content-visibility-deploy.py --rollback` to rename the *owned* MU plugin to `.disabled` and selectively purge homepage cache. Alternatively revert via user's instructions. Do not remove plugin without cache invalidation. The source remains in repo for reproducibility.
