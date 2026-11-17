# PTSCPS: Critical Jannah CSS paired A/B decision - 2026-11-17

## Why this test was necessary
Google PageSpeed Insights lists Jannah `style.min.css` ~23 KiB (gzip transfer) with an estimated render-blocking duration of 1,200ms, and projected saving ~1,640ms across the blocking set. That estimate is **not a measured 1,640ms real-user gain**. Prior research already showed that CSS defer/removal can worsen CLS or break Jannah/Elementor, while main stylesheet preload did not consistently improve FCP.

## Code and workflow
- Test script: [scripts/ptscps-critical-css-gate.cjs](../scripts/ptscps-critical-css-gate.cjs).
- Workflow: [.github/workflows/ptscps-critical-css-gate.yml](../.github/workflows/ptscps-critical-css-gate.yml).
- [GitHub Actions #44017071157](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44017071157) ran Chrome desktop 1440 and mobile 412 (RTT 150ms, ~210KiB/s throughput, 4x CPU) with five alternating cold-browser A/B pairs per device. Intercepts only the test browser HTML response: inline Chrome Coverage union of *homepage* Jannah main CSS used at 412 and 1440, then make original style link non-render-blocking with `media=print` and `onload` restore. Site production, builder files, WP settings, CSS files, and HTML cache **were not changed**.
- First-view CSS extracted: 6,598 bytes from 134,534-byte original, 59 of 1,380 rules kept by Chrome Coverage. This proves only used selectors on the sample viewports; does **not** prove visual completeness in all states.
- Both A/B variants used `route.fetch()` for equalized HTML interception. Each record measured FCP, TTFB, LCP, layout shifts, JS errors, CSS network, and first-view component geometry. The long-task blocking proxy is not standardized Lighthouse TBT. No standalone Lighthouse SI delta or editor/admin QA was established.

## Results
| Device | Valid pairs | Median delta FCP | Median delta (FCP - TTFB) | Median delta LCP | Median delta CLS | Decision |
|---|---:|---:|---:|---:|---:|---|
| Desktop | 5/5 | +84ms (worse) | -223ms | +84ms (worse) | ~0 | REJECT |
| Mobile | 4/5 | -284ms | -200.5ms | -280ms | 0 | REJECT / incomplete |

Positive delta means worse. Desktop passes browser test infrastructure, but candidate does not yield a repeatable real-world FCP/LCP improvement: 3/5 of the desktop pairs had **higher absolute FCP**, and the median absolute FCP/LCP was worse. Smallest rendered geometry differences were 0 in the sampled snapshots; not proof of no brief flashes.

Mobile cycle 1 candidate **failed**: the full Jannah stylesheet was missing from Resource Timing after the test and 5 `jQuery is not defined` page errors occurred; LCP reached 21.56s, slider height was 1,264px rather than the normal 212px, and CLS was ~0.0438. A control run in the same cycle also had high CLS ~0.0537, indicative of intermittent network/dependency instability as documented previously. The candidate nevertheless cannot be approved while such failure exists. Excluded failed pair from numerical medians, but retain it in the decision and raw artifacts.

## Safety decision
**Do not deploy critical CSS async switch to production.** The test does not pass the pre-defined acceptance gate. Keep main Jannah CSS as render-blocking for now; keep working first-slide SR7 poster/preload and the currently stable child-theme CSS, Elementor and jQuery dependency order.

Treat the PageSpeed estimated saving as an opportunity requiring demonstrated benefit, not a guaranteed reduction. The next useful root-cause action is to correlate intermittent static CSS/jQuery failures with response timing, HTTP/2/proxy/network events and server logs. Target any proven delay with minimally scoped changes and rerun both mobile and desktop A/B plus full Lighthouse SI/CLS/TBT and builder QA before modifying production.

## Current checkpoint
- GitHub A/B workflow: desktop success, mobile failure (failed strict safety gate), not a production deployment.
- No FTPS deployment or cache purge was attempted.
- Preserve the A/B script and artifacts to reproduce, not to reuse as a live MU plugin.
