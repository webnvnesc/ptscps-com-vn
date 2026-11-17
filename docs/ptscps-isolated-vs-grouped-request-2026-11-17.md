# PTSCPS — independent vs grouped vs real-page resource load (2026-11-17)

## Question
Do individual Jannah CSS / Elementor CSS / jQuery requests already stall, or does simultaneous loading with other assets cause the long delays seen in Lighthouse?

## New controlled diagnostic
Chrome Playwright script `scripts/ptscps-asset-contention-browser.cjs`, workflow [#44025822487](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44025822487), completed SUCCESS. Six cycles with native network, four cycles with mobile-like constrained network (150ms RTT, ~210KiB/s, 4x CPU); 50 isolated/group/real Chrome navigations in total. Each loop alternated modes to limit timing drift. All CSS/JS originated from actual public PTSCPS URLs; synthetic solo and group document was supplied by Playwright interception (not written to hosting). All tests used a clean browser context, disabled cache and HTTP/2 default. No production or DNS configuration edits.

Each cycle:
1. `solo_jannah`, `solo_spacer`, `solo_jquery`: lightweight synthetic HTML requesting **one** known real file only; request header latency measured by CDP.
2. `group`: lightweight HTML requesting up to eight real first-party CSS/JS files together.
3. `real`: unchanged live WordPress homepage, full page including third-party resources and SR7.

The grouped static document deliberately differs in resource priorities, script parser ordering, HTML size and the presence of JS execution from the live page; it isolates a traffic-pattern hypothesis but does NOT fully control for every variable in the real page.

## Native network measurements (header delay, ms)
| Target | Solo median | Eight-file group median | Real-page median | Solo max | Group max | Real max |
|---|---:|---:|---:|---:|---:|---:|
| Jannah CSS | 883 | 1044 | 632 | 963 | 1232 | **6234** |
| Elementor spacer | 668 | 731 | 638 | 1927 | 850 | **8024** |
| jQuery | 905 | 1076 | 639 (5/6 valid) | 1045 | 2165 | **11476; ERR_CONNECTION_RESET** |

Paired differences `group - solo` across 6 cycles: Jannah median +179ms (all six slower by 127–269ms); spacer median -19ms (one standalone 1927ms outlier); jQuery median +171ms (one +1295ms pair). The real-page catastrophic event occurred in native cycle 2, where the same browser session saw Jannah CSS 6234ms, Elementor CSS 8024ms, and jQuery 11476ms ending in a reset; that cycle's `real` result failed its strict completeness gate.

## Constrained network measurements (header delay, ms)
| Target | Solo median | Eight-file group median | Real-page median |
|---|---:|---:|---:|
| Jannah CSS | 866 | 1086 | 491 |
| Elementor spacer | 662 | 663 | 740 |
| jQuery | 1000 | 1394 | 1268 |

Paired group - solo: Jannah +224ms (4/4 slower); Elementor -11.5ms; jQuery +400ms (4/4 slower). No target >2,500ms in constrained condition's 20 cases, though this does not prove constrained mode cannot trigger rare stalls.

## Interpretation and conclusion
- **Direct single-file requests are not universally fast.** Previous 20 fresh curl sessions established that they can experience TTFB delays up to Jannah 2,157ms, tiny Elementor CSS 1,376ms and jQuery 1,314ms. The new 6-cycle standalone browser test had spacer 1,927ms, while Jannah and jQuery remained below ~1.1s; these are different samples and must not be presented as an exact baseline population.
- **Concurrent loading does cause an ordinary ~0.18–0.4s overhead** on Jannah/jQuery in controlled paired tests, but does **not** by itself reproduce the severe 6–11s stalls in a simple 8-file page.
- **A complete real WordPress page can show a correlated failure on multiple CSS/JS over the same navigation.** That correlates with prior Chrome observations of slow resources sharing one HTTP/2 connection and intermittent network resets. Cannot determine solely from these tests whether the root cause is HTTP/2 stream handling, origin network path, proxy behavior, worker saturation, priority scheduling or other site-triggered load interactions.
- File size and disk read alone are unlikely culprits: previous direct PHP disk read of Jannah CSS ~0.3ms, and sub-KB Elementor CSS has also stalled. PHP/WordPress do not need to run to serve these static resources directly, although other concurrent dynamic traffic could impact the server.
- **Do not deploy a blind CSS defer, jQuery defer, global HTTP/2 disable, DNS migration or Cloudflare CDN.** Previous A/Bs rejected CSS defer and H2 disable due to FCP/LCP regressions or broken page.

## Next controlled experiment without host cooperation
A strong next step is a **browser-only resource-type ablation matrix** that loads the same real home HTML and removes one category of *noncritical* companion requests at a time. Keep Jannah CSS, jQuery, SR7, hero, fonts and DOM in the baseline first, and try excluding only nonessential offscreen images or background assets while checking functionality/CLS. If the severe stall persists with reduced companion traffic, simple simultaneous asset count is unlikely to be the root cause; if it stops in enough repeated cycles under matched conditions, identify the specific traffic group and trial staged adjustments. Do not treat one outlier's absence as proof of a causal improvement.

Workflow artifacts contain all raw per-case timing, protocol, connection IDs, response status, file completeness and aggregate tables. Chrome CDP header delay includes network and scheduling latency; `serverWaitMs` is a request/response stage estimate, not instrumented origin CPU processing.
