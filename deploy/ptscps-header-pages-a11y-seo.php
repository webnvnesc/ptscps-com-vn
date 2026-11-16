<?php
/**
 * Plugin Name: PTSCPS Header Pages Accessibility and SEO
 * Description: Narrow fixes for audited header pages: meta descriptions, accessible image links, post-card heading/contrast, contact phone and missing main landmarks.
 * Version: 1.0.2
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

function ptscps_nav_a11y_path() {
    $request = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '/';
    $path = parse_url( $request, PHP_URL_PATH );
    if ( ! is_string( $path ) ) {
        return '/';
    }
    $path = rawurldecode( $path );
    return '/' === $path ? '/' : untrailingslashit( $path );
}

function ptscps_nav_a11y_supported() {
    static $paths = array(
        '/thu-ngo.htm', '/dich-vu', '/hseq', '/c/co-dong',
        '/c/co-dong/quan-he-co-dong', '/c/co-dong/bao-cao-tai-chinh',
        '/tin-tuc', '/c/tin-tuc/hoat-dong-cua-cong-ty',
        '/c/tin-tuc/dau-khi-trong-nuoc-va-khu-vuc', '/thu-vien-pps',
        '/thu-moi-chao-gia', '/tuyen-dung', '/lien-he', '/e'
    );
    return in_array( ptscps_nav_a11y_path(), $paths, true );
}

function ptscps_nav_a11y_frontend() {
    return ! is_admin() && ! is_preview() && ! is_feed()
        && ! isset( $_GET['elementor-preview'] )
        && ! isset( $_GET['customize_changeset_uuid'] )
        && ptscps_nav_a11y_supported();
}

/**
 * Fallback is deliberately limited to pages verified to lack SEO metadata.
 * Routes with an existing description (including Contact, Services, EN) are not touched.
 */
add_action( 'wp_head', static function () {
    if ( ! ptscps_nav_a11y_frontend() ) {
        return;
    }
    $descriptions = array(
        '/thu-ngo.htm' => 'Thư ngỏ của Công ty Cổ phần Dịch vụ Khai thác Dầu khí PTSC (PTSC PPS): định hướng phát triển, cam kết chất lượng và hợp tác cùng khách hàng.',
        '/hseq' => 'Tìm hiểu công tác HSEQ tại PTSC PPS, các cam kết về sức khỏe, an toàn, môi trường và chất lượng trong hoạt động dịch vụ dầu khí.',
        '/c/co-dong' => 'Thông tin dành cho cổ đông PTSC PPS: quan hệ cổ đông, công bố thông tin, báo cáo và các tài liệu quản trị doanh nghiệp.',
        '/c/co-dong/quan-he-co-dong' => 'Cập nhật thông tin quan hệ cổ đông của Công ty Cổ phần Dịch vụ Khai thác Dầu khí PTSC (PTSC PPS) và các tài liệu liên quan.',
        '/c/co-dong/bao-cao-tai-chinh' => 'Tổng hợp báo cáo tài chính và thông tin tài chính dành cho cổ đông của Công ty Cổ phần Dịch vụ Khai thác Dầu khí PTSC.',
        '/tin-tuc' => 'Tin tức và hoạt động mới nhất của PTSC PPS, cập nhật thông tin doanh nghiệp, dịch vụ kỹ thuật và ngành dầu khí.',
        '/c/tin-tuc/dau-khi-trong-nuoc-va-khu-vuc' => 'Cập nhật tin tức và diễn biến ngành dầu khí trong nước và khu vực từ Công ty Cổ phần Dịch vụ Khai thác Dầu khí PTSC.',
        '/thu-vien-pps' => 'Thư viện hình ảnh PTSC PPS với các hoạt động doanh nghiệp, sự kiện, công trình và hình ảnh tập thể người lao động.',
        '/thu-moi-chao-gia' => 'Theo dõi các thông báo thư mời chào giá và chào hàng của PTSC PPS cùng thông tin liên quan tới các gói mua sắm.',
        '/tuyen-dung' => 'Tìm hiểu cơ hội việc làm, thông tin tuyển dụng và các thông báo tuyển dụng nhân sự mới nhất tại PTSC PPS.'
    );
    $route = ptscps_nav_a11y_path();
    if ( ! isset( $descriptions[ $route ] ) ) {
        return;
    }
    echo '<meta name="description" content="' . esc_attr( $descriptions[ $route ] ) . '">' . "\n";
}, 5 );

