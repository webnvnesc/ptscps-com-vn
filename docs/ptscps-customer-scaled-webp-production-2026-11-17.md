# PTSCPS customer slider two missing scaled JPEG WebPs - production (2026-11-17)

## Why the two images remained JPEG
Screenshot network trace identified two `-scaled.jpg` URLs still delivered with MIME `image/jpeg`. The previous backfill [#44095072369](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44095072369) had converted 19 distinct logo `currentSrc` URLs, including the smaller `-768x289.jpg` and `-1024x354.jpg` thumbnail variants, but **had not converted the corresponding `-scaled.jpg` originals**. WordPress/Elementor can select different sized variants for requests. The user's screenshot was valid; the earlier 19/19 claim was only true for audited URLs, not every variant.

## Fix and verification
- Deploy [#44097020334](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44097020334) completed successfully; no rollback.
- Converted exactly two existing image variants, no change to image URLs, originals, Elementor, WordPress database or theme:
  - `2024/04/2222221z5245174915163_4145568119040ed86e3b35d70f0b52ca-scaled.jpg`: source **69,738 bytes**, WebP **27,216 bytes** (**61.0%** saving).
  - `2024/04/333333z5245174082713_4252facd17ae73b1c1d1864970e283b0-scaled.jpg`: source **48,710 bytes**, WebP **19,120 bytes** (**60.7%** saving).
- Total originals **118,448 bytes**, WebP **46,336 bytes**; **60.9%** cumulative bytes saved for these exact files, not an aggregate Lighthouse/whole-page metric.
- Browser HTTP QA 4/4 cases: both files × mobile and desktop with WebP Accept returned actual RIFF WebP MIME/bytes; without it the original JPEG magic/MIME/bytes survived. Homepage carousel layout count and horizontal-overflow checks passed on mobile and desktop. Strict checksum rollback was available and skipped.
- Sources: `scripts/ptscps-customer-webp-scaled-backfill.py`, `scripts/ptscps-customer-scaled-webp-live-qa.cjs`, `.github/workflows/ptscps-customer-scaled-webp-live.yml`; artifacts in the successful run hold hashes.

## Audit clarification
- Independent broader network [#44096763405](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44096763405) confirmed there are other JPEGs in the site header/other homepage sections. Those are **outside this narrowly scoped two-file fix**, and should not be described as already WebP.
- In DevTools Network, the `Name` column retains `.jpg` for unchanged WordPress/Elementor URLs. Verify the **Type/Content-Type** field; successful negotiated files should now show `webp`. Previously loaded responses may remain in browser cache; check with DevTools Disable cache and reload.
- For future assets, existing WordPress upload-time conversion handles uploads via native Media Library; historical thumbnail variants can remain unconverted if they existed before auto WebP was enabled. Full site-wide conversion is a separate scoped project with its own inventory.
