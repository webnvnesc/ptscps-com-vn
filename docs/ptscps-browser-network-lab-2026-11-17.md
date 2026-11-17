# PTSCPS — self-service Vietnam Chrome browser network lab (2026-11-17)

## Why
GitHub-hosted runners are remote from the Vietnamese origin and their absolute DNS/TCP/TLS timings are not representative of a user's Vietnam connection. This diagnostic is offered for the user to gather local-network evidence without DNS migration, CDN, SSH, provider support, or production WordPress changes.

## Live diagnostic
[https://ptscps.com.vn/ptscps-browser-network-lab-20261117.html](https://ptscps.com.vn/ptscps-browser-network-lab-20261117.html)

- Standalone static HTML with `noindex,nofollow,noarchive`, a restrictive CSP, and no external application JS dependency.
- Dynamically discovers current, real Jannah `style.min.css`, Elementor `widget-spacer.min.css`, and WordPress `jquery.min.js` URLs directly from the current homepage HTML. It never assumes a fixed `ver=` version.
- On each cycle, measures those three assets sequentially using uncached, credential-free same-origin fetch; then downloads up to eight existing first-party CSS/JS assets concurrently. Alternates the mode order each cycle; rounds 6, 12, or 20.
- Uses the Resource Timing API to capture first-byte delay, after-send delay, body duration, bytes, protocol, errors, and paired per-asset group-minus-solo medians. Nonexecuting fetches avoid modifying the page and WordPress behavior.
- Separate button loads full WordPress homepage in a same-origin iframe for a single approximate real-page asset timing sample, which can have cache effects.
- The test does **not transmit results to a collection endpoint**, never requests admin access, avoids cookies in its diagnostic fetches and can copy/download a JSON report that the user can supply to ChatGPT.
- A lightweight zero-auth public endpoint exists only as the explicit user-facing diagnostic page. It creates modest request bursts (max eight simultaneous). Results are measured in the end user's local browser. Extension-injected request traffic can be avoided using Chrome Guest.

## Safety and limitations
- This is a live read-only browser test, not a production optimization; no changes to DNS, theme, Slider Revolution, Elementor, admin, Apache config or cache settings. The temporary file may be removed after measurements if preferred. Script `scripts/ptscps-browser-network-lab-deploy.py` installs only the known owner-marked HTML with FTPS checksum verification and refuses unrecognized files.
- Browser fetch priority differs from render-blocking CSS/JS parser fetch priority. A grouped synthetic fetch does not fully model all browser/HTTP2 scheduling of a live homepage. The iframe test is therefore offered as a separate reference, not equivalent controlled evidence.
- Chrome's Resource Timing `responseStart` includes browser scheduling, connection, and transport, and is not a direct measurement of Apache execution. Network location is not verified by the page; the user should run it physically on a Vietnam connection.
- A nonzero `transferSize` generally supports that bytes crossed the network, while zero may indicate cache or browser accounting quirks. Read-only same-origin requests can still appear in server logs.
- Do not infer "hosting is broken" or "PHP bottleneck" from a single slow sample. Compare local-browser and remote GitHub sample distributions, response errors and slow-tail rates. Never disable HTTP/2 or defer jQuery blindly; earlier controlled tests showed regressions.

## Operator verification
Run `.github/workflows/ptscps-browser-network-lab-deploy.yml`, which installs the single static HTML file via encrypted FTPS and performs a six-round Chrome smoke test. Verified endpoint should return 200, present its diagnostic UI and produce valid summary data.

## Recommended user instructions
1. Open URL in a Chrome Guest window while connected to the normal Vietnam Internet connection and not using VPN.
2. Leave default 12 rounds, click **Chạy tải riêng & tải đồng thời**.
3. Once complete, optionally press **Đo trang chủ thật (1 lượt)**.
4. Click **Sao chép báo cáo JSON** and paste it into the PTSCPS project conversation, or download the JSON file.
5. Compare local solo/group/home results with GitHub samples before deciding on optimization.

## Production acceptance (2026-11-17)

- GitHub Actions workflow [#44028730974](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44028730974): **SUCCESS**, including production HTML HTTP 200, `noindex`, 6 cycles × solo/group for 3 key resources (36 valid sampled timings, no page errors), JSON reporting, and at least 2/3 usable Jannah/Elementor/jQuery timing entries in the live-homepage iframe check. `NETLAB_ALREADY_CURRENT` confirms production file hash matches the approved repo file.
- GitHub-hosted Chromium median first-byte delays: Jannah solo ~223ms / grouped ~223ms; spacer solo ~216ms / grouped ~217ms; jQuery solo ~222ms / grouped ~224ms. This second CI sample does **not** show meaningful median concurrent overhead; the earlier full-page Chrome experiment did contain sporadic very large HTTP/2 outliers. This reinforces that latency is variable and **runner-only measurements cannot establish Vietnam end-user latency**.
- GitHub workflow #44028572044 additionally passed six rounds and emitted all 36 samples with no errors. The earlier #44028309388 failed due solely to an incorrectly configured Playwright wait timeout (default 30 seconds); this was corrected and successfully verified on later runs. No website regression was found.
- An end-user browser report was later supplied. See the 12-cycle results below; a full homepage sample is still missing.


## End-user browser measurements, received 2026-11-17 at 13:10 ICT

Evidence: user-supplied browser JSON generated by this diagnostic (capture UTC 2026-11-17T06:10:42Z; timezone Asia/Saigon). Geography is not independently verified, but measurements are from the user's browser rather than a GitHub runner.

| Target | Solo first-byte median | Group-of-eight first-byte median | Paired median group minus solo | Solo max | Group max |
|---|---:|---:|---:|---:|---:|
| Jannah style.min.css 7.6.3 | 14ms | 15ms | +1ms | 18ms | 21ms |
| Elementor widget-spacer.min.css 4.2.2 | 7ms | 11ms | +3.5ms | 11ms | 15ms |
| WordPress jquery.min.js 3.7.1 | 13ms | 21.5ms | +6.5ms | 17ms | 29ms |

**72/72 recorded target-asset fetches succeeded**, all HTTP 200 over HTTP/2 with positive transferSize, no errors/resets, and no first-byte waits over 2,000ms. Group mode requested eight actual first-party assets (also Exo font local CSS, SR7 CSS, ASP CSS, Jannah base and widgets), but the report persisted only the three primary target assets per mode.

Interpretation: the origin's static CSS/JS was very fast over this user's established browser connection, and eight concurrent fetches produced no meaningful wait. These data do not support a general hosting overload or persistent static-file bottleneck on this user's connection at that time. Earlier GitHub-hosted browser absolute timings were substantially higher. That is consistent with a network/connection-path/geographic contribution but does not prove the runner's location or exclude rare outliers.

Important limits: The reported homepage field was an empty array. The optional full WordPress iframe button was not included in this report. This page was already open on the website before fetch sampling, so it likely reused an existing DNS/TCP/TLS/HTTP2 connection. No-store fetches avoid normal HTTP response cache reuse but do **not** emulate cold first navigation, Chrome's render-blocking CSS priorities, JS execution, SR7 startup, Lighthouse CPU/network throttling, or FCP/LCP/SI. The user's browser timezone does not authenticate physical location.

Next: user runs the separate full-homepage button for first site-level comparison and sends updated JSON; for genuine cold-first-visit diagnosis, use fresh Chrome Guest session + DevTools Network on the homepage (disable cache and inspect waterfall), or local Lighthouse. Do not change production HTTP/2, DNS, CDN, CSS or JS on this evidence alone.
