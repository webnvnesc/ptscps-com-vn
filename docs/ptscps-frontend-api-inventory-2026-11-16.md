# PTSCPS frontend REST/AJAX API inventory — 2026-11-16

## Scope and finding

Read-only anonymous Playwright survey of **15 paths × two viewports (1440px and 412px)**, observing requests during page navigation, a delay after load, scrolling toward page bottom and back, and typing `FPSO` into the available homepage search field without submitting.

Production: `https://ptscps.com.vn`. Source: [scripts/ptscps-frontend-api-inventory.cjs](../scripts/ptscps-frontend-api-inventory.cjs). Runs: [initial inventory #43906440187](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43906440187), [correct real-path inventory #43906854788](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43906854788).

The second run visited 30 page/viewport combinations; 28 HTTP 200, two unsuccessful pages. Representative routes: `/`, `/dich-vu`, `/thu-ngo.htm`, `/hseq`, `/tin-tuc`, `/tuyen-dung`, `/lien-he`, `/c/co-dong`, `/c/co-dong/quan-he-co-dong`, `/c/co-dong/bao-cao-tai-chinh`, `/c/tin-tuc/hoat-dong-cua-cong-ty`, `/thu-vien-pps`, `/dich-vu/van-hanh-va-bao-duong-fpso-fso-mopu`, `/cong-ty-pps-hanh-trinh-tri-an-nam-2026-tai-tp-ho-chi-minh.htm`, `/en`.

### Actual frontend API requests observed

| API route | Count in 30 loads | Result |
|---|---:|---|
| `GET /wp-json/sliderrevolution/sliders/1?srengine=7&slideid=2` | 2 | HTTP 200, existing scoped plugin-filter MU plugin |
| `GET /wp-json/sliderrevolution/sliders/1?srengine=7&slideid=3` | 2 | HTTP 200, existing scoped plugin-filter MU plugin |
| `/wp-admin/admin-ajax.php` | 0 | Not observed in these visits |
| Other first-party WordPress REST calls | 0 | Not observed in these visits |

An external Google `https://ajax.googleapis.com/ajax/libs/webfont/1/webfont.js` resource appeared on 30 loads, HTTP 200. It is a **third-party JavaScript file, not WordPress AJAX or REST**. The audit's initial broad regex accidentally labeled `/ajax/libs/` as an API, but it is not one and is excluded from the first-party API classification in the corrected source.

No request failures or uncaught page JS errors were recorded in the sampled runs.

### Recommendation

**Do not add any more `option_active_plugins` filters at present.** The only first-party REST requests encountered during normal anonymous navigation are already optimized by `wp-content/mu-plugins/ptscps-sr7-slim-loader.php`.

The site may have additional REST/AJAX actions that happen **only after user interaction**, e.g. form submission, search popup/AJAX suggestions, logged-in content editing, job applications, Elementor forms, search filters. These actions were not submitted/tested to avoid triggering live writes, notifications, or emails, and should not be blanket-filtered. Unknown routes retain the complete plugin stack.

When a new performance trace shows another expensive first-party API, classify its authentication, method, side effects and plugin dependencies, then canary-test exact JSON/behavior before adding any route-specific filter.

No new production plugin filtering rules were added as part of this audit.
