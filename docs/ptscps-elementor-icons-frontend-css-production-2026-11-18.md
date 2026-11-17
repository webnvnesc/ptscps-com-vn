# PTSCPS — Elementor icons/frontend 2-to-1 CSS bundle and real gzip, 2026-11-18

## Current outcome
**Production ACTIVE**, [successful workflow #44137893755](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44137893755), **12/12 browser QA passed** on six URLs × mobile/desktop. Two earlier bundles remain unchanged:
- Jannah core6 (6→1) across public pages.
- Elementor homepage widget+Swiper (10→1) on the main homepage.

New third bundle: Elementor `elementor-icons-css` and `elementor-frontend-css` → **1 file** wherever both contiguous original stylesheets occur. This saves one request on those pages while preserving all other scripts and conditional per-page CSS.

### New release details
- Bundled CSS `wp-content/themes/jannah-child/ptscps-elementor-icons-frontend-20261118-v1.css`; 77,390 bytes uncompressed, SHA256 `6ac680c5b8730d6fdcc8c53b5f6221ba746716a5d6e363240996c9d5b6880522`.
- Manifest SHA256 `46f5b4b2d3e723a229bca03a2caf796fb345196aabe6219d268b6c108b0ede34`; MU plugin PHP SHA256 `820f2b0564471589491251bbf9ee5ac91f6e376c7a3ceffddb6452e35a2d9f16`.
- Sources: Elementor eicons `elementor-icons.min.css?ver=5.53.0` and Elementor frontend `frontend.min.css?ver=4.2.2`.
- Release source `deploy/ptscps-elementor-icons-frontend-bundle.php`; builder/upload/rollback `scripts/ptscps-eif-stage-and-deploy.py`; QA `scripts/ptscps-eif-production-qa.cjs`, workflow `.github/workflows/ptscps-eif-css-production.yml`.
- Manual independent rollback is available as `scripts/ptscps-eif-manual-rollback.py` + `.github/workflows/ptscps-eif-manual-rollback.yml`. It checks all three SHA256s then deletes only the third bundle's plugin/CSS/manifest before purging WP HTML cache, leaving earlier bundles alone.
- MU-plugin uses safe nested `wp_head` buffer, verifies expected CSS ID, order, source URLs, media and manifest, and excludes admin, preview, Elementor editor and REST. On mismatch WordPress original styles are output unchanged.

### QA details
- Real production QA: `/`, `/e`, `/lien-he`, `/dich-vu`, `/thu-ngo.htm`, `/tin-tuc` × 412px mobile and 1440px desktop.
- All 12 saw one new CSS bundle, no two original tags, a loaded stylesheet, HTTP 200, Jannah existing bundle, and homepage Elementor widget bundle unaffected. Header/logo dimensions, home slider and customer carousel, overflow and browser page errors passed.
- Initial [workflow #44137146047](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44137146047) passed 11/12, but the desktop news page's logo was temporarily 0×0 after 900ms; automatic exact rollback succeeded. Revised QA waits for the native asynchronous header to settle and reloads once if needed, but still fails if logo stays absent; [#44137893755](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44137893755) passed all 12. The failed run must not be reported as a production CSS regression without baseline comparison.

## Compression proven before third merge
The [read-only HTTP check #44136993022](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44136993022) requested live CSS with `Accept-Encoding: identity`, `gzip`, and `br, gzip` and observed:
- Jannah core6 329,321 bytes identity → 60,302 bytes with gzip (81.7% smaller).
- Elementor homepage widgets 48,749 bytes identity → 8,659 bytes with gzip (82.2% smaller).
- Eicons original CSS 22,258 bytes → 4,552 bytes gzip.
- Elementor frontend original CSS 54,666 bytes → 7,271 bytes gzip.
- Server returned **gzip even when br was accepted**. Brotli not enabled or not selected for these files, but gzip is active. **Do NOT manually gzip CSS or serve double-compressed CSS.** Minification and transport gzip differ.
- A follow-up read-only HTTP check was triggered for all three live bundle URLs including the new icon/frontend bundle; use its verified response for exact third-bundle gzip transfer size.

## Limits
The third merge reduces one CSS request, but no valid paired SI/FCP/LCP improvement measurement has yet been made. Do not claim Speed Index gains solely from request count. Retain independent rollback mechanisms and user-side 5–10 PSI/Lighthouse trials. Avoid forced universal bundling of page-specific Elementor CSS and coupling SR7 to Jannah.
