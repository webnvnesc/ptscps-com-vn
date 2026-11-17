# PTSCPS Elementor homepage widget CSS bundled production trial — 2026-11-17

## Status
**Production deployment succeeded**, GitHub Actions [run #44134227431](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44134227431), all checks successful. The original Jannah core6 production bundle remains active and untouched.

## Scope
On only the actual WordPress front page `/`, one generated CSS bundle replaces exactly ten adjacent linked stylesheets in original order:
`widget-image-css`, `widget-image-box-css`, `widget-heading-css`, `widget-spacer-css`, `widget-divider-css`, `widget-posts-css`, `e-motion-fx-css`, `swiper-css`, `e-swiper-css`, `widget-image-carousel-css`.

- Original source versions Elementor 4.2.2, Elementor Pro 4.1.0, Swiper 8.4.5; source links and exact order recorded in manifest.
- Previously ten requests, now **one**, nine CSS requests fewer on the homepage. Bundle **48,749 raw bytes** with SHA256 `0c0ab22e2c81e032fa734ab72efb097d7debeef4599148bc5686fcdd0ffffafa`. Network transfer savings will depend on compression and cache, not yet quantified.
- New URL: `/wp-content/themes/jannah-child/ptscps-elementor-home-widgets-20261117-v1.css?v=0c0ab22e2c81`.
- MU plugin: `wp-content/mu-plugins/ptscps-elementor-home-widgets-bundle.php`; source `deploy/ptscps-elementor-home-widgets-bundle.php`.
- Standalone CSS + manifest in `wp-content/themes/jannah-child`. Never changed Elementor widget content or original CSS files.
- The MU-plugin buffers wp_head nested safely with existing Jannah core6 and font-head buffers. Strict fail-open if source URL/versions, order, media, count or CSS manifest differs; no bundling in WP admin, Elementor preview, customizer, AJAX, REST, feeds or on pages other than front page.
- This is **not a global CSS merge** and does not force widget CSS into unrelated pages. English `/e` retains its original conditional CSS.

## QA and proof
- The final workflow deployed via encrypted FTPS, cleared WP Super Cache through its authenticated control and tested real production in Chromium.
- **8/8 browser QA passed**: `/`, `/e`, `/lien-he`, `/dich-vu` × mobile 412px and desktop 1440px. Both homepage tests confirmed one bundle stylesheet loaded via successful HTTP CSS response and all ten original stylesheet tags absent.
- **6/6 non-home samples untouched**, 8/8 retained Jannah core6 and expected header/logo sizing; homepage SR7 banner and customer logo carousel preserved; no horizontal overflow, failed CSS/JS requests or JS page errors.
- No claims of proven SI/FCP/LCP improvements yet: user explicitly requested production testing on their own PSI environment.

## Previous failed attempts (NOT production regressions)
- [run #44132521093](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44132521093) and [run #44132828122](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44132828122) failed **before production deployment**, because Elementor Pro CSS includes standalone `@charset` directives that cannot appear mid-bundle. Builder was changed to strip only UTF-8 declarations, reject other charsets.
- [run #44133338038](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44133338038) built and deployed but transient WP admin page.goto timeout prevented cache purge. The workflow correctly rolled back all three new files by checksum. Cache was then cleared successfully. A guarded three-attempt cache purge resolved this in the subsequent successful run.

## Rollback independent of Jannah
- Dedicated exact SHA256 rollback script `scripts/ptscps-ehw-manual-rollback.py`, user-invoked workflow `.github/workflows/ptscps-ehw-manual-rollback.yml`. It deletes only the Elementor trial MU plugin, JSON and CSS **after verifying all three hashes**:
  - PHP: `967811f57514ce11814343e7fd3e8be31be1348b6db14103fb109243ac6e3d59`
  - Manifest: `6e42f080d9ce9bbc0261014fe2f69db497c8533300188b2e4d98a9d318fde40c`
  - CSS: `0c0ab22e2c81e032fa734ab72efb097d7debeef4599148bc5686fcdd0ffffafa`
- Rollback then purges WP Super Cache. Jannah core6 is not touched.
- PHP plugin only active with unchanged expected links and source-version manifest. Elementor/plugin upgrades cause fallback to originals; recompile bundle only after auditing new version/order.

## Recommended next action
Ask user to run 5–10 PSI mobile/desktop samples for median SI, FCP, LCP, CLS, TBT and inspect the real first viewport in local browser. Do not compare a single PSI run with the earlier median. Retain trial if repeatable SI gains without UI/CLS regressions; use manual rollback if needed.
