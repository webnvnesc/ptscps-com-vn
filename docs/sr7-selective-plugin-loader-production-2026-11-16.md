# PTSCPS SR7 — chuyển từ JSON FastPath sang lọc plugin theo REST API

Ngày: 16/11/2026. **Đã triển khai trên production.**

## Lý do và phạm vi

Người dùng muốn bỏ cơ chế tĩnh phải xác định từng slide (trước đây chỉ slideid=2,3), thay bằng cơ chế `option_active_plugins` để các slide mới trong Slider Revolution 7 tự hoạt động, không phải cập nhật Apache/cache JSON.

- Source MU-plugin: [deploy/ptscps-sr7-slim-loader.php](../deploy/ptscps-sr7-slim-loader.php)
- Production: `wp-content/mu-plugins/ptscps-sr7-slim-loader.php`.
- Chỉ lọc cho `GET /wp-json/sliderrevolution/sliders/{numeric_id}?srengine=7&slideid={numeric_id}` của khách không đăng nhập, không gửi Authorization. Tất cả các URL khác, wp-admin, các phiên đăng nhập, REST API khác giữ nguyên danh sách plugin. Không cập nhật tùy chọn `active_plugins` trong cơ sở dữ liệu.
- Giữ lại các plugin `revslider/revslider.php`, `wordfence/wordfence.php`, `polylang/polylang.php`, `wp-super-cache/wp-cache.php`. WordPress core vẫn chạy, chỉ rút gọn plugin khởi tạo.
- Plugin lọc là MU-plugin scope hẹp, không sao chép file hơn 1.000 dòng từ dự án khác.
- Đã gỡ duy nhất block `# BEGIN/END PTSCPS SR7 FastPath` khỏi `.htaccess`, giữ nguyên những phần cấu hình khác. Plugin đồng bộ JSON tĩnh cũ `ptscps-sr7-fastpath-sync.php` được đổi tên thành `.ptscps-sr7-fastpath-sync.retired.php.bak` để không chạy nữa. File JSON tĩnh cũ có thể vẫn nằm trong thư mục, nhưng không còn được sử dụng bởi URL API.

## Kiểm thử trước khi chuyển

[Canary thành công #43904566157](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43904566157), phiên bản canary chỉ chạy với tham số thử nghiệm riêng. Hai API có payload JSON **khớp chính xác SHA-256** với bản gốc; không tác động yêu cầu có cookie đăng nhập. Trong 16 lượt/nhóm dùng lại HTTPS:

| Chế độ | Thời gian chờ phản hồi trung vị |
|---|---:|
| REST đầy đủ plugin | 762,3 ms |
| REST lọc plugin | 422,8 ms |

Giảm khoảng **44,5%** thời gian chờ phản hồi REST trong điều kiện thử này. Không so sánh trực tiếp với cache JSON tĩnh trước đây (FastPath tĩnh nhanh hơn nhưng khó bảo trì các slide mới).

## Chuyển production

[Workflow thành công #43904952397](https://github.com/webnvnesc/ptscps-com-vn/actions/runs/43904952397). Mã triển khai [scripts/ptscps-sr7-slim-transition.py](../scripts/ptscps-sr7-slim-transition.py) sao lưu chính xác `.htaccess`, MU loader canary và MU sync cũ, sau đó triển khai nguyên tử.

QA trên production:
- `slideid=2`: 1.694 byte, JSON khớp bản gốc và SHA-256.
- `slideid=3`: 1.692 byte, JSON khớp bản gốc và SHA-256.
- Header `X-PTSCPS-SR7-Plugin-Profile: slim` chỉ xuất hiện ở request đã lọc.
- Header `X-PTSCPS-SR7-FastPath: static` không còn trên hai API.
- Cookie `wordpress_logged_in_*` (test cookie) được loại trừ khỏi bộ lọc.
- Trang chủ và `/wp-json/wp/v2/types/post` trả HTTP 200 và không áp dụng lọc.
- Mười lượt thử/nhóm sau chuyển: chờ phản hồi `slim=424,7ms`, `full=761,4ms` (giảm khoảng **44,2%**).

Kiểm thử chức năng với trình duyệt (Chrome không extension) được thực hiện riêng tại [workflow browser QA](https://github.com/webnvnesc/ptscps-com-vn/actions/workflows/ptscps-sr7-slim-browser-qa.yml).

## Rollback

Trước khi đổi: workflow lưu:
- `sr7-transition-before-root.htaccess`
- `sr7-transition-before-slim-loader.php`
- `sr7-transition-before-fastpath-sync.php`

Nếu kiểm thử sau deploy thất bại, workflow gọi [scripts/ptscps-sr7-slim-transition-rollback.py](../scripts/ptscps-sr7-slim-transition-rollback.py), khôi phục lại block rewrite FastPath, bản MU canary và đổi lại plugin đồng bộ cũ. Không dùng lệnh xóa toàn bộ cache hoặc thay đổi theme/Elementor.

**Lưu ý:** Mức cải thiện nêu trên chỉ là REST TTFB, không phải FCP/LCP hoặc PageSpeed. Nếu cập nhật Slider Revolution làm thay đổi plugin dependency, cần đối chiếu JSON và frontend trước khi nâng cấp.
