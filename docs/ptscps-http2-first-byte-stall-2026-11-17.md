# PTSCPS — Render-blocking CSS/jQuery & HTTP/2 investigation (2026-11-17)

## Scope, checkpoint and safety
Continued from `12ca8a6`, after browser-only critical CSS deferral was rejected because desktop FCP/LCP regressed and one mobile browser run had missing CSS, `jQuery is not defined` and broken SR7 dimensions. **This investigation made zero production or server configuration changes.** Existing Jannah CSS, Elementor, jQuery dependencies, SR7 poster/preload v1.0.3, WordPress admin/editor and site data are retained.

## Per-asset real HTTP/1.1 vs HTTP/2 on current production
Run [#44018900550](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44018900550): SUCCESS, ten alternated curl pairs per resource (80 successful requests), same server IP `103.45.230.204`; `scripts/ptscps-transport-protocol-pairs.py`. Raw response headers and timings in workflow artifacts. GitHub runner geography, fresh connections, NOT end-user Vietnam field measurements.

| Resource | H1 TTFB median | H2 TTFB median | H1 post-handshake wait | H2 post-handshake wait | Median paired H2 - H1 wait |
|---|---:|---:|---:|---:|---:|
| Homepage HTML | 692ms | 917ms | 226ms | 430ms | +209ms (10/10 H2 slower by >50ms) |
| Jannah style.min.css | 680ms | 889ms | 224ms | 440ms | +209ms (9/10 H2 slower by >50ms) |
| jQuery | 929ms | 915ms | 227ms | 438ms | +200ms (7/10 H2 slower by >50ms) |
| Tiny Elementor spacer CSS | 663ms | 677ms | 212ms | 219ms | +8ms |

Both HTTP protocols had severe outliers (H2 HTML p90 7.62s, H1 jQuery p90 5.73s). All resources were HTTP 200. Apache/2, gzip, and ETag observed. Static resources lacked Cache-Control in sampled responses. These independent single-resource probes cannot predict full page loading; H2 multiplexes requests.

## Full Chrome browser A/B
Run [#44019233989](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44019233989); `scripts/ptscps-browser-protocol-ab.cjs`; desktop PASS, mobile strict FAIL due to a real request reset in an H2 browser cycle. Four alternating pairs/device with browser cache disabled. Chrome default HTTP/2 vs Chrome `--disable-http2`, verifying actual document protocol. Mobile: 150ms RTT, 210KiB/s download, 4x CPU. No origin changes.

| Device | Valid pairs | Median H1 minus H2 TTFB | Median H1 minus H2 FCP | Median H1 minus H2 LCP |
|---|---:|---:|---:|---:|
| Desktop | 4/4 | -226ms | +302ms | +348ms |
| Mobile | 3/4 | -300ms | +176ms | +612ms |

Positive H1-minus-H2 FCP/LCP means HTTP/1.1 is **slower**. On desktop, 3/4 pairs had slower FCP with H1; one reversed. On mobile H1 had worse LCP in 2/3 accepted pairs but better in a slow H2 outlier. Mobile H2 cycle 1 had three font network resets and was excluded by strict validity gate. Outlier H2 cycle 3: Jannah style request-to-response ~5606ms, Elementor spacer ~8085ms, jQuery ~11423ms, all on connection 1818, with HTML TTFB ~1033ms and FCP/LCP ~12612ms, CLS ~0.05366; no JS page error recorded. In that same pair H1 FCP/LCP ~3612ms, CLS 0, but other cycles favored H2. This is consistent with intermittent shared-connection/transport/origin stalls, **not** proof of Apache `mod_http2` being the root cause. The browser A/B's longtaskBlocking is only a proxy, not Lighthouse TBT, and no Lighthouse SI comparison is included.

## Decision: preserve HTTP/2 and main CSS
**Reject site-wide disabling HTTP/2**: a single browser's H1 TTFB improvement does not translate to faster or reliably safer FCP/LCP, particularly on desktop. Avoid protocol switches in `.htaccess`, Jannah CSS defer, global jquery defer, merging CSS, new caches, SR7 settings changes. Keep existing production stable.

## What is still unresolved
Root cause of intermittent first-byte delays and `ERR_CONNECTION_RESET` **cannot yet be assigned** uniquely to Apache/mod_http2 thread capacity, upstream/reverse proxy, network paths, TLS, hosting resource exhaustion or traffic shaping. Browser CDP shows that slow requests often share a connection; this is correlation, not root-cause attribution. Cannot claim the PageSpeed projected 1.64s blocking-resource opportunity has been fully fixed.

Production-safe next owner action: ask hosting operations to correlate precise UTC windows (example around 2026-11-17 04:45–04:47 UTC for workflow #44019233989) with Apache access/error logs, request duration, worker status, CPU/IO and HTTP/2 stream resets. Preserve privacy: share aggregate service health and request timings rather than raw visitor request logs. Check `mod_http2`, `H2MaxWorkers`, `MaxRequestWorkers`, TLS/proxy and HTTP/2 connection stability. Any server setting change must be isolated in staging/controlled canary, with backup/rollback and Chrome Lighthouse FCP/LCP/SI/CLS/TBT on mobile + desktop, interaction QA for Jannah/Elementor/SR7.

## Stable resources
- Read-only protocol script: [scripts/ptscps-transport-protocol-pairs.py](../scripts/ptscps-transport-protocol-pairs.py)
- Browser A/B script: [scripts/ptscps-browser-protocol-ab.cjs](../scripts/ptscps-browser-protocol-ab.cjs)
- Workflow: [.github/workflows/ptscps-browser-protocol-ab.yml](../.github/workflows/ptscps-browser-protocol-ab.yml)
- Prior critical CSS decision: [ptscps-critical-css-gate-2026-11-17.md](ptscps-critical-css-gate-2026-11-17.md)
