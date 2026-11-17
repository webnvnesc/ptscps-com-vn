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

## Read-only hosting log capability, 2026-11-17

Checked available FTPS credentials without downloading or displaying any log content. Workflow [#44019643453](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44019643453) completed successfully; the refined domain-prefixed filename scan [#44019768490](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44019768490) also completed successfully. `/domains/ptscps.com.vn/logs` is listable, but neither canonical nor name-contains-error Apache error logs nor similarly named access logs were found in the sampled directories; no Apache virtual-host configuration files were available. This establishes a practical access limitation, not a claim that the server has no logs. Files were not downloaded; visitor IPs, raw requests and credentials were not exposed.

**Open blocker:** Diagnosing or fixing intermittent Apache HTTP/2 first-byte stalls needs hosting-level log and worker/transport visibility unavailable through the current FTPS credentials. Ask host operations for aggregate per-request request-time, Apache/mod_http2 stream resets, connection-worker saturation and resource-pressure metrics around **2026-11-17 04:45–04:47 UTC**, then rerun the existing browser tests after any isolated hosting-side repair. Do not disable HTTP/2 globally on the basis of a single GitHub runner's curl medians. The A/Bs have already rejected changing Jannah CSS loading and HTTP/2 protocol as speculative remedies.

## Independent temporary-PHP versus static CSS probe (2026-11-17)

User's screenshots show a DirectAdmin panel with disk 4.24 GB / Unlimited, 9.94 GB bandwidth / Unlimited, 40,309 inodes / Unlimited and **PHP 7.4**. These figures do **not** show CPU/RAM/I/O or Apache worker use and cannot establish saturation.

To eliminate WordPress computation from this specific test, workflow [#44022516728](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44022516728) deployed a randomly named, standalone PHP diagnostic to the web root via encrypted FTPS, checksum-verified the file, made six alternate independent HTTP/1.1 and HTTP/2 request pairs comparing that PHP endpoint with the existing Jannah CSS, and **successfully removed the temporary file** (explicit `PROBE_CLEANUP SUCCESS`). It did not load WordPress or access configuration/database; the response was JSON with a short measured PHP execution time.

| Resource | Protocol | Successful | Median TTFB | Maximum TTFB | Median post-connect setup wait |
|---|---|---:|---:|---:|---:|
| Jannah CSS | H1 | 6/6 | 603ms | 1814ms | 189ms |
| Jannah CSS | H2 | 6/6 | 1199ms | 1872ms | 366ms |
| Standalone PHP | H1 | 6/6 | 1038ms | 1682ms | 184ms |
| Standalone PHP | H2 | 6/6 | 573ms | 3045ms | 184ms |

Standalone PHP function execution rounded to 0ms in the returned JSON, while the end-to-end response sometimes took seconds. *Inference:* long end-to-end delays cannot be explained solely by WordPress business logic; connection setup/transport and hosting-side queueing remain plausible. TTFB includes DNS/TCP/TLS and cannot be ascribed solely to PHP or Apache worker activity; nor does this prove host CPU overload. The two protocol medians vary with small samples and do not override full-page Chrome results (do not disable HTTP/2 based on this).

**Operational state:** the diagnostic endpoint was removed in the same successful workflow. No lasting production change. PHP 7.4 is EOL and warrants a separately staged compatibility upgrade, not an unreviewed production switch while diagnosing FCP.

Code: `scripts/ptscps-temporary-origin-php-probe.py`; workflow: `.github/workflows/ptscps-temporary-origin-php-probe.yml`.