/**
 * Correct only HTML emitted by Elementor; never alter the saved builder model.
 * Prevent duplicate attributes if content is processed by multiple filters.
 */
function ptscps_nav_a11y_content( $content ) {
    if ( ! ptscps_nav_a11y_frontend() || ! is_string( $content ) ) {
        return $content;
    }
    $route = ptscps_nav_a11y_path();

    if ( '/lien-he' === $route && false !== strpos( $content, '84.254.3511.019' ) ) {
        $content = preg_replace(
            '~\bhref\s*=\s*(["\'])http://\+84\.254\.3511\.019\1~i',
            'href="tel:+842543511019"',
            $content
        );
    }

    if ( false !== strpos( $content, 'data-elementor-open-lightbox' ) ) {
        $content = preg_replace_callback(
            '~<a\b[^>]*>~i',
            static function ( $m ) {
                $tag = $m[0];
                if ( false === strpos( $tag, 'data-elementor-open-lightbox' )
                    || preg_match( '~\b(?:aria-label|aria-labelledby)\s*=~i', $tag ) ) {
                    return $tag;
                }
                $label = '';
                if ( preg_match( '~\bdata-elementor-lightbox-title\s*=\s*(["\'])(.*?)\1~is', $tag, $name ) ) {
                    $label = trim( wp_strip_all_tags( html_entity_decode( $name[2], ENT_QUOTES, 'UTF-8' ) ) );
                }
                if ( '' === $label ) {
                    $label = 'hình ảnh';
                }
                return preg_replace( '~\s*/?>$~', ' aria-label="' . esc_attr( 'Xem hình ảnh: ' . $label ) . '">', $tag, 1 );
            },
            $content
        );
    }

    if ( in_array( $route, array( '/tuyen-dung', '/thu-moi-chao-gia' ), true )
        && false !== strpos( $content, 'elementor-post' ) ) {
        $content = preg_replace_callback(
            '~<article\b[^>]*\belementor-post\b[^>]*>[\s\S]*?</article>~i',
            static function ( $m ) {
                $article = $m[0];
                $title = '';
                if ( preg_match( '~<h[1-6]\b[^>]*\belementor-post__title\b[^>]*>([\s\S]*?)</h[1-6]>~i', $article, $t ) ) {
                    $title = trim( preg_replace( '/\s+/u', ' ', wp_strip_all_tags( $t[1] ) ) );
                }
                if ( $title ) {
                    $article = preg_replace_callback(
                        '~<a\b[^>]*\belementor-post__thumbnail__link\b[^>]*>~i',
                        static function ( $a ) use ( $title ) {
                            if ( preg_match( '~\b(?:aria-label|aria-labelledby)\s*=~i', $a[0] ) ) {
                                return $a[0];
                            }
                            return preg_replace( '~\s*/?>$~', ' aria-label="' . esc_attr( 'Xem bài viết: ' . $title ) . '">', $a[0], 1 );
                        },
                        $article,
                        1
                    );
                }
                // The page heading is H1; cards must follow with H2, not H3.
                $article = preg_replace_callback(
                    '~<h3\b([^>]*\belementor-post__title\b[^>]*)>([\s\S]*?)</h3>~i',
                    static function ( $h ) {
                        return '<h2' . $h[1] . '>' . $h[2] . '</h2>';
                    },
                    $article,
                    1
                );
                // Elementor emits inconsistent H3/H4 post-card titles on this
                // archive. Normalize all post-card titles to H2 below the page H1.
                if ( '/thu-moi-chao-gia' === ptscps_nav_a11y_path() ) {
                    $article = preg_replace_callback(
                        '~<h4\b([^>]*\belementor-post__title\b[^>]*)>([\s\S]*?)</h4>~i',
                        static function ( $h ) {
                            return '<h2' . $h[1] . '>' . $h[2] . '</h2>';
                        },
                        $article
                    );
                    // Other excerpt H4s belong below their article H2.
                    $article = preg_replace_callback(
                        '~<h4\b([^>]*)>([\s\S]*?)</h4>~i',
                        static function ( $h ) {
                            return '<h3' . $h[1] . '>' . $h[2] . '</h3>';
                        },
                        $article
                    );
                }
                return $article;
            },
            $content
        );
    }
    return $content;
}
add_filter(
    'elementor/widget/render_content',
    static function ( $content, $widget ) {
        if ( ! ptscps_nav_a11y_frontend() ) {
            return $content;
        }
        return ptscps_nav_a11y_content( $content );
    },
    40,
    2
);
add_filter( 'the_content', 'ptscps_nav_a11y_content', 9999, 1 );

