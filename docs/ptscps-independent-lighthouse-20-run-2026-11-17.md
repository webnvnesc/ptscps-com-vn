# PTSCPS 20-run independent Lighthouse recheck — 2026-11-17

## Question
User measured 10 Lighthouse/PSI runs per device and was surprised by mobile median score 97, desktop 100, mobile SI 2.08s, desktop SI 0.69s. Requested independent remeasurement to establish whether scores are reliable.

## Sources and methodology
- User-supplied stats (quoted in current chat), 10 successful mobile and 10 desktop runs. User's exact runner/location/Lighthouse version were **not** specified, so do not assume these samples share the same lab infrastructure.
- Independent GitHub Actions workflow [#44070649629](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44070649629), 10 mobile + 10 desktop actual Lighthouse CLI 13.5.0, Chromium, stock Lighthouse throttling/preset, one device per parallel workflow job, sequential runs per job. Every JSON report retained in GitHub Actions artifacts. Used source [scripts/ptscps-lighthouse-repeat-10.cjs](../scripts/ptscps-lighthouse-repeat-10.cjs). No CSS interception or production changes.
- Both jobs SUCCESS, **20/20 runs successful**. Mobile job 133995711310, desktop job 133995711704. The Lighthouse version and landing URL matched consistently within these runs (`13.5.0`, `https://ptscps.com.vn/`).
- Note: extraction of `largest-contentful-paint-element` returned null snippet/URL because Lighthouse 13.5.0 audit structure was not matched by this collector. Do **not** assert specific LCP element from this run. Network audit showed banner request paths `ruby-banner.jpg`, `banner2.jpg`, `banner3.jpg` across all samples; this does not establish the LCP element.

## Median comparison

| Metric | User mobile (10) | Independent GitHub mobile (10) | User desktop (10) | Independent GitHub desktop (10) |
|---|---:|---:|---:|---:|
| Performance | **97** | **92** | **100** | **96** |
| FCP | 1.85s | 2.04s | 0.43s | 0.54s |
| LCP | 2.28s | 2.40s | 0.66s | 0.62s |
| Speed Index | **2.08s** | **5.35s** | **0.69s** | **1.86s** |
| TBT | 20ms | 10ms | 0ms | 0ms |
| CLS | 0 | 0 | 0.005 | 0.0053 |

Independent GitHub ranges:
- Mobile score mean 91.9, median 92, p95 95, min 89, max 95. FCP mean 2.006s, median 2.044s, p95 2.118s, min 1.694s. LCP mean 2.397s, median 2.398s, p95 2.674s, min 2.187s. SI mean 5.438s, median 5.348s, p95 7.017s, min 4.738s, max 7.017s. TBT median 10ms, CLS median 0. Exactly 0/10 mobile score 100.
- Desktop score mean 95.9, median 96, p95 98, min 93, max 98. FCP mean 0.569s, median 0.544s, p95 0.937s, min 0.396s. LCP mean 0.652s, median 0.624s, p95 1.017s, min 0.476s. SI mean 1.958s, median 1.861s, p95 2.372s, min 1.590s, max 2.372s. TBT 0, CLS median 0.00529. Exactly 0/10 desktop score 100.
- User mobile score median 97, mean 96.3, p95 98, min 91 max 98; FCP median 1.85s, LCP median 2.28s (p95 3.31s), SI median 2.08s (p95 2.37s), TBT median 20ms and CLS 0. User desktop score 100 for all ten, FCP median 0.43s, LCP 0.66s, SI 0.69s.

## Assessment

1. Results in both environments independently support **fast or reasonable FCP and LCP, near-zero TBT and CLS**. No evidence of a widespread HTML/CSS/logo dimension regression after the recent production patch.
2. However, **SI is not consistent between lab environments**: measured GitHub mobile median ~3.27s slower, desktop ~1.17s slower than user. Because both FCP and LCP deltas are small, SI divergence is **not explained solely by first content or largest image render timing**. Could involve filmstrip visual completeness of other above-fold content, render animation, network geography/connection, CPU emulation, or exact Lighthouse configurations. Cannot isolate culprit with medians alone. No basis to claim hosting failure or that logo `width/height` caused ~3s SI gain.
3. It is possible for users to get PSI 95–98 mobile and for a remote runner to score 89–95 mobile: **lab reports are environment-dependent**. Each dataset contains ten samples, so a single high user score is not a one-off, but neither establishes universal speed across devices/geographies.
4. Need confirm user measurement tool / network profile / Lighthouse version and ideally compare filmstrips/traces from identical runner. Future comparisons should be A/B on **the same geographic vantage point and Lighthouse version**, before/after, without parallel deployments.
5. The newly fixed Elementor carousel image dimensions are correctness/CLS fixes. Earlier controlled 5-pair logo suppression only improved FCP ~28ms and LCP ~12ms medians, not a plausible explanation for the 3.27s SI discrepancy.

## Operational status
- No production, DNS, hosting or WP files changed by this measurement.
- Save full JSON artifacts and compare in follow-up if user wants deeper SI filmstrip diagnosis.
