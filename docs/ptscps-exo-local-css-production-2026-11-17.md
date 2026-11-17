# PTSCPS Exo: bỏ WebFont Loader, chuyển sang CSS và WOFF2 nội bộ (17/11/2026)

## Trạng thái production

**Đã triển khai và xác minh thành công** bằng GitHub Actions [#43997416881](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43997416881): 10/10 kiểm thử Chrome desktop/mobile trên `/`, `/thu-ngo.htm`, `/dich-vu`, `/lien-he`, `/e`. Không cần rollback.

- MU plugin đang hoạt động: `deploy/ptscps-exo-css-direct.php` v1.0.3.
- Nguồn CSS: `/wp-content/uploads/ptscps-exo-fonts/exo-direct-v1.css` (~5.4 KB).
- 6 file Exo WOFF2 cùng thư mục (tổng lưu trữ ~100.5 KB; trình duyệt chỉ tải subset/font-weight sử dụng).
- Font CSS được enqueue trực tiếp trong `<head>` qua `wp_enqueue_scripts`, `font-display: swap`. Không còn request `webfont.js`, Google Fonts CSS hay Google WOFF2 trong 10 test.
- Chỉ loại đúng đoạn footer `WebFontConfig` Exo-only gốc của Jannah bằng output buffer giới hạn `wp_footer`; **không** chặn theo URL một cách tổng quát.
- Các selector Jannah vốn phụ thuộc `.wf-active` được thay thế bằng CSS có phạm vi `body.ptscps-exo-direct`, không cần JavaScript để bật font. Không can thiệp Elementor editor, wp-admin, preview hoặc nội dung Visual Builder.
- Font Exo vẫn áp dụng đúng cho body, tiêu đề, menu và banner/slider vẫn hoạt động; không có page errors.

## Các bước và bằng chứng

1. [Kiểm tra chính xác WebFont Loader](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43996134505): HTML Jannah thêm `WebFontConfig` với duy nhất Exo, sau đó tải `ajax.googleapis.com/ajax/libs/webfont/1/webfont.js`. CSS nội bộ Jannah dùng `.wf-active body`, `.wf-active h1...`, `.wf-active #main-nav...`.
2. [Kiểm tra endpoint CSS](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43996751380): CSS2 và legacy Exo trả HTTP 200, CSS `@font-face` 15 declarations.
3. [Đưa font CSS + WOFF2 vào hosting nhưng chưa kích hoạt](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43996925783): 6 WOFF2 hashes, CSS checksum được xác thực.
4. [A/B trình duyệt bản nội bộ](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43997251831): font Exo và kích thước heading/menu/logo như baseline; không request Google/Webfont loader; FCP khi dùng Playwright route injection không được dùng làm benchmark chính thức vì thao tác route.fetch tăng TTFB.
5. [Deploy production + xóa WP Super Cache + 10/10 QA](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43997416881): success; rollback not triggered.
6. [Waterfall trực tiếp trên production](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43997645196): mobile throttled FCP 2576 ms / TTFB 1346 ms / CLS 0.00965; desktop fast FCP 1696 ms / TTFB 956 ms / CLS 0.00050. Không có JavaScript page error.
7. [LCP/CLS browser thực tế](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43997879359): 4/4 jobs thành công, 8 lượt Chrome; không có JS page errors. FCP, LCP biến thiên theo TTFB.

## Kết quả FCP/LCP/CLS sau deploy (Playwright)

| Thiết bị / mạng | Lượt | TTFB ms | FCP ms | LCP ms | CLS |
|---|---:|---:|---:|---:|---:|
| Desktop fast | 1 | 3628 | 4376 | 4408 | 0.00049 |
| Desktop fast | 2 | 922 | 1476 | 1512 | 0.00049 |
| Mobile fast | 1 | 1538 | 2308 | 2328 | 0 |
| Mobile fast | 2 | 855 | 1540 | 1560 | 0 |
| Mobile throttled | 1 | 1745 | 2932 | 2992 | 0.00965 |
| Mobile throttled | 2 | 952 | 2132 | 2132 | 0.00989 |
| Desktop throttled | 1 | 1241 | 2604 | 2680 | 0.00047 |
| Desktop throttled | 2 | 948 | 3940 | 4012 | 0.01693 |

LCP hiện là đoạn văn giới thiệu công ty (không phải banner image) trong các lượt đo. **Không kết luận FCP/LCP cải thiện bao nhiêu từ các mẫu nhỏ**, vì có TTFB/network dao động mạnh. CLS vẫn thấp trong tất cả lượt đo. Việc bỏ chuỗi loader JS, CDN Google CSS, CDN Google WOFF2 được xác nhận ở mức network request.

## Rollback và hạn chế

- Script deploy: `scripts/ptscps-exo-direct-deploy.py` (FTPS, checksum verification).
- Script rollback: `scripts/ptscps-exo-direct-rollback.py` (chỉ xóa/khôi phục MU-plugin được sở hữu; không xóa các WOFF2 bất hoạt).
- Production workflow: `.github/workflows/ptscps-exo-local-live.yml`. Nếu QA thất bại, workflow rollback plugin và xóa cache lại.
- Không sửa Jannah parent theme, Elementor builder hoặc Slider Revolution. Không thay đổi JS tối ưu SR7 đang hoạt động.
- Lưu ý `font-display:swap` vẫn có thể swap font khi kết nối chậm; không đảm bảo CLS 0 trên mọi thiết bị. Nên theo dõi PSI field data qua thời gian, không lấy các lượt lab đơn lẻ làm bằng chứng chắc chắn của cải thiện FCP/LCP.
