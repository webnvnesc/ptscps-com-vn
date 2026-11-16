# PTSCPS — Intermittent render-blocking latency audit (2026-11-16)

## User hypothesis and scope
Lighthouse render-blocking request table shows 146.5 KiB with a reported cumulative 10,260 ms and tiny 0.4–0.6 KiB stylesheets often appearing at rounded durations of 200, 400 and 800 ms. Those Lighthouse values do not imply serial downloads; request timing needs separate investigation.

All following tests are READ ONLY on production. No caching, builder, theme or slider changes made.

## Evidence and test method
- [GitHub Actions run #43874066890](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43874066890): 20 repeated native HTTP/2 curl requests with new connections per URL, plus 5 low-concurrency waves (four concurrent requests). Script: [ptscps-intermittent-http.py](../scripts/ptscps-intermittent-http.py). Measures DNS/TCP/TLS completion, first byte, response body, bytes transferred and exceptions from one GitHub Actions runner.
- [GitHub Actions run #43874014839](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43874014839): 7 cold Chromium cycles each at 412 and 1440 widths, alternating native (no throttling) and simulated Lighthouse-like (RTT 150 ms, ~210KiB/s download, 4x CPU); scripts and full waterfall stored in artifacts. Script: [ptscps-intermittent-browser.cjs](../scripts/ptscps-intermittent-browser.cjs).

## Native curl results (20 fresh HTTPS connections per asset)

| Asset | Transferred size | Median TTFB | p90 TTFB | Max TTFB | Median response body download | Median first-byte wait after connection preparation |
|---|---:|---:|---:|---:|---:|---:|
| Elementor widget-spacer CSS | 338 B | 667 ms | 1,284 ms | 1,376 ms | 0.1 ms | 215.5 ms |
| Jannah style.min.css | 23,267 B | 869.5 ms | 1,063 ms | 2,156.5 ms | 4.9 ms | 422.5 ms |
| WordPress jquery.min.js | 30,368 B | 881.1 ms | 1,090 ms | 1,313.6 ms | 5.4 ms | 426.8 ms |
| Anonymous HTML | 42,628 B | 876.6 ms | 931 ms | 1,278.5 ms | 208.6 ms | 425.6 ms |

Note: Chrome/curl run from GitHub-hosted environments, not a controlled real-user connection in Vietnam. Median cumulative time to TLS completion in the fresh-connect curl tests was ~438–451ms. This is NOT the TLS handshake duration alone. The post-connection-preparation wait includes network path, proxy/edge and origin time, not just PHP.

Observation: The small CSS fetch had 0.1ms median body download time yet a 1.376s worst TTFB. Jannah CSS body normally downloaded in ~5ms yet had a 2.157s worst TTFB. There are sporadic pre-first-byte stalls; bandwidth of CSS/JS bodies is not their main bottleneck.

## Browser results (7 cycles each)

| Viewport | Environment | Median TTFB | Max TTFB | Median FCP | Max FCP | Median FCP minus TTFB | Median CLS |
|---|---|---:|---:|---:|---:|---:|---:|
| 412 | Native | 868ms | 1184ms | 1764ms | 2032ms | 879ms | 0.00903 |
| 412 | Throttled | 881ms | 947ms | 2428ms | 2644ms | 1528ms | 0.00912 |
| 1440 | Native | 867ms | 1381ms | 1732ms | **8656ms** | 871ms | 0.00104 |
| 1440 | Throttled | 880ms | 1813ms | 2468ms | **8688ms** | 1536ms | 0.00072 |

Seven samples are insufficient to generalize tail percentiles: the report's p90 on n=7 equals the maximum.

- Mobile native request-start-to-headers median: widget-spacer CSS ~425ms, Jannah CSS ~423ms, Elementor frontend CSS ~410ms, jQuery ~826ms. Browser request scheduling median ~1–4ms; multiple assets used the same HTTP/2 connection. Not merely oversized files or Chromium local queuing.
- Desktop native: widget-spacer median ~433ms, worst ~3775ms; Jannah style median ~424ms, worst ~3114ms; jQuery median ~816ms, worst ~7223ms. One browser page load had native FCP >8.6 seconds, independent of Lighthouse throttle, demonstrating a severe intermittent event.
- Artificial throttling increases median waits and body-transfer time but does NOT wholly explain the intermittent native stalls.
- Chrome detailed response stage instrumentation was incomplete for the field receiveHeadersStart, so the wait cannot be uniquely assigned to server CPU, reverse proxy/CDN, geographic path or HTTP/2 flow control.

## Conclusion and safe next step

Confirmed: significant intermittent network/server-response waiting can delay render even for tiny CSS/JS; larger file size is not the chief explanation. Observations support user's suspicion about intermittent delays, but do not yet isolate **hosting congestion** from network/transport/proxy congestion.

Next isolate with server-side logs and same-moment probes: Apache/Nginx access timings for CSS/JS vs HTML (request time, upstream time if available, response status and workers), monitor CPU/IO, compare HTTP/1.1 vs HTTP/2 under a consistent path, and validate from a Vietnam client. One GitHub runner is not a complete population sample. Do not modify WP Super Cache, merge CSS, defer jQuery or disable HTTP/2 just from these traces. Preserve the existing CLS and TBT work.

Production changes: none in this investigation.
