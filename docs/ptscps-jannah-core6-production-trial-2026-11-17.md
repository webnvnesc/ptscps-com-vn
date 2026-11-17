# PTSCPS — Jannah six stylesheet bundle production trial (2026-11-17)

## Status and verification
- User requested **merge CSS and deploy to production** so they can measure Speed Index with their own Google PageSpeed Insights environment.
- **DEPLOYED, verified**: [GitHub Actions #44129680185](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44129680185), all steps successful; no rollback.
- Browser QA via `scripts/ptscps-core6-production-qa.cjs`: 5 public URLs (`/`, `/lien-he`, `/dich-vu`, `/thu-ngo.htm`, `/e`) × mobile 412 and desktop 1440 = **10/10 passed**, bundle active in **10/10**, 0 fallback cases and 2/2 home cases using the bundle.
- Each page has one `<link id="ptscps-jannah-core6-css">` with stylesheet `?v=...`; original six handles are absent on bundled public HTML; actual CSS response is 200 and `text/css` with loaded stylesheet object.
- QA checked header/logo bounds, slider first-hero native slides, customer carousel slides and SVG arrow mask, CSS/JS request failures, JS page errors and horizontal overflow. Browser QA is a smoke/layout test, **not a full visual pixel diff or Lighthouse score claim**.
- WP Super Cache cleared after deployment with authenticated control. On QA failure, pipeline was configured to remove only owned files and clear HTML cache; rollback not needed.
- The combined CSS content **329,321 uncompressed bytes**, SHA256 `e5aebeb1434c9b902bb57b23db5d4716e480102d84592af770fbf976f52e2363`.
- Six original styles, in exact order, with current Jannah version 7.6.3:
  1. `tie-css-base-css` — `base.min.css`
  2. `tie-css-styles-css` — `style.min.css`
  3. `tie-css-widgets-css` — `widgets.min.css`
  4. `tie-css-helpers-css` — `helpers.min.css`
  5. `tie-fontawesome5-css` — `fontawesome.css`
  6. `tie-css-ilightbox-css` — `ilightbox/dark-skin/skin.css`
- Request-count change **6 to 1 for only this subset** (five CSS requests fewer), *not* total site CSS request count. No other CSS intentionally combined. Builder preview/admin remains outside the trial.
- Entire bundling is prebuilt with relative `url(...)` references rebased to absolute URLs and original stylesheet order preserved; never do runtime concatenation or alter the theme's source files.

## Implementation
- Source plugin: `deploy/ptscps-jannah-core6-bundle.php`, deployed at `wp-content/mu-plugins/ptscps-jannah-core6-bundle.php`.
- Static CSS: `wp-content/themes/jannah-child/ptscps-jannah-core6-20261117-v1.css`; manifest alongside as `.json`.
- Build/deploy script: `scripts/ptscps-core6-stage-and-deploy.py`.
- Main deploy workflow: `.github/workflows/ptscps-core6-css-production.yml`.
- Plugin only buffers `wp_head` (nested safely within existing font-head SVG trial), replaces the six links if **all** tags appear exactly once, in the expected order, `media=all`, original source URLs match manifest and no other `<style>` or `<link>` occurs between them. If any check fails, it prints original HTML unchanged (fail open).
- Scoped to public HTML; never operate on WP admin, REST, AJAX, feed, preview, Elementor preview or customizer. No CDN/rewrite changes or changes to Jannah/Elementor/SR7 data.
- Static build SHA and exact deployment records archived in successful workflow artifacts.

## Rollback and testing instructions
- **Manual one-click rollback** in GitHub Actions: `.github/workflows/ptscps-core6-css-manual-rollback.yml` (workflow_dispatch only). It uses `scripts/ptscps-core6-manual-rollback.py` to remove the exact SHA-verified MU plugin, manifest and CSS in that order; refuses mismatches and purges WP Super Cache.
- PHP plugin SHA256 `d3b0ee3f615aeb338abdedbdd3f8b3afcdaa2e45d5e9223e9de7cfa8b5832bb1`; manifest SHA256 `a261a1d1aec0da82dd58c569fcea72739e167dbe9441d6389686385492ccc87a`; CSS SHA above.
- For user-side validation, test **fresh sessions, cache disabled**, run multiple PageSpeed Insights samples (both mobile/desktop) and compare FCP, LCP, SI, TBT and CLS. This deployment was requested for user-side testing; **no measured improvement should be claimed yet**.
- Keep the previous baseline and earlier tests on hand; Jannah header has historically rendered incorrectly when critical CSS is missing in other experiments. If user reports broken header/navigation/logo or regressions, revert using the manual workflow rather than globally deferring critical CSS.
- Updating Jannah may change stylesheet version URLs; guarded MU plugin will fail open rather than use stale bundled CSS; re-run source validation/build before any replacement.
