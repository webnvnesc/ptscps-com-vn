# PTSCPS — Production Slider Revolution 7 REST FastPath

Date: 2026-11-16. Production deployed; [GitHub Actions run #43900858592](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43900858592) succeeded.

## Objective

Only these exact public anonymous URLs use static data instead of full WordPress bootstrap:

- `/wp-json/sliderrevolution/sliders/1?srengine=7&slideid=2`
- `/wp-json/sliderrevolution/sliders/1?srengine=7&slideid=3`

The Apache root `.htaccess` block `# BEGIN PTSCPS SR7 FastPath` intercepts only `GET/HEAD`, exact query parameters in either order, no Authorization header and no WordPress login/session security cookie. If the corresponding JSON file is absent, the request naturally falls through to the normal WordPress REST route. All other endpoints are unchanged. The static JSON path is `/_ptscps-sr7-fastpath/slide-{2,3}.json`; the folder sets `Content-Type: application/json`, `Cache-Control: public, max-age=30`, and `X-PTSCPS-SR7-FastPath: static`.

The WordPress MU plugin `wp-content/mu-plugins/ptscps-sr7-fastpath-sync.php` listens for native Slider Revolution slide/slider save, update, delete and option update actions. It removes static JSON immediately on matching mutation, schedules regeneration from the **native** WordPress endpoint at shutdown, checks JSON structure, and atomically publishes new files. If generation fails, the missing static files force native WordPress fallback. No changes to Jannah, Elementor or the slider data model. The source implementation is [deploy/ptscps-sr7-fastpath-sync.php](../deploy/ptscps-sr7-fastpath-sync.php).

**Qualification:** Direct editing-and-saving a real slide was not exercised in production to avoid altering user content. Hook registration and native save actions were inspected in actual installed Slider Revolution source, but end-to-end mutation propagation remains a follow-up acceptance check. If a future plugin update changes save hooks, check the FastPath JSON freshness and fallback immediately.

## Exact production QA

[Run #43900858592](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43900858592):

- Both slide endpoints returned HTTP 200 and the static header, exactly **1,694 bytes** (slide 2) and **1,692 bytes** (slide 3).
- Both payloads matched the original WordPress REST responses semantically and by SHA256.
- Query parameter order permutations worked.
- Adding another query parameter bypassed the static rewrite and returned native WordPress JSON.
- Supplying a fake `wordpress_logged_in_` cookie bypassed the static rewrite.
- The static source URLs served valid JSON. No PHP/WordPress bootstrap is needed for successful anonymous FastPath hits.
- Reused HTTP/2 connection timings (8 static versus native samples across four cycles):
  - Static file waiting: approximately **183–200ms** (median ~184ms).
  - Native WordPress REST waiting: approximately **750–811ms** (median ~760ms).
  - Reduction of approximately **76%** for those requests; not a Lighthouse FCP/LCP percentage and not necessarily representative for visitors with different networks.
  - Fresh TCP/TLS connections have extra cost and occasional variance; do not compare raw first connection directly to warm connection.

## Files and rollback

- Deploy: [scripts/deploy-ptscps-sr7-fastpath.py](../scripts/deploy-ptscps-sr7-fastpath.py).
- QA: [scripts/ptscps-sr7-fastpath-qa.py](../scripts/ptscps-sr7-fastpath-qa.py).
- Rollback: [scripts/ptscps-sr7-fastpath-rollback.py](../scripts/ptscps-sr7-fastpath-rollback.py).
- Workflow: [.github/workflows/ptscps-sr7-fastpath-deploy.yml](../.github/workflows/ptscps-sr7-fastpath-deploy.yml).
- Root `.htaccess` was modified only by prepending a bounded, managed rewrite block, leaving the WordPress and Wordfence sections byte-for-byte intact. The previous root file was saved as `sr7-before--htaccess` in GitHub Actions artifacts and the server backup.
- To immediately restore original WordPress routing, remove only the bounded `# BEGIN/END PTSCPS SR7 FastPath` block or restore the validated predeploy `.htaccess`. Static JSON and the sync MU-plugin are inert without the rewrite. Do not delete or rewrite other .htaccess blocks.
