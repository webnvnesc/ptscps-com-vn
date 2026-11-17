# PTSCPS — three-banner WebP production pilot and postdeploy Lighthouse (2026-11-17)

## Scope and safety constraints

User requested a live WebP trial, preserving WordPress Elementor, SR7 slider configuration, first-slide CSS poster preload, original JPEG files, URLs, desktop CLS, and the ability to roll back.

Implementation covers **only three exact filenames in** `wp-content/uploads/2019/10/`: `ruby-banner.jpg`, `banner2.jpg`, `banner3.jpg`. No mass media conversion, database writes, WordPress image URL replacements, Elementor/SR7 edits, plugin/theme edits, DNS edits, or root .htaccess change.

Image conversion is done off-server on a GitHub Actions runner via Pillow WebP quality 85/method 6. Generated files are named `ruby-banner.jpg.webp`, etc. in the same folder, preserving source JPEG files. Since this uploads directory originally had **no .htaccess**, deployment adds a small, fully-owned `.htaccess` scoped to *only* those 3 JPEG filenames. Apache mod_rewrite switches those original JPG URLs to WebP only when HTTP `Accept` includes `image/webp` and a matching sidecar WebP exists. `Vary: Accept` is applied so shared caches do not mix JPEG/WebP variants; `AddType image/webp .webp` sets proper MIME. Browsers not supporting WebP continue to receive untouched JPEG. Browser HTML, `data-ptscps-poster`, `<link rel=preload>`, SR7 canvas and Elementor admin data continue to refer to the same original URLs, so no duplicate asset URLs are introduced.

## Read-only conversion sizing

[Read-only run #44073674227](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44073674227):

| Banner | JPEG source | WebP q85 | Bytes saved | Saving |
|---|---:|---:|---:|---:|
| ruby-banner.jpg | 71,241 | 47,272 | 23,969 | 33.64% |
| banner2.jpg | 95,314 | 67,716 | 27,598 | 28.95% |
| banner3.jpg | 99,097 | 67,324 | 31,773 | 32.06% |
| **Total** | **265,652** | **182,312** | **83,340** | **31.37%** |

All source JPEGs are 800×500. Each converted image had low mean absolute channel error (~2.0–2.7/255), preserving near-original image appearance; this is not a perceptual quality guarantee.

## Deployment workflow and rollback

Production deployment [run #44074380778](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44074380778) SUCCESS, exact files verified via encrypted FTPS after atomic rename, followed by HTTP negotiation and real Chromium mobile/desktop QA. The first attempt [#44073957256](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44073957256) had a **test-harness-only** error (`URL is not a constructor` due to variable shadowing), after HTTP negotiation already passed, so it correctly auto-rolled back the owned rule + all three generated WebP files; test corrected and production deployment second attempt succeeded.

HTTP QA at all three unchanged JPG URLs:
- `Accept: image/webp` → HTTP 200, `Content-Type: image/webp`, WebP magic and 800×500 dimensions, `Vary: Accept,Accept-Encoding,User-Agent`.
- `Accept: image/jpeg` (no WebP support) → HTTP 200, `Content-Type: image/jpeg`, native JPEG magic and 800×500, `Vary: Accept`.
- Direct `.jpg.webp` files → WebP 200 and byte-for-byte equal to the negotiated WebP variants.
- Real homepage HTML → HTTP 200; native first-banner poster and preload references remain the original `ruby-banner.jpg` URL.

Chromium live QA:
- Mobile 412×850: SR7 first URL `ruby-banner.jpg` **returns image/webp**; poster preload matches first banner; 4 SR7 slide elements, 3 Canvas BG layers; zero page errors, zero CLS, carousel dimensions 21/21, no horizontal overflow.
- Desktop 1440×900: same WebP, poster preload, 4 slides/3 Canvas, zero page errors, CLS ~0.00049, carousel 29/29 images with dimensions, no overflow.

Files:
- Conversion/deploy/rollback: `scripts/ptscps-webp-banner-pilot.py`
- HTTP negotiation QA: `scripts/ptscps-webp-banner-http-qa.py`
- Browser QA: `scripts/ptscps-webp-banner-live-qa.cjs`
- Deploy workflow: `.github/workflows/ptscps-webp-banner-pilot.yml`
- Manual rollback workflow: `.github/workflows/ptscps-webp-banner-rollback.yml`

**Rollback** is safe: manual workflow disables only this owned `.htaccess` (if content exactly matches own marker/rules), then deletes only three owned WebP files whose bytes match freshly encoded counterparts of native JPEG. Leaves JPEGs and all unrelated files intact. No site HTML cache purge needed because URLs are unchanged and HTTP `Vary: Accept` is in place.

## Postdeploy real Lighthouse 13.5.0 verification

[Run #44074880739](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44074880739), same remote GitHub runner environment and pinned Lighthouse version as independent pre-WebP [run #44070649629](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44070649629). **Before** has 10 valid runs per device; **after** has 5 valid per device. These are *not* paired randomized A/B so deltas are indicative only, not causal evidence.

| Metric (median) | Mobile before (10 runs) | Mobile WebP (5 runs) | Desktop before (10 runs) | Desktop WebP (5 runs) |
|---|---:|---:|---:|---:|
| Performance score | 92 | **93** | 96 | **97** |
| FCP | 2.04s | **1.90s** | 0.54s | **0.53s** |
| LCP | 2.40s | **2.35s** | 0.62s | **0.58s** |
| Speed Index | 5.35s | **4.85s** | 1.86s | **1.84s** |
| TBT | 10ms | **3ms** | 0ms | 0ms |
| CLS | 0 | 0 | ~0.0053 | ~0.0053 |

Mobile after range: score 90–95, FCP 1.846–2.309s, LCP 2.109–2.571s, SI 4.532–5.583s, TBT 0–12.5ms, CLS median 0. Desktop after score 96–97, FCP 0.419–0.597s, LCP 0.459–0.659s, SI 1.722–2.049s, TBT 0, CLS median ~0.00529.

**Interpretation:** WebP saves 31.37% transfer bytes across these three banners. Lighthouse metrics after deployment are *directionally better* in same runner class, but different sample counts and changing remote network/CPU/server conditions mean these deltas should **not** be attributed solely to WebP or generalized across all users. The largest source of mobile SI variation still exists; prior user runs from a different environment reported much better SI (median ~2.08s) than GitHub's ~5s, which remains a separate unresolved environment/rendering difference.

## Decision

Leave the **three-banner WebP experiment enabled** while the user independently measures PSI and confirms no visual quality issue. Do not bulk convert or rewrite WordPress attachment URLs. No further optimizations bundled with this change so the impact can be evaluated.
