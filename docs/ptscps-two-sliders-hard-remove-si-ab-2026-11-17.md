# PTSCPS – Full browser-only hard removal of the two homepage sliders, Lighthouse SI A/B (2026-11-17)

## Goal / what was actually changed
User requested a controlled trial to see whether **removing the two homepage sliders entirely**, not just hiding them, materially lowers Google Lighthouse **Speed Index**. The two identified widgets were:
- Native Slider Revolution hero `sr7-module#SR7_1_1`.
- Elementor customer logo carousel `.elementor-element-1be3f74`.

This experiment did **not** modify production, WordPress data, Elementor content, themes, CDN or existing cache. The runner retrieved the actual home HTML and served a locally parsed/modified version only inside its own Chrome session (Playwright route fulfillment), while Lighthouse ran against that instrumented session. External network remained real production. The control was subjected to the same HTML parse/serialize path. Paired/rotated ordering aimed to mitigate time-dependent effects.

When hard hero was removed, the Elementor SR7 widget, native module HTML, associated preloads and directly attributable SR7 scripts, inline init and CSS tags were removed. When customer carousel was removed, that widget and its dedicated CSS were removed. Elementor/Swiper common dependencies and other site-wide resources were deliberately retained to avoid breaking unrelated features. Control and three treatments (`hardhero`, `hardcustomer`, `hardboth`), 5 cycles each/device, pinned Lighthouse 13.5.0.

## Workflow and evidence
- Main test source: `scripts/ptscps-si-two-sliders-hard-remove-ab.cjs`
- GitHub Actions: `.github/workflows/ptscps-si-hard-remove-two-sliders.yml`
- **Desktop 20/20 valid:** [#44124906170](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44124906170). The overall workflow status was FAILURE because separate mobile job encountered Chrome's transient `NO_FCP` in its fourth control sample; desktop job finished SUCCESS and its logs/artifacts contain all five desktop cycles.
- **Mobile 20/20 valid:** [#44126873958](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/44126873958), SUCCESS. Script retries transient invalid samples, preserving valid results. Mobile-only to avoid repeating completed desktop tests.
- Midway failures: first mobile `NO_FCP`, then npm registry attempted nonexistent `puppeteer-core@25.18.1` tarball. Fixed by overriding to published `25.17.0` for this lab workflow; installation and 20 mobile measurements succeeded.
- Every successful sample validated: HTML route modified for actual Lighthouse run, scoped widget DOM present/absent as intended, logo/source preconditions met, intact header, no obvious horizontal overflow, and absence of SR7 scripts and banner requests when hard hero removed.

## Main results: SI (ms), median of 5 per device

| Mode | Mobile SI | Mobile paired delta versus control | Desktop SI | Desktop paired delta versus control |
|---|---:|---:|---:|---:|
| Original control | **6019** | — | **3748** | — |
| Hard-remove SR7 hero | 6277 | **-381** | 4130 | **+197** |
| Hard-remove customer carousel | 5943 | **-122** | 3860 | **+277** |
| Hard-remove BOTH | 6564 | **+352** | 4031 | **+511** |

**Important interpretation:** The median of raw SI values and median of per-cycle differences are distinct statistics and may have different signs when samples are volatile. Negative paired delta = measured benefit; positive delta = slower. Removing SR7 on mobile improved SI by ≥250ms in 3/5 cycles, but was slower in 2/5; removing both improved SI by ≥250ms in only 1/5 mobile cycles. Desktop removing both reduced SI in 2/5 cycles and worsened it in 3/5. There is **no repeatable, convincing SI improvement from completely removing both**.

Representative paired deltas:
- Mobile hardhero: +417, +540, -808, -381, -583ms.
- Mobile hardcustomer: +18783 (artifact/outlier), -122, -594, +1139, -2838ms.
- Mobile hardboth: +352, +545, -1564, +3293, +35ms.
- Desktop hardhero: -125, +426, +197, +553, +111ms.
- Desktop hardcustomer: +445, +96, +1337, +277, -283ms.
- Desktop hardboth: +83871 (one anomalous 87.6s paint), -458, +672, +511, -270ms.

The extreme desktop `hardboth` run SI 87,619ms and mobile `hardcustomer` run SI 24,643ms indicate laboratory instability. These are NOT credible causal costs of removing the sliders. Medians are somewhat robust but the sample remains small. Exclude/caveat outliers in any future quantitative causal study.

## Verified network savings

| Device | Control | No hero | No customer | No both |
|---|---:|---:|---:|---:|
| Desktop requests | 104 | 88 | 81 | **65** |
| Desktop transfer size approx | 1,588,114 B | 1,127,668 B | 1,487,452 B | **1,027,600 B** |
| Mobile requests | 100 | 84 | 77 | **61** (one run 56) |
| Mobile transfer size approx | 1,261,920 B | 802,081 B | 1,147,886 B | **702,000 B** |

Hardhero/hardboth request lists showed **0 SR7 scripts, 0 SR7 CSS, 0 banner 1/2/3 image URLs**. Hardcustomer/hardboth showed **0 matched logo image requests**. Resource reduction is real in the test; Speed Index is **not** consistently better.

## Limits and recommendation
- Locally substituted HTML eliminates normal origin HTML latency and produces absolute Lighthouse SI higher/different than previous untouched production baseline (normal ~4.5s mobile / ~1.66s desktop in another run). **Do not compare lab absolute medians to PSI production**.
- The experiment changes the viewport's contents/element positioning and LCP element candidates. It does not preserve a same-size static placeholder. It also does not remove all shared Elementor/Swiper libraries. Therefore it estimates *full removal of slider-specific content and assets*, not how a production design with a static replacement would perform.
- The evidence **rules out a simple promise** that merely deleting both sliders reliably fixes SI. Site-wide render-blocking styles/fonts and early viewport paint timing remain plausible constraints, not conclusively proven.
- **Do not remove either production slider based on this A/B.** Keep SR7 editable via WordPress, keep first-slide CSS poster/dynamic preload, WebP, and optimized customer carousel.
- To isolate contribution to SI without shifting viewport, a more causally targeted next test is to hold the same hero geometry, replace just the SR7 native runtime with first-slide static image, preserve equivalent below-fold section positions, and test a CSS-critical-path experiment with repeated fixed network conditions. Existing foreground-poster A/B was inconclusive; avoid repeating it unchanged.

## Final state
Production was never altered by this A/B; two sliders remain intact and editable. Both desktop and mobile results were archived in linked Actions artifacts.
