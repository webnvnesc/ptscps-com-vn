# PTSCPS — automatic WebP for WordPress uploads and SR7 (2026-11-17)

## User goal and scope

After proving three fixed Slider Revolution WebP banners improved image transfer size, user asked whether changing/adding banner images would automatically benefit. Previous setup only matched `ruby-banner.jpg`, `banner2.jpg`, and `banner3.jpg`, so future images would miss WebP; replacing the same file could leave a stale sidecar. User explicitly authorized upgrading to automatic behavior.

Implemented production WebP generation and same-URL delivery for JPG/PNG uploaded through WordPress, with SR7 save hooks that regenerate backgrounds selected from pre-existing Media Library assets. No WordPress Media Library URL changes, no SR7/Elementor stored content edits, no changes to Jannah/SR7 core JS/CSS, no root WordPress `.htaccess` changes, no image source deletion.

## Deployment architecture

1. WordPress MU plugin: `deploy/ptscps-webp-autogen.php` v1.0.0, installed at `wp-content/mu-plugins/ptscps-webp-autogen.php`.
   - Hooks `wp_handle_upload` (native WordPress Media Library upload), `wp_generate_attachment_metadata` (original and intermediate sizes) and `wp_update_attachment_metadata` (replaced/regenerated attachment).
   - Hooks slider save actions `revslider_save_slider_v7`, `save_slide_v7`, `revslider_slide_updateSlideFromData_post`, `revslider_slide_updateSlide`, `revslider_slider_update_slider`. Runs an SR7 background scan at shutdown after a save, not per visitor request. Reads actual slide background URLs using `RevSliderSlider::get_slides(true)`, up to 20 slides.
   - Only handles same-host files under the real `wp_upload_dir()['basedir']`; rejects traversal and unsupported formats. Source JPG/PNG must be <= 10MiB and <= 12MP; missing/unsupported files fail open to original. Uses WordPress image editor WebP quality82 with GD fallback; verifies WebP mime, dimensions and meaningful transfer saving (<96% source bytes) before replacing/creating `image.jpg.webp` or `image.png.webp` sidecar via atomic rename.
   - Always regenerates on native upload or slider-save event, even for a same-second same-name overwrite. Source JPEG/PNG is never modified.
   - **Not a background migration of all historical WordPress uploads**: existing images are converted when edited/used on an SR7 save or when media metadata is regenerated.
   - Caveat: direct FTP/image filesystem overwrites bypass WordPress hooks. An unchanged URL already cached by browsers/CDNs can still show prior cached bytes until expiration/invalidation, even though server source and sidecar are renewed.

2. Upload-specific rewrite in `wp-content/uploads/.htaccess`, owned rules `PTSCPS_WEBP_UPLOADS_AUTOMATIC_v1`.
   - Prior preflight [#44079583574](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44079583574) found this file existed but was empty, and found the exact older owned 3-banner rule in `wp-content/uploads/2019/10/.htaccess`.
   - Replaced only that empty uploads root file with a generic conditional mod_rewrite for existing JPG/JPEG/PNG URLs, if `Accept: image/webp` and a matching `.webp` sidecar exists; also returns `Vary: Accept` and correct `image/webp` mime. Browser without WebP always receives original file.
   - Removed **only** the exact known owned 2019/10 banner-specific `.htaccess`, so the parent upload rewrite also works within that month. The three previously generated WebP sidecars are retained and still used. Never touched the WordPress root `.htaccess`.
   - Directory-specific custom future `.htaccess` files might override inheritance; requires scoped testing if additional upload subdirectories add rules.

3. Installer/rollback: `scripts/ptscps-webp-autogen-deploy.py`, modes `prepare`, `enable`, `cleanup`, `rollback`.
   - Verifies actual WP root, specific preflight file contents and all owned FTPS paths. Safe rollback restores empty uploads root config, prior exact 3-banner rewrite, disables owned MU plugin, removes only synthetic test JPG/PNG and WebP sidecars, **leaving original banner images untouched**.
   - Manual rollback: `.github/workflows/ptscps-webp-autogen-rollback.yml`.
   - Older fixed-3-banner workflow retired as read-only notice; legacy rollback workflow redirected to safe dynamic-to-3-banner rollback.

## Live deployment and QA

**Successful production run #44080013464**, GitHub Actions workflow `.github/workflows/ptscps-webp-autogen-deploy.yml`, job 134027829310, all steps succeeded, automatic rollback step skipped.

- PHP syntax check passed and uploaded MU plugin source verified over encrypted FTPS.
- Created two **synthetic** 24×18 images and their WebP sidecars under `uploads/2025/11` purely to test the generic HTTP rewrite (one JPG and one PNG). Browser requesting the unchanged JPG/PNG URLs:
  - `Accept: image/webp` returned real valid WebP with 200 and `Content-Type: image/webp` and `Vary: Accept`.
  - Without WebP Accept returned unchanged JPEG/PNG 200 and proper native MIME.
  - The synthetic PNG was very tiny and its sidecar larger than original, intentionally only used to verify routing. In normal WP conversion the 4% savings gate prevents such a sidecar.
- Three existing Slider Revolution banners still returned WebP to capable browsers and native JPG fallback to others, with correct MIME, dimensions and `Vary: Accept`.
- Synthetic files (all four) were securely removed by workflow cleanup; no sample assets left.
- Real Chrome mobile 412×850: first `ruby-banner.jpg` URL returned WebP; dynamic CSS poster and matching native preload present; 4 SR7 slide nodes, 3 Canvas backgrounds; no JS errors, **CLS 0**, partner carousel image dimensions 21/21, no horizontal overflow.
- Real Chrome desktop 1440×900: same WebP+preload; no JS errors; **CLS ~0.00047**, customer image dimensions 29/29, no horizontal overflow.
- Existing dynamic preloading and CSS poster remain unchanged, preserving admin ability to reselect first slide.
- **Testing limitation:** These production tests confirm routing, plugin file installation/PHP syntax and real page behavior. They do **not** simulate a logged-in human Media Library upload or authenticated SR7 save end-to-end, since those actions require an authorized authenticated WordPress admin session not available in this run. The auto-generation hooks were implemented and installed, but that specific real mutation path remains to be verified during the next admin image change. Do not misrepresent route smoke files pre-generated off-server as proof that PHP converted on hosting.

## Change safety, rollback and maintenance

If upload-based conversion is problematic, use [dynamic WebP rollback](../.github/workflows/ptscps-webp-autogen-rollback.yml); it returns to prior three-banner policy (not necessarily all-JPEG), with only user-owned configuration modified. Do not trigger older `ptscps-webp-banner-pilot.py rollback` directly on global dynamic configuration. The old fixed-three-banner deploy workflow has been retired to a no-op message.

If the user updates `ruby-banner.jpg` by directly overwriting the filesystem outside WordPress, the old sidecar does not automatically update; use WP upload/attachment update or manually refresh WebP. Cache invalidation may still be needed after replacing the contents of an image while preserving its URL.

**No Lighthouse performance claim for this migration**: it changes the routing policy (and future conversion behavior), not the three existing optimized banner contents. Current previously measured WebP baseline: GitHub Runner Lighthouse mobile median performance 93, FCP ~1.90s, LCP ~2.35s, SI ~4.85s, CLS 0; desktop performance 97, SI ~1.84s. User's different PSI runner may produce substantially different lab SI.
