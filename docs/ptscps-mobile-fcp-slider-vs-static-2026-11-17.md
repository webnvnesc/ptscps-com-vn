# PTSCPS — mobile FCP: Slider Revolution versus native static first-image trial (2026-11-17)

## User question and hypothesis

User prioritizes mobile **FCP** (PSI sample FCP 2.3s, LCP 5.7s, SI 5.0s, TBT 20ms and CLS 0; desktop FCP 0.4s, LCP 0.5s, SI 1.0s). Would replacing slider with a static hero image improve FCP? The current native SR7 banner is already dynamically preloaded (actual first slide), and CSS poster paints independently of SR7 JavaScript, so replacing slider should not be presumed to shorten FCP.

## Browser-only test; unchanged production

Code: [scripts/ptscps-fcp-mobile-slider-vs-static.cjs](../scripts/ptscps-fcp-mobile-slider-vs-static.cjs); workflow [ptscps-fcp-mobile-slider-vs-static.yml](../.github/workflows/ptscps-fcp-mobile-slider-vs-static.yml). Mobile 412px, 150ms artificial RTT, 210KiB/s download, 4x CPU, cold browser contexts and disabled cache. Every pair alternates order and compares:

- **Slider original:** actual WordPress HTML with SR7, dynamic first slide poster and preload.
- **Static image:** in Playwright *only*, replace the native SR7 module with an eager, high-priority image using **the same actual current first-slide URL**, remove 3 SR7-associated external scripts, 2 SR7 stylesheets, and 4 inline scripts matching SR7 initialization. Other WordPress/Jannah/Elementor markup and dependencies are retained. The test does not exercise an actual builder-managed production static image, therefore its geometry, CLS and interactions must be validated before any real adoption.

### Initial test — confounded by different HTML response times

[Run #44030372228](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44030372228), 6/6 valid by basic geometry gate, first 6 paired simulations. Median **static minus slider FCP +772ms (worse)**, but highly variable across runs, with large document-HTML TTFB drift (some samples differed by several seconds). Two static arms were faster and four were slower. These are **not reliable causal FCP effect estimates**, because each arm independently fetched HTML via the external network before interception.

### Controlled second test — identical HTML for both arms

[Run #44030911505](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44030911505) **SUCCESS**, 5/5 valid pairs. One copy of the actual current homepage HTML was fetched first, and *both* test arms received the exact same HTML source via interception without origin HTML response timing variance. All CSS/JS/images still fetched from actual production URLs, so network response tails can affect pair differences. The test is a browser experiment, not a native PageSpeed/Lighthouse score.

| Metric | Median static minus native SR7 | Interpretation |
|---|---:|---|
| FCP | **+120ms** | Static modestly **worse** in this 5-pair sample |
| FCP after TTFB | +138ms | Browser render phase after document remains slower |
| LCP | +292ms | Static hero not reliably better |
| CLS | -0.00055 | Both variants within low CLS; tiny improvement is not meaningful alone |
| Long-task blocking *proxy* | -21ms | Not standardized Lighthouse TBT |

Each pair FCP delta (static minus original slider): **+120ms, +4ms, +128ms, +108ms, +224ms**. No pair improved FCP by at least 100ms; 4/5 static samples were slower by at least 100ms. Median 120ms worse, no evidence static image materially accelerates mobile FCP when existing SR7 poster/preload is functioning.

### Decision

**Do not remove Slider Revolution on production for the purpose of FCP optimization.** It is already structured to show the first banner image without waiting for JS; replacement would sacrifice native slide rotation, admin management and builder behavior without demonstrated FCP benefit. This is specific to existing PTSCPS implementation, not a claim that sliders generally have no overhead.

What *does* remain: Mobile FCP ~2.3s under PSI test conditions likely includes cold first-navigation HTML/TLS + multiple render-blocking stylesheets, whereas the local-browser user's 7–29ms CSS/jQuery measurements were from a warm established HTTP/2 connection and cannot represent cold FCP. Early tests trying Jannah CSS defer/critical CSS failed safety gate or worsened desktop FCP, so don't blindly defer core CSS or jQuery.

Recommended next test: measure precise FCP breakdown (navigation responseStart; Jannah/Elementor CSS responseEnd; main-thread style/layout/first-paint; first visible text/logo/hero). Use paired mobile Chrome filmstrip plus CDP and full Lighthouse traces on the *same* profile and traffic path, then selectively remove only proven nonessential render-blocking styles in browser before any production change. Always preserve TBT, CLS, homepage UX, Elementor and SR7 editing.

**Production/DNS/hosting changes made: none.**
