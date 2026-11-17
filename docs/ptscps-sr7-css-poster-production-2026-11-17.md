# PTSCPS SR7 first-slide CSS poster – production canary 2026-11-17

## Status

**Production trial enabled**, MU plugin `deploy/ptscps-sr7-first-poster.php` v1.0.2.

- [A/B visual proof #44004531934](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44004531934): with JavaScript disabled, the native slider module renders a blank white surface baseline; a poster CSS background based on the first `<sr7-slide><sr7-bg><noscript><img src>` changes screenshot pixels to banner colors. Desktop blue pixel sampling: baseline 0% vs poster 75%; mobile baseline 1% vs poster 45%. In the JS-enabled case the SR7 module continues to render and load subsequent slide images, no pageerrors.
- [Final live rollout #44005830722](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44005830722): checksum-verified FTPS deployment, WP Super Cache purge, **6/6 checks passed** desktop/mobile, with and without JavaScript, and off-target pages. **No rollback**.
- [Earlier v1.0.1 live proof #44005201874](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44005201874): 6/6 checks passed. Version 1.0.2 expands cache invalidation to SR7 edits sent through authenticated REST, not only WP-admin/AJAX.

## Implementation

- Intercept rendered Elementor/Jannah markup via `elementor/widget/render_content`, `elementor/frontend/the_content`, `the_content`. Do not modify Jannah/Elementor/SR7 core or builder content.
- Target only public homepage `<sr7-module data-id="1">`. Extract the **actual first** `<sr7-slide>` image URL from its existing native SR7 `<noscript><img src>`, validate same-origin uploads path and image extension.
- Put `background-image:url(...);background-position:center;background-size:cover;` on the *already-sized* slider module itself; no extra layout box and no JS needed to render the poster. Keep all native slides, API calls and transition code.
- If first slide has no image or markup changes, safely skip poster rather than guess an image or hardcode the old `ruby-banner.jpg`. One risk is an SR7 module configured to start at a non-first/random slide; confirm that separately if administrator switches to these advanced modes.
- On SR7 content-change hooks, invalidate WP Super Cache HTML so a newly saved image/order is reflected in subsequent rendered output (v1.0.2 includes authenticated REST writes). Admin editing and preview are not affected.
- Rollback scripts: `scripts/ptscps-sr7-first-poster-rollback.py` and `scripts/ptscps-sr7-first-poster-deploy.py`. Live workflow `.github/workflows/ptscps-sr7-first-poster-live.yml`. It archives previous plugin and restores it automatically if QA fails.

## Speed Index measurements

Before poster: [Lighthouse run #44001754110](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44001754110).
After poster v1.0.1: [Lighthouse run #44005513735](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44005513735).

| Device | Before SI run 1 | Before SI run 2 | Poster SI run 1 | Poster SI run 2 |
|---|---:|---:|---:|---:|
| Desktop | 2233ms | 1503ms | 2515ms | 1604ms |
| Mobile | 6879ms | 14412ms | 6814ms | 5463ms |

Poster improves the **worst** mobile SI observation, but changes are not consistent enough in just 2 independent lab runs to conclude causation. Desktop result is roughly flat/slightly worse. Mobile LCP after poster: 3441/2855ms; FCP 1855/2031ms; CLS 0. TBT after poster 101/166ms vs original 6/1ms – samples highly variable, needs attribution before claiming no impact.

Lighthouse shows first-slide image `ruby-banner.jpg` requested with **High** priority and consumed in SR7 a second time at zero transferred bytes, consistent with browser cache reuse (not a second full network transfer).

**Crucial caveat**: even with the CSS poster, Lighthouse filmstrip has several initially blank frames, especially on mobile. The poster does show before JavaScript in browser-only tests, but **SI is not reliably solved yet**; the SR7 preloader or wider page rendering may cover/delay visible pixels under Lighthouse CPU/network throttling. Do not claim large SI speedup without additional controlled tests.

## Do not change without A/B

Potential next step is a true temporary *foreground* overlay poster that stays above the SR7 preloader, then removes itself once the first slide has actually painted. Requires robust transition and CLS tests. Do not eagerly preload later slides 2/3 or hardcode `ruby-banner.jpg`. Consider effects on TBT, dynamic image order, and mobile variant before deployment.

## Version history

First attempt #44004887017 rolled back correctly because a restrictive Elementor widget-name check meant no poster markup reached output filters. v1.0.1 included final rendered-content filters and passed QA. v1.0.2 retains same HTML/paint but fixes REST cache invalidation; all production tests passed.


## UPDATE: v1.0.3 dynamic first-slide `fetchpriority="high"` preload, production verified

- Installed MU plugin source: `deploy/ptscps-sr7-first-poster.php` **v1.0.3**.
- Production workflow [#44011116890](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44011116890) **success**. FTPS checksum-verified deploy + WPSC cache purge + **6/6** Chrome desktop/mobile tests including JS disabled and unaffected non-home pages. Rollback skipped.
- Native installed SR7 PHP source `RevSliderSlider::get_slides(true)` queries published slides sorted by `slide_order ASC`. `RevSliderSlide::get_bg_layer()` exposes `['bg']['image']['src']`. Thus `wp_head` priority 2 can emit `<link rel="preload" as="image" fetchpriority="high" href="...">` **without a hard-coded image URL, extra REST API request, or buffering the entire HTML response**.
- Same-origin/HTTPS/upload-folder/image extension validated; do nothing if an unsupported background/image or slider model. The existing Elementor-rendered poster extraction remains the visual source of truth.
- Production Chrome QA asserts **exactly one** head preload exists on homepage, with URL equal to the rendered native SR7 first slide `<noscript><img src>` and CSS poster `data-ptscps-poster`; no preload emitted on unrelated pages. Desktop and mobile both pass.
- On updates through SR7 save hooks, HTML cache is purged as before. If an admin configures a random/alternative initial slide, the implementation must be reviewed to ensure the initial displayed slide still matches first in `slide_order`; normal reordering is reflected by SR7's native model. Do not hardcode `ruby-banner.jpg` in future optimization.

**Independent real Lighthouse post-deployment**: [run #44011537452](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44011537452), both matrix jobs success, two cycles per device.

| Device | Run | Performance | FCP | LCP | Speed Index | TBT | CLS |
|---|---:|---:|---:|---:|---:|---:|---:|
| Mobile | 1 | 94 | 1892ms | 2192ms | 4945ms | 2ms | 0 |
| Mobile | 2 | 93 | 1957ms | 2257ms | 5128ms | 0ms | 0.000270 |
| Desktop | 1 | 97 | 482ms | 562ms | 1880ms | 0ms | 0.005290 |
| Desktop | 2 | 96 | 616ms | 696ms | 1871ms | 0ms | 0.005305 |

In *all four* Lighthouse network audits, the initial `ruby-banner.jpg` transfer was **High** priority at ~71.36 KB; when SR7 later requested that same image, the second record was **0 transferred bytes** (browser reuse). Slides 2/3 remained Low priority and were not preloaded. No guaranteed performance improvement can be claimed from two runs versus fluctuating historical baselines, but this validates the dynamic priority mechanism and no apparent CLS/TBT regressions in the measured samples.

## Remaining caveats

- Different mobile/desktop images and random/alternative initial slide modes: require separate explicit verification before asserting they are handled. Current responsive pages use the matching first image; the mechanism does not generate two image candidates or media-specific preload entries.
- Preload and poster update when SR7 content and the WP Super Cache HTML change; exact admin-edit cache invalidation hooks are implemented but not yet exercise-tested by actually editing slides in this release.
- Standard Lighthouse's separate "LCP request discovery" warning status was **not extracted** from these runs. We verified head preload structure, browser request priority and timing, but should not claim that every individual PSI warning has necessarily cleared.
- Keep existing rollback scripts `scripts/ptscps-sr7-first-poster-rollback.py` and prior v1.0.2 backup from the deployment action. The new plugin can be safely disabled without touching Slider Revolution's slide data.