/** Supply semantic, visually hidden H1 only where the audited page has none. */
add_action( 'wp_body_open', static function () {
    if ( ! ptscps_nav_a11y_frontend() ) {
        return;
    }
    $headings = array( '/hseq' => 'HSEQ', '/tin-tuc' => 'Tin tức' );
    $path = ptscps_nav_a11y_path();
    if ( isset( $headings[ $path ] ) ) {
        echo '<h1 class="ptscps-nav-accessible-h1">' . esc_html( $headings[ $path ] ) . '</h1>';
    }
}, 10 );

add_action( 'wp_head', static function () {
    if ( ! ptscps_nav_a11y_frontend() ) {
        return;
    }
    $route = ptscps_nav_a11y_path();
    echo '<style id="ptscps-header-pages-a11y-css">'
        . '.ptscps-nav-accessible-h1{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important;}';
    if ( in_array( $route, array( '/tuyen-dung', '/thu-moi-chao-gia' ), true ) ) {
        echo '.elementor-post__excerpt p{color:#525252!important;}';
    }
    if ( '/e' === $route ) {
        echo '.elementor-element-22a73b7>.elementor-widget-container,.elementor-element-ad5224b>.elementor-widget-container{background-color:#006ba4!important;}';
    }
    echo '</style>' . "\n";
}, 30 );

/**
 * Repair absent main landmark on 4 Jannah builder pages. On these pages the
 * content wrapper already exists, so adding a role does not change layout.
 * The script also applies exact accessible names as a fallback for cached
 * Elementor fragments. No network requests or new libraries.
 */
add_action( 'wp_footer', static function () {
    if ( ! ptscps_nav_a11y_frontend() ) {
        return;
    }
    $path = ptscps_nav_a11y_path();
    if ( ! in_array( $path, array(
        '/hseq', '/tin-tuc', '/dich-vu', '/lien-he', '/e',
        '/thu-ngo.htm', '/thu-vien-pps', '/tuyen-dung', '/thu-moi-chao-gia'
    ), true ) ) {
        return;
    }
    echo '<script id="ptscps-nav-a11y-fallback">(function(){'
        . 'if(!document.querySelector("main,[role=main]")){var c=document.getElementById("content");if(c)c.setAttribute("role","main");}'
        . 'var h=document.querySelector(".ptscps-nav-accessible-h1");var main=document.querySelector("#content[role=main]");if(h&&main)main.insertBefore(h,main.firstChild);'
        . 'document.querySelectorAll("a[data-elementor-open-lightbox]").forEach(function(a){'
        . 'if(a.hasAttribute("aria-label")||a.hasAttribute("aria-labelledby")||a.textContent.trim())return;'
        . 'var label=a.getAttribute("data-elementor-lightbox-title")||a.querySelector("img")?.getAttribute("alt")||"hình ảnh";'
        . 'a.setAttribute("aria-label","Xem hình ảnh: "+label);'
        . '});'
        . 'document.querySelectorAll("article.elementor-post").forEach(function(article){'
        . 'var a=article.querySelector("a.elementor-post__thumbnail__link");var t=article.querySelector(".elementor-post__title");'
        . 'if(a&&t&&!a.hasAttribute("aria-label"))a.setAttribute("aria-label","Xem bài viết: "+t.textContent.trim());'
        . '});'
        . 'document.querySelectorAll(".elementor-swiper-button[role=button]").forEach(function(el){'
        . 'if(el.hasAttribute("aria-label"))return;'
        . 'el.setAttribute("aria-label",el.classList.contains("elementor-swiper-button-prev")?"Previous slide":"Next slide");'
        . '});'
        . '})();</script>' . "\n";
}, 90 );
