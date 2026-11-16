# PTSCPS: Jannah header intermittently shows oversized logo (2026-11-16)

## Evidence

The user reported an intermittent homepage with huge logo and seemingly absent search. Read-only [12-fetch HTML audit](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43884999256) returned 12/12 identical public HTML and identical logo markup, with search form always present and WP Super Cache footer in all responses. Thus no competing HTML cache variant was detected.

The [7-cycle browser audit](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43883930225) found identical header geometry and identical public HTML across anonymous desktop 1440 and compact 1024: logo 295x99, visible search, no CSS/JS request failures in those healthy runs. Mobile at 412 had a responsive logo 160x54 and no visible header search by design.

## Controlled failure reproduction

In read-only [browser-only CSS interception](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43885473571):
- Baseline: logo [240,10,295,99], search [890,28,224,20].
- Block main Jannah style.min.css only: logo still 295x99, search still visible.
- Block all Jannah assets/css stylesheets: logo intrinsic 2126x712 at [-15,5,2126,712], search displaced to [324,833,224,20].

The page HTML does not change between variants. The existing logo img has HTML dimensions 2126x712 and inline max-height 712px, width auto. Losing effective CSS permits the huge original dimensions and pushes the search out of the visible header. This closely reproduces the user's visual symptom. It proves a sufficient mechanism but not that exactly this failure happened during the user's bad reload.

Previous [browser test](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43881754989) captured intermittent ERR_CONNECTION_RESET on Jannah JS and jQuery in one desktop session; earlier [waterfall investigation](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43874014839) showed intermittent static-resource waits. A webserver/proxy, route, browser cache or transport-level issue remains unisolated.

## Recommendations

1. Capture a naturally failing load with DevTools Network Preserve log; inspect failed or late Jannah CSS and their response status, timing, transfer size and content-type. Correlate with Apache/Nginx logs and HTTP/2 network resets.
2. Do not purge HTML cache indiscriminately, merge/defer Jannah CSS, or adjust jQuery to fix a missing-stylesheet symptom.
3. If protecting visitors during sporadic failures is essential, A/B a minimal critical inline header layout fallback to constrain logo width and keep search visible; validate CLS, mobile/desktop and builder compatibility before deployment.
4. No production code or settings changed during this investigation.
