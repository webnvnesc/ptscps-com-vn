# PTSCPS Header Navigation — Accessibility and SEO 100/100 (17 November 2026)

## Scope

Audited the **14 public destinations actually referenced by desktop/mobile header navigation** (including dropdown routes). No logged-in WordPress admin toolbar was used. Changes are scoped to these routes and do not edit Elementor's persisted content, Jannah parent theme, Slider Revolution, image optimization, or the mobile cache partitioning.

## Source of truth

- Menu discovery: [GitHub Actions #43925902315](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43925902315).
- Initial 14-route axe/SEO audit: [#43925965561](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43925965561).
- Initial real Lighthouse on 28 variants: [#43926085959](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43926085959).
- Final production deployment, cache purge, 28/28 axe and SEO checks: [#43927949342](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43927949342).
- **Independent Lighthouse v13.5.0 final 28/28 pages/device variants: [#43928434336](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43928434336)**. All 8 matrix jobs succeeded and all 28 results recorded Accessibility **100**, SEO **100**.

## Per-page verified Lighthouse result

| Page | Desktop Accessibility | Desktop SEO | Mobile Accessibility | Mobile SEO |
| --- | ---: | ---: | ---: | ---: |
| /thu-ngo.htm | 100 | 100 | 100 | 100 |
| /dich-vu | 100 | 100 | 100 | 100 |
| /hseq | 100 | 100 | 100 | 100 |
| /c/co-dong | 100 | 100 | 100 | 100 |
| /c/co-dong/quan-he-co-dong | 100 | 100 | 100 | 100 |
| /c/co-dong/bao-cao-tai-chinh | 100 | 100 | 100 | 100 |
| /tin-tuc | 100 | 100 | 100 | 100 |
| /c/tin-tuc/hoat-dong-cua-cong-ty | 100 | 100 | 100 | 100 |
| /c/tin-tuc/dau-khi-trong-nuoc-va-khu-vuc | 100 | 100 | 100 | 100 |
| /thu-vien-pps | 100 | 100 | 100 | 100 |
| /thu-moi-chao-gia | 100 | 100 | 100 | 100 |
| /tuyen-dung | 100 | 100 | 100 | 100 |
| /lien-he | 100 | 100 | 100 | 100 |
| /e | 100 | 100 | 100 | 100 |

## Fixes deployed

MU plugin: [deploy/ptscps-header-pages-a11y-seo.php](../deploy/ptscps-header-pages-a11y-seo.php) (v1.0.2).

1. Unique route-specific meta descriptions for 10 tested routes lacking description; keep existing metadata unchanged elsewhere.
2. Semantic names for Elementor gallery lightbox/photo links and post thumbnail links, using actual adjacent titles.
3. Correct missing main landmark on affected builder pages, provide visually-hidden H1 only where none existed, and normalize inconsistent H3/H4 archive card titles to H2 after page H1.
4. Improve contrast for invitation/recruitment excerpts and two English service tiles, without changing element geometry.
5. Fix incorrectly formatted Contact phone link from `http://+84.254.3511.019` to `tel:+842543511019`; accessible names for carousel controls.
6. Preserve existing service/contact/home fixes, Jannah logo safeguards, responsive srcset, SR7 loading, and WordPress Mobile Device Support cache separation.

Production deployment and checksum/rollback tooling:
- [Deploy workflow](../.github/workflows/ptscps-header-a11y-seo-live.yml)
- [Deploy script](../scripts/ptscps-header-pages-a11y-seo-deploy.py)
- [Rollback script](../scripts/ptscps-header-pages-a11y-seo-rollback.py)
- [Full postdeploy axe and SEO assertions](../scripts/ptscps-header-a11y-seo-postdeploy.cjs)
- [Lighthouse 8-shard matrix](../.github/workflows/ptscps-header-lighthouse-batch.yml)

Two earlier validation attempts automatically rolled back when an invitation post-card heading was inconsistent. Third deployment fully passed; production has the final version and did not roll back. Do not mistake prior failure runs for the current active state.

## Important independent content issue

The archive URLs `/c/co-dong`, `/c/co-dong/quan-he-co-dong`, and `/c/co-dong/bao-cao-tai-chinh` returned HTTP 200 while rendering H1 **“Không tìm thấy”** in anonymous browser checks. These pages can still receive Lighthouse 100/100 (as confirmed), but the missing archive content is a **separate substantive SEO/content issue**. Do not treat score 100 as evidence these archives are populated. Investigate category configuration/post assignments and restore authoritative content only with verified source data. No content has been invented or changed in this task.

## Caveats

Lighthouse scores are reproducible sampled outcomes under this specific anonymous Chromium/Lighthouse run, not a guarantee that every future run or logged-in run will be exactly 100. Lighthouse performance, CLS, TBT and PSI field data were not tested as part of this Accessibility/SEO remediation.
