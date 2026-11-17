# PTSCPS - Temporary isolation of both sliders for Lighthouse SI (2026-11-17)

## User hypothesis / scope
User suspects both the hero Slider Revolution (`sr7-module#SR7_1_1`) and Elementor customer carousel (`.elementor-element-1be3f74`) contribute to Speed Index (SI) remaining high after first image is recognized as LCP. First test is an isolation: **leave production untouched** but hide either/both widgets from the browser's layout **before first paint**, then compare actual Lighthouse SI.

## Source, workflow and final validated experiment
- Source: `scripts/ptscps-si-two-sliders-ab.cjs`.
- Workflow: `.github/workflows/ptscps-si-two-sliders-ab.yml`.
- Final valid [run #44123275279](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44123275279): **both mobile and desktop jobs success; 16/16 real Lighthouse 13.5.0 runs** (2 cycles × 4 alternatives × 2 devices); all passed browser-side DOM/CSS preflight and at least two HTML-response interceptions (smoke and actual Lighthouse).
- HTML fetched from the current real homepage once in each job. Playwright's browser-context route fulfills the initial document with the **same HTML plus an early CSS rule**. External WordPress CSS/JS/image requests still use live URLs and are not modified. Lighthouse operates against the same public URL via an isolated CDP-enabled Chromium. No FTPS, plugin deployment, admin edit, cache invalidation, or production visitor change.
- Conditions: `control`, `nohero`, `nocustomer`, `both`.
- Critical engineering troubleshooting: first run [#44121002454](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44121002454) was rejected because headless extensions were not applied. Next versions initially blocked the Playwright route by calling Lighthouse synchronously with `execFileSync`. Final script runs Lighthouse asynchronously with `spawn`, performs a CDP port readiness gate, aborts on invalid cases, and validates that patched HTML was actually used by Lighthouse. **Do not reuse the earlier failed runs' SI figures.**

## Valid A/B results (n=2 for each condition/device)
| Condition | Mobile SI median | Desktop SI median | Mobile paired SI delta vs control (cycle1 / cycle2) | Desktop paired SI delta (cycle1 / cycle2) |
|---|---:|---:|---:|---:|
| Control | 7044.5ms | 2653.5ms | — | — |
| Hide hero | 5097.5ms | 2189.5ms | -3776ms / -118ms | -923ms / -5ms |
| Hide customer carousel | 5933ms | 2069ms | -1954ms / -269ms | -1057ms / -112ms |
| Hide both | 5137ms | 2020.5ms | **-3980ms / +165ms** | **-1104ms / -162ms** |

- SI after hiding both: mobile 4851–5423ms (vs control 5258–8831ms); desktop 1948–2093ms (vs control 2255–3052ms).
- FCP/LCP shifted widely with control runs as well: e.g. mobile control FCP 4410–8831ms, LCP 4628–9281ms, desktop control FCP 1552–2824ms, LCP 1592–3066ms. Hence the unusually large apparent gains in cycle 1 are confounded by severe live origin/network/renderer variation, not proof of 4s saved due to either slider. The mobile cycle 2 actually got **165ms worse** when hiding both.
- Desktop both deltas were consistently negative, but vary by 7x. Sample size only 2 cycles and served HTML body via interception (not normal TTFB). This is directional evidence, **not a production benefit estimate**.
- **Important**: hiding with `display:none` still allows native SR7, Elementor, Swiper JavaScript and images to be fetched/initialized. This tests visual/layout contribution and which below-hero section moves upward, not full removal of slider scripts/traffic. Removing carousel outside the first viewport changes document structure but may not causally reduce the first viewport SI: paired results may capture noise.

## Recommendation / next gate
1. Do not remove, dequeue or permanently hide either production slider on these two samples. Builder editability and normal site unchanged.
2. To understand *full* upper bound of removing both, a distinct **browser-only hard-removal A/B** can remove widget markup and scoped assets from the pinned homepage HTML, then run 5+ alternating pairs per device with stable request/TTFB conditions, checking fatal JS errors and preserving a functional non-slider page. Do not conflate that distinct intervention with CSS hiding.
3. For more causal SI attribution, hold early visual state fixed and isolate native SR7 visual handoff/autoplay using same source HTML, gather filmstrips and repeated Lighthouse SI, FCP, LCP, CLS and TBT. Existing SR7 first-slide preload/CSS poster and WebP remain in production.

## State
Read-only audit completed and archived in workflow artifacts; **production unchanged**.
