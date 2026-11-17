# PTSCPS — Elementor customer logo image dimensions and traffic-impact A/B (2026-11-17)

## User request
Lighthouse reported a long list of homepage customer/partner `<img class="swiper-slide-image">` missing native HTML `width` and `height`. User requested trying fixes and checking whether these images affect mobile Speed Index (SI), not just CLS.

## Initial read-only inspection
[Workflow #44065240471](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44065240471) verified the widget's actual ID `ed1c7da`, section `1be3f74`, Elementor `image-carousel.default`. Before correction, 21 customer logo images in mobile DOM / 19 at initial desktop (more Swiper loop clones later), all missing `width`/`height`. Images have heterogeneous aspect ratios, e.g. Idemitsu 847×206, Murphy 403×224, VOFT 402×224, premier-oil 302×176, thang-long 388×216. Do not assign a single hardcoded aspect ratio.

## Browser-only controlled image-traffic A/B
[Workflow #44065454373](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44065454373), [script](../scripts/ptscps-logo-network-ab.cjs).

- Mobile Chromium 412×850, network 150ms RTT/210KiB/s, CPU 4x, cache disabled. The exact same homepage HTML was served to both variants in each pair.
- Control loaded all real partner image URLs normally. In the blocked group, Playwright fulfilled only the 19 unique partner image URLs with a 1px data GIF rather than downloading their actual bytes. The DOM and other image/JS requests remained present; this tests transfer contention, **not production lazy-loading changes**.
- 5/5 paired samples were valid, no browser-page errors.
- Median *logo-blocked minus control* **FCP -28ms**, **LCP -12ms**, **CLS 0**, main-thread longtask proxy +14ms. Individual FCP changes +44, -4, -184, -116, -28ms; LCP changes -144, -4, -192, -12, +380ms. Data are noisy and these small medians do **not** justify a production image suppression mechanism.
- This A/B did not measure standardized Lighthouse SI. Given the offscreen logo location and negligible first-paint impact, it is unlikely that missing dimensions alone explain mobile SI ~5 seconds.

## Native intrinsic dimension implementation

Source: `deploy/ptscps-customer-image-dimensions.php` v1.0.1, installed as the single *owned* MU plugin `/wp-content/mu-plugins/ptscps-customer-image-dimensions.php`.

- Only applies to the WordPress homepage, not WP admin, Elementor preview or Customizer.
- Only processes the existing rendered Elementor carousel markup containing `elementor-element-ed1c7da`; only `<img>` tags with class `swiper-slide-image` and missing attributes are changed.
- Securely resolves the image's same-host WordPress `wp_upload_dir()` URL to a path under the real local uploads directory, checks `realpath` containment, then uses PHP `getimagesize()` to add **the correct per-image** integer `width` and `height`. Does not modify image URLs/srcset/sizes/lazy loading or Elementor stored widget data/CSS/JS.
- Due to the installed Elementor rendering pipeline, the initial v1.0.0 `elementor/widget/render_content` filter did not apply to public HTML. [Workflow #44065598280](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44065598280) correctly failed QA and automatically rolled the owned file back. v1.0.1 changed to `elementor/frontend/the_content` and `the_content` late filters, then succeeded.

## Production acceptance

[Workflow #44065993510](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44065993510), SUCCESS. PHP syntax valid, FTPS source checksum verified, homepage HTML cache selectively purged (1 file). No changes to original theme source, Elementor data or SR7.

- Mobile viewport 412×850: **21/21** images with valid width/height on public page, correct aspect ratios, carousel height 288px before and after scrolling, 21 images loaded, **CLS ~0.002145**, no JS errors.
- Desktop viewport 1440×900: **29/29** images (including Swiper loop clones) with valid dimensions, carousel height 214px before and after scrolling, all images loaded, **CLS ~0.000742**, no JS errors.
- Non-home /lien-he: HTTP 200.
- Existing SR7 first poster, slider and Elementor remain intact.
- These measured CLS values are browser audit values, not Lighthouse field data or a guarantee of SI improvement.

## Rollback

Manual [ptscps-customer-dims-rollback.yml](../.github/workflows/ptscps-customer-dims-rollback.yml) uses the scoped FTPS rollback in `scripts/ptscps-customer-dims-deploy.py --rollback` to rename **only** the owned MU plugin to `.disabled` then purge only homepage WPSC HTML cache. Rollback is possible without touching unrelated plugin files.

## Recommendation

Keep native width/height fix to satisfy Lighthouse's missing dimensions audit and protect CLS, subject to user's PSI verification. Do not claim SI gain or remove partner images: controlled mobile A/B shows only marginal FCP/LCP effect and no actual Lighthouse SI test.
