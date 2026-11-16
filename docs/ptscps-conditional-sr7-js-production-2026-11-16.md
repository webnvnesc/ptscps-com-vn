# PTSCPS — Conditional Slider Revolution JavaScript trên WordPress

Ngày triển khai: **16/11/2026**. Trạng thái: **đã bật trên production, QA URL thường thành công**.

## Mục tiêu và kết quả

- Đối tượng: hai thư viện SR7 được theme/plugin enqueue toàn cục theo lựa chọn `inclAll`:
  - `/wp-content/plugins/revslider/public/js/sr7.js` — khoảng 112.120 byte transfer
  - `/wp-content/plugins/revslider/public/js/libs/tptools.js` — khoảng 79.562 byte transfer.
- Không tải hai thư viện trên các **WordPress Page** xác định không có slider; vẫn giữ trên trang chủ và mọi Page có shortcode/widget SR7.
- Không thay đổi Slider Revolution global settings, CSS SR7 (đã giúp giữ CLS), PHP của plugin bên thứ ba, cấu hình Elementor/Jannah, URL hay REST API.

## Triển khai

Mã: [deploy/ptscps-sr7-conditional-js.php](../deploy/ptscps-sr7-conditional-js.php), cài dưới `/wp-content/mu-plugins/ptscps-sr7-conditional-js.php`.

Hook `wp_enqueue_scripts` ở ưu tiên cao gỡ **chính xác** hai handle `tp-tools` và `sr7` qua `wp_dequeue_script()` nếu trang đáp ứng các điều kiện:
- Chỉ WordPress `is_page()`, không xử lý trang chủ, blog home, admin, preview, Customizer/editor.
- Giữ nguyên khi `post_content` hoặc Elementor `_elementor_data` chứa mã/shortcode/widget SR7; nếu widget là `global`, fail-open giữ script.
- Nếu có widget slider trong sidebar/website thì giữ script.
- Có filter `ptscps_sr7_js_gate_force_include` để giữ script theo nhu cầu mở rộng.
- Không sửa WordPress `active_plugins` hoặc danh sách dữ liệu builder.

**Giới hạn**: Đây là tối ưu bảo thủ cho `is_page()`, không tự tắt trên mọi archive/REST/POST. Slider nhúng thông qua template toàn cục hay JavaScript động bên ngoài Page/Elementor metadata có thể cần bổ sung nhận diện; kiểm thử sau khi thêm slider qua cơ chế khác. Nếu có bất kỳ nghi ngờ nào, giữ script an toàn hơn.

## Bằng chứng

1. [Source inspection #43911530520](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43911530520): SR7 7.1.4 `RevSliderFront::add_actions()` kiểm tra `inclAll`, `has_shortcode` và widget. Các handle native là `tp-tools`, `sr7`; plugin đang nạp toàn cục nên cả trang không có slider cũng lấy JS.
2. [Canary #43912640814](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43912640814) (8/8): chỉ khi có `?ptscps_sr7_js_probe=1` thì Page không có slider không enqueue hai scripts; trang chủ luôn giữ. Header, logo, Elementor, slide và console không lỗi. Cũng đã so sánh browser-only ở [#43909955840](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43909955840).
3. [Production #43913085316](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43913085316) (8/8): nâng MU plugin từ canary 0.1.0 lên production 1.0.0, backup FTPS/runner, xác minh trang chủ còn 2 request SR7, Tin tức/Liên hệ/Dịch vụ không còn.
4. **Quan trọng: HTML cache cũ**: [Plain URL audit #43913425029 attempt 1](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43913425029) nhận thấy URL thường vẫn có 2 JS vì WP Super Cache phục vụ HTML cũ. Đã xóa **chỉ HTML cache** bằng chính nút WordPress WP Super Cache "Delete Cache" tại [run #43913864201](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43913864201); admin hiển thị 0 cached pages ngay sau đó. **Cùng workflow plain URL QA attempt 2** [#43913425029](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43913425029) đạt **8/8** với các URL *không query string*: trang chủ 2 scripts, Tin tức/Liên hệ/Dịch vụ 0 scripts, mobile+desktop, không lỗi JavaScript.
5. Tiềm năng tiết kiệm trên một Page không có slider: ~191.682 byte JS network transfer theo mẫu Chrome. Đó là số byte tiết kiệm tải script, **không phải** mức giảm FCP/LCP đã chứng minh. Trước đó chỉ đo một lần Chrome thì FCP biến động, nên chưa công bố lợi ích FCP/LCP.

## Backup và khôi phục

- [scripts/ptscps-sr7-conditional-live-deploy.py](../scripts/ptscps-sr7-conditional-live-deploy.py)
- [scripts/ptscps-sr7-conditional-rollback.py](../scripts/ptscps-sr7-conditional-rollback.py)
- [scripts/ptscps-sr7-conditional-live-qa.cjs](../scripts/ptscps-sr7-conditional-live-qa.cjs)
- [scripts/ptscps-sr7-plain-urls-qa.cjs](../scripts/ptscps-sr7-plain-urls-qa.cjs)

Đã lưu bản MU-plugin canary gốc trong artifact của run production và backup `.bak` trên hosting. Rollback chỉ khôi phục MU-plugin, không ảnh hưởng theme/plugin khác.

## Tiếp theo

Nghiên cứu độc lập trước khi sửa `Ajax Search Pro` (~36–55 KB) và `Jannah iLightbox` (~26 KB), vì giao diện tìm kiếm và lightbox cần kiểm thử tương tác. Không tự động tắt các script đó trong đợt deploy này.
