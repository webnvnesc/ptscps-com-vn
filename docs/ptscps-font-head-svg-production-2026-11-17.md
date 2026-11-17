# PTSCPS - Google preconnect + customer carousel SVG, production checkpoint (2026-11-17)

## Verified deployment
- **Success**: [GitHub Actions #44092560116](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44092560116), commit `670324cbb82d2e5945bed126d93f161a96a4c921`, 10/10 live Playwright device/page combinations.
- Reversible MU plugin: `deploy/ptscps-font-head-carousel-svg.php` v1.0.1, installed under `/domains/ptscps.com.vn/public_html/wp-content/mu-plugins/`.
- Scope: public-facing HTML only; admin, Elementor editor, preview, REST, AJAX and feeds untouched.
- Removed only `rel=preconnect` hints to `fonts.googleapis.com` and `fonts.gstatic.com`. WordPress `wp_resource_hints` filter plus `wp_head`-scoped buffer cover Jannah's direct head output. Does not strip unrelated DNS hints, preloads or styles.
- Exactly two homepage customer-carousel arrows use CSS SVG mask on existing `.elementor-element-ed1c7da` icon nodes. Elementor/Swiper buttons, handlers and aria-labels stay unchanged. No JS needed to display arrows.
- Exo local remains with `font-display:swap`; neither Exo, theme `tiefonticon` nor other optimized plugins were changed.
- Production QA 5 paths (`/`, `/lien-he`, `/dich-vu`, `/thu-ngo.htm`, `/e`) × 2 devices: 10/10 pass, no JS page errors, no horizontal overflow, both homepage carousel controls styled and next slide advances.
- Homepage now requests eicons *stylesheet* but **not eicons WOFF2** (QA `iconRequests:1` vs previous `2` on homepage). Other pages likewise retain stylesheet; `/e` still needs icon font so its requests remain 2. No global dequeue.
- Font Exo loaded correctly. Browser samples are correctness tests; not a Lighthouse before/after performance claim.

## Failed first canary, safety behavior
- [Run #44091575990](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44091575990) failed live HTML checks: Google hints still present; Elementor widget rendering filter did not rewrite two icons. It automatically rolled back only the trial MU plugin and purged cache. No JS/page layout failures.
- v1.0.1 switched to head-scoped hint removal and CSS SVG masks that do not depend on Elementor's widget render filter.

## Operations
- Deploy/rollback: `scripts/ptscps-font-head-svg-deploy.py`, `scripts/ptscps-font-head-svg-rollback.py`.
- Production workflow: `.github/workflows/ptscps-font-head-svg-live.yml`. It validates PHP/code, uploads by encrypted FTPS with checksum verification, purges WP Super Cache, QA checks 10 live cases, automatically rolls back on failure, and archives evidence.
- Future Elementor edits: if homepage widget ID changes or new eicons are used, re-audit before deciding on stylesheet dequeue. Avoid premature eicons removal.
