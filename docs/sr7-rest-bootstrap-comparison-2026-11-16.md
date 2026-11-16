# PTSCPS — SR7 REST API WordPress bootstrap latency comparison (2026-11-16)

## Question

Does `/wp-json/sliderrevolution/sliders/1?srengine=7&slideid=2|3` load the full WordPress core and therefore take longer than the ~1.7 KB payload warrants?

**Architecture:** Normal WordPress REST requests bootstrap WordPress, active plugins and theme hooks to route the request, not the full HTML frontend rendering. The server-side handling and PHP/WordPress/DB work can dominate payload transfer time. This alone does not prove the bottleneck.

## Read-only production results

Runner: [GitHub Actions #43893356244](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43893356244). Six interleaved test cycles from one GitHub-hosted runner, HTTP/2 using curl's connection cache within each cycle. Script [ptscps-rest-vs-static-benchmark.py](../scripts/ptscps-rest-vs-static-benchmark.py).

| Request | Total median | TTFB median | Median wait after connection preparation | Reused connection requests |
|---|---:|---:|---:|---:|
| Static logo | 918.9ms | 918.9ms | 216.4ms | 3/6 |
| WordPress core REST `/wp-json/wp/v2/types/post` | 813.2ms | 813.0ms | 813.0ms | 6/6 |
| Slider Revolution slide ID 2 | 794.9ms | 794.8ms | 794.7ms | 6/6 |
| Slider Revolution slide ID 3 | 1230.2ms | 1230.1ms | 800.0ms | 3/6 |

For each asset, the response-body reception was ~0–0.1ms median. The static logo's total median includes connection setup; do not directly compare its 919ms total to REST's 795ms. Across reused HTTP/2 connections, the core WordPress REST and SR7 REST have near-identical waiting time (~795–813ms). Slide ID 3 has larger wall time due to half the cycles opening a fresh connection; its post-connection wait median (~800ms) is close to slide ID 2.

Earlier [API payload audit #43892623383](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43892623383) confirmed that slide IDs 2 and 3 are different, nonduplicate JSON responses (banner3 and banner2 respectively). Smart Loading is enabled in SR7 Global Optimization (user screenshot). Neither API contains large payloads.

## Interpretation

1. The extra latency is concentrated **before the first byte** rather than response-body transfer. The REST requests show a common ~0.8s wait from this runner.
2. **No evidence here that Slider Revolution endpoint is substantially slower than another default WordPress REST endpoint**. This is consistent with a shared WordPress/PHP bootstrap cost, or shared upstream/network/proxy waiting. Without direct on-server timings, attributing the full ~0.8s to WordPress core would overclaim.
3. All normal WP REST requests generally include bootstrapping, loaded plugin/theme hooks and route processing; they do not generate a whole frontend page. There is not a supported switch that makes a standard WordPress REST route magically omit WordPress core.
4. Hosting Apache/2 and network intermittency are possible contributors. Previous audit observed CSS/JS response waiting spikes as well, meaning a global request/transport issue could also be involved.
5. Need server-side discriminating instrumentation: reversible narrow `Server-Timing` (or instrumentation logging) just for REST requests if feasible, OPcache hit/usage, PHP-FPM/Apache concurrency, object cache/database, distinguish new from reused HTTPS/HTTP2 connections, and plugin internal caching (check release notes/current SR7 behavior). Do not prematurely disable plugins, bypass WordPress bootstrap with standalone PHP endpoints, or globally cache user-specific REST routes.
6. Potential safe future optimization: short TTL *anonymous* slide JSON response cache only after confirming payload is non-personalized and designing automatic purge on Slider Revolution content edits. A/B the impact and keep authoring and preview intact; weigh against plugin native internal cache and updates.

Production changes made during this test: **none**.
