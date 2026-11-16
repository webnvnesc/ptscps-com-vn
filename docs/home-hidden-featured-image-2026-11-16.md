# PTSCPS: remove invisible WordPress homepage featured figure at source
Date: 2026-11-16

## Root cause

On anonymous homepage, the Jannah theme rendered a `<div class="featured-area"><figure class="single-featured-image"><img src="/wp-content/uploads/2025/09/Untitled-1.jpg"></figure></div>` despite CSS hiding the figure. Browser still downloaded its 33,402-byte image on both mobile and desktop. This is separate from `<meta property="og:image">`, which should be preserved for sharing.

Precise source: production parent Jannah `wp-content/themes/jannah/templates/page-head.php`, line 45:

```php
if ( has_post_thumbnail() && ! tie_get_postdata( 'tie_hide_page_featured' ) ) {
    // lines 51–70 generate featured-area + single-featured-image and the_post_thumbnail()
}
```

Jannah has a **native per-page** setting `tie_hide_page_featured` in the page editor (Page ID 5) under Jannah Page Options. In the editor it is a visually hidden checkbox implemented as a styled switch. It was unchecked before this change.

## Production implementation

- Set only **Page ID 5** checkbox `tie_hide_page_featured` to **checked** via the authenticated WordPress classic editor and saved the page through its native Update action.
- No child-theme override, parent-theme edit, Elementor content mutation, post-thumbnail deletion, media file change, OG metadata edit or new production MU plugin. Setting is persistent in the normal WordPress/Jannah page builder options and editable in the admin later.
- Exact workflow and admin action: [GitHub Actions run #43880610451](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43880610451); source [scripts/ptscps-toggle-home-featured.cjs](../scripts/ptscps-toggle-home-featured.cjs); targeted homepage cache purge [ptscps-purge-home-featured.py](../scripts/ptscps-purge-home-featured.py).
- Note: initial test [#43880378579](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43880378579) did not save because browser `locator.check` cannot interact with the visually hidden native checkbox; no production setting changed in that run. Second test used the checkbox state and dispatched form events and **succeeded**.

## Post-save verification

- WordPress editor reopened: `tie_hide_page_featured = checked` persisted.
- Four anonymous Playwright checks: **mobile 412px and desktop 1440px**, each **canonical homepage and cache-bypass URL**, all returned HTTP 200.
- All four verified:
  - `figure.single-featured-image` count = 0.
  - `img` referencing `Untitled-1.jpg` count = 0.
  - Browser network requests for `Untitled-1.jpg` = 0.
  - `og:image` still points to `/wp-content/uploads/2025/09/Untitled-1.jpg`.
  - Elementor homepage widgets, header logo, homepage SR7 slider and H1 still present.
- Reported home WP Super Cache HTML invalidation found 0 matching stale entries, but both canonical and cache-bypass pages returned correct updated HTML.
- Do not claim a particular FCP/LCP improvement without a separate paired Lighthouse baseline; immediate verified savings is one unnecessary ~33 KB image request.

## Reversal / future editing

To show the homepage featured image again, use the native WordPress admin: Pages → homepage (ID 5) → Jannah Page Options → uncheck **Hide Featured Image** → Update. This preserves featured-image media and social metadata. Avoid deleting the media ID 5543 and avoid a separate CSS display:none patch.
