# PTSCPS — Phân tích JavaScript theo nhu cầu (Astro-like) — 2026-11-16

## Mục tiêu

Tìm cách chỉ tải JS khi trang hoặc chức năng sử dụng, nhưng **không phá LCP/FCP, CLS/TBT, Jannah, Elementor, Slider Revolution và Visual Builder**. Nghiên cứu này chỉ đọc và A/B bằng Playwright, không thay đổi production.

## Kiểm tra Chrome thật

Chạy trên trang chủ `/`, tin tức `/tin-tuc`, liên hệ `/lien-he` và dịch vụ `/dich-vu` ở desktop 1440px và mobile 412px, Chrome tắt extension, lạnh cache. Script [ptscps-js-demand-loading-audit.cjs](../scripts/ptscps-js-demand-loading-audit.cjs), [GitHub Actions #43909662312](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43909662312).

| Trang | JS request | Tổng JS transfer | SR7 libs | Elementor + Pro | Khác |
|---|---:|---:|---:|---:|---|
| Trang chủ | 30 | ~444 KB | ~192 KB | ~96 KB | còn lại |
| Tin tức | 23 | ~379 KB | ~192 KB | ~52 KB | còn lại |
| Liên hệ | 26 | ~385 KB | ~192 KB | ~58 KB | còn lại |
| Dịch vụ | 23 | ~379 KB | ~192 KB | ~52 KB | còn lại |

Đây là bytes truyền qua mạng của browser, không phải kích thước raw/uncompressed.

### Tập lệnh đáng chú ý (desktop homepage)

| File | Transferred | Observed |
|---|---:|---|
| `/wp-content/plugins/revslider/public/js/sr7.js` | 112,120 B | Trong head, tải trước FCP |
| `/wp-content/plugins/revslider/public/js/libs/tptools.js` | 79,562 B | Trong head, tải trước FCP |
| `/wp-content/cache/asp/asp-*.min.js` (Ajax Search Pro) | 54,850 B home; 36 KB others | Tải trước FCP; nên nghiên cứu chỉ tải khi mở/tập trung ô tìm kiếm |
| `/wp-content/plugins/elementor/assets/lib/swiper/v8/swiper.min.js` | 39,769 B | Homepage có image carousel, được tải theo widget |
| `/wp-includes/js/jquery/jquery.min.js` | 30,433 B | Core dependency, đã từng gây `jQuery is not defined` khi defer độc lập |
| `/wp-content/themes/jannah/assets/ilightbox/lightbox.js` | 25,555 B | Tất cả trang đo đều tải sớm; có thể xem xét chỉ tải khi cần lightbox, nhưng phải QA thư viện ảnh/menu |
| `/wp-content/plugins/elementor/assets/js/frontend-modules.min.js` | 16,025 B | Dependency của Elementor |
| `/wp-content/plugins/elementor-pro/assets/js/elements-handlers.min.js` | 10,590 B | Dependency của Elementor Pro |
| Elementor/Pro runtime and frontend handlers | thêm ~20 KB | Dependencies; không tùy tiện dequeue |

Elementor đã tự tách thành các bundle nạp động cho form, post, image carousel, section… Nên giữ Elementor built-in loader, không tải lại các bundle bằng cơ chế riêng.

## Bằng chứng thử bỏ SR7 scripts trên các trang KHÔNG có slider

Playwright **chặn đúng** `sr7.js` và `tptools.js` trên `/tin-tuc`, `/lien-he`, `/dich-vu`, hai viewport. Chỉ trình duyệt test thay đổi, production không thay đổi: [script](../scripts/ptscps-sr7-js-gating-browser-ab.cjs), [Actions #43909955840](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43909955840).

Các trang này có `sr7-module` count = **0**. Chặn mỗi trang 2 script, tương đương tránh truyền ~192 KB nếu WordPress không enqueue hai thư viện này. Cả 6 test chặn đều HTTP 200, không có JS page errors và các DOM geometry vị trí header/logo/search/Elementor được kiểm tra giống baseline.

| Trang/viewport | Delta FCP khi chặn SR7 | Delta CLS |
|---|---:|---:|
| Tin tức mobile | -460ms (TTFB -483ms, không thể gán cho JS) | 0 |
| Tin tức desktop | **+6,676ms** (một lần bị delay bất thường) | -0.0144 |
| Liên hệ mobile | +4ms | 0 |
| Liên hệ desktop | +88ms | +0.00089 |
| Dịch vụ mobile | +4ms | 0 |
| Dịch vụ desktop | -80ms | -0.00019 |

**Không có bằng chứng FCP cải thiện đáng tin cậy** từ test đơn mẫu này; một lượt FCP desktop xấu bất thường, phù hợp tình trạng network asset waiting trước đây. Chặn JS trong browser khác với việc WordPress không phát thẻ script; không tính đây là kết quả có thể dùng để triển khai ngay.

## Kế hoạch triển khai có thể bảo trì

1. **P1: SR7 chỉ tải trên trang có slider**. Đầu tiên xác minh slider có được nhúng trực tiếp qua Elementor/widget/shortcode, menu/popup/modal, template hoặc có thể xuất hiện muộn khi tương tác. Ở `wp_enqueue_scripts` hoặc `wp_print_scripts`, chỉ dequeue chính xác hai handle đã định danh từ live source và chỉ với điều kiện không có module / shortcode slider ở trang; giữ nguyên asset registration và admin/editor. Cẩn trọng trường hợp slider có thể được thêm qua Elementor Builder mà không sửa PHP; tốt hơn dùng plugin native enqueue toggle nếu có. Cần kiểm thử sau khi thêm/xóa slider (tự thích ứng).
2. **P2: Ajax Search Pro**: `asp-*.min.js` 36–55 KB trên mọi trang. Kiểm tra tìm kiếm header, AJAX suggestions, mobile menu, focus/tab/keyboard; nếu tính năng chỉ cần khi ô search được focus/click, cân nhắc tải khi tương tác (Event listener nhẹ hoặc plugin native setting). Cần không làm chậm gợi ý khi user bắt đầu gõ.
3. **P3: Jannah iLightbox**: 25.6 KB mọi trang; chỉ nạp khi có thư viện/lightbox hoặc click ảnh nếu không nằm above fold. Kiểm thử gallery, popup, carousel, ảnh bài viết, responsive menu.
4. **Giữ nguyên** jQuery/Jannah core/Elementor frontend dependencies; các bundle Elementor hiện đang tách tự động. Không globally defer `jquery`, `sr7.js`, `tptools.js`, hoặc delay slider ở trang chủ vì banner đang ở đầu trang.
5. Trong mỗi P1–P3: A/B nhiều lần cold browser với mobile/desktop, simulated slow network, kiểm CLS/TBT/FCP/LCP/Speed Index, console errors, thay đổi slide/Elementor widgets, admin editor, search, gallery. Kiểm thử xong mới chỉnh production từng bước; snapshot/rollback file PHP và cache scope hẹp.

**Trạng thái production:** Không chỉnh sửa bất kỳ JS hay WordPress option nào trong cuộc kiểm tra này.
