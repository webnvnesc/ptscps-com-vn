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
