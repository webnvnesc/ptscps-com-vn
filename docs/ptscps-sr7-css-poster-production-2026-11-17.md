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
