<?php
/**
 * Plugin Name: PTSCPS Public Accessibility and SEO Fixes
 * Description: Narrow front-end ARIA, heading, contrast, touch-target and missing meta-description improvements without editing Elementor content or Jannah source.
 * Version: 1.0.0
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/** Do not alter Elementor editor, WordPress admin, or a preview. */
function ptscps_a11y_seo_public_view() {
    return ! is_admin() && ! is_preview()
        && ! is_user_logged_in()
        && ! isset( $_GET['elementor-preview'] );
}

/**
 * Name image-box image-only anchors using the corresponding visible widget title.
 * It leaves image alt/size/loading/src/srcset and the Elementor content model intact.
 * The widget hook handles regular renders; the_content covers cached Elementor markup.
 */
function ptscps_a11y_seo_html( $html ) {
    if ( ! is_string( $html ) || ! ptscps_a11y_seo_public_view() ) {
        return $html;
    }

    if ( false !== strpos( $html, 'elementor-image-box-img' )
        && false !== strpos( $html, 'elementor-image-box-title' ) ) {
        $html = preg_replace_callback(
            '~(?P<figure><figure\b[^>]*\belementor-image-box-img\b[^>]*>[\s\S]*?</figure>)(?P<between>[\s\S]{0,1600}?)(?P<title><(?:p|h[1-6])\b[^>]*\belementor-image-box-title\b[^>]*>[\s\S]*?</(?:p|h[1-6])>)~i',
            static function ( $m ) {
                $label = trim( preg_replace( '/\s+/u', ' ', wp_strip_all_tags( $m['title'] ) ) );
                if ( '' === $label ) {
                    return $m[0];
                }
                $figure = preg_replace_callback(
                    '~<a\b[^>]*>~i',
                    static function ( $anchor ) use ( $label ) {
                        if ( preg_match( '~\baria-label\s*=|\baria-labelledby\s*=~i', $anchor[0] ) ) {
                            return $anchor[0];
                        }
                        return substr_replace(
                            $anchor[0],
                            ' aria-label="' . esc_attr( $label ) . '"',
                            -1,
                            0
                        );
                    },
                    $m['figure'],
                    1
                );
                return $figure . $m['between'] . $m['title'];
            },
            $html
        );
    }

    // Elementor Posts sometimes injects an invalid listitem role on <article>.
    // Keep the article landmark semantics and all its contents/classes unchanged.
    if ( false !== strpos( $html, 'elementor-post' ) ) {
        $html = preg_replace_callback(
            '~<article\b[^>]*\belementor-post\b[^>]*>~i',
            static function ( $m ) {
                return preg_replace( '~\s+role\s*=\s*(["\'])listitem\1~i', '', $m[0] );
            },
            $html
        );
    }

    // Merge two adjacent links to the same URL: "Xem tất cả" + " »".
    // Both remain editable as originally authored in Elementor; output gets one
    // accessible 24px+ link with the visually identical chevron.
    if ( false !== strpos( $html, 'Xem tất cả' ) ) {
        $html = preg_replace_callback(
            '~(?P<first><a\b[^>]*>\s*Xem\s+tất\s+cả\s*</a>)(?P<gap>\s*)(?P<second><a\b[^>]*>\s*»\s*</a>)~iu',
            static function ( $m ) {
                if ( ! preg_match( '~\bhref\s*=\s*(["\'])(.*?)\1~is', $m['first'], $a )
                    || ! preg_match( '~\bhref\s*=\s*(["\'])(.*?)\1~is', $m['second'], $b )
                    || html_entity_decode( $a[2], ENT_QUOTES, 'UTF-8' )
                    !== html_entity_decode( $b[2], ENT_QUOTES, 'UTF-8' ) ) {
                    return $m[0];
                }
                return preg_replace(
                    '~</a>$~i',
                    ' <span aria-hidden="true">»</span></a>',
                    $m['first']
                );
            },
            $html
        );
    }
    return $html;
}

add_filter(
    'elementor/widget/render_content',
    static function ( $content, $widget ) {
        if ( ! ptscps_a11y_seo_public_view() || ! is_object( $widget )
            || ! method_exists( $widget, 'get_name' ) ) {
            return $content;
        }
        if ( ! in_array( $widget->get_name(), array( 'image-box', 'posts', 'archive-posts', 'text-editor' ), true ) ) {
            return $content;
        }
        return ptscps_a11y_seo_html( $content );
    },
    25,
    2
);
add_filter( 'the_content', 'ptscps_a11y_seo_html', 9998, 1 );

/**
 * Fallback SEO descriptions when no dedicated SEO plugin is managing metadata.
 * Never output a duplicate if a known SEO plugin is loaded.
 */
add_action(
    'wp_head',
    static function () {
        if ( is_admin() || is_preview() || is_feed() || is_404()
            || isset( $_GET['elementor-preview'] )
            || defined( 'WPSEO_VERSION' ) || defined( 'RANK_MATH_VERSION' )
            || defined( 'AIOSEO_VERSION' ) || function_exists( 'aioseo' ) ) {
            return;
        }

        $description = '';
        if ( is_front_page() ) {
            $description = 'Công ty Cổ phần Dịch vụ Khai thác Dầu khí PTSC (PTSC PPS) cung cấp dịch vụ vận hành, bảo dưỡng FPSO, FSO, MOPU và các công trình dầu khí.';
        } elseif ( is_page() || is_single() ) {
            $object = get_queried_object();
            if ( $object instanceof WP_Post ) {
                $excerpt = trim( wp_strip_all_tags( strip_shortcodes( (string) $object->post_excerpt ) ) );
                if ( $excerpt ) {
                    $description = $excerpt;
                } elseif ( 'dich-vu' === $object->post_name ) {
                    $description = 'Khám phá các dịch vụ của PTSC PPS: vận hành và bảo dưỡng FPSO/FSO/MOPU, cung ứng nhân lực kỹ thuật, thiết kế, mua sắm, gia công và sửa chữa công nghiệp.';
                } elseif ( 'lien-he' === $object->post_name ) {
                    $description = 'Liên hệ Công ty Cổ phần Dịch vụ Khai thác Dầu khí PTSC (PTSC PPS) để tìm hiểu các dịch vụ, giải pháp và thông tin hợp tác trong lĩnh vực dầu khí.';
                } else {
                    $description = get_the_title( $object ) . ' - Công ty Cổ phần Dịch vụ Khai thác Dầu khí PTSC (PTSC PPS).';
                }
            }
        } elseif ( is_category() || is_tag() || is_tax() ) {
            $term = get_queried_object();
            if ( $term instanceof WP_Term ) {
                $description = trim( wp_strip_all_tags( (string) $term->description ) );
                if ( ! $description ) {
                    $description = 'Thông tin và bài viết về ' . $term->name . ' từ Công ty Cổ phần Dịch vụ Khai thác Dầu khí PTSC (PTSC PPS).';
                }
            }
        }

        $description = trim( preg_replace( '/\s+/u', ' ', wp_strip_all_tags( $description ) ) );
        if ( '' === $description ) {
            return;
        }
        if ( function_exists( 'mb_substr' ) ) {
            $description = mb_substr( $description, 0, 160, 'UTF-8' );
        } else {
            $description = substr( $description, 0, 160 );
        }
        echo '<meta name="description" content="' . esc_attr( $description ) . '">' . "\n";
    },
    3
);

/**
 * Home service cards have pale backgrounds with white text.
 * Change only the two failing backgrounds; leave geometry & Elementor data alone.
 *  #006ba4 / white has >=5.7:1 contrast. Dates #686868 / white >=5.5:1.
 */
add_action(
    'wp_head',
    static function () {
        if ( ! ptscps_a11y_seo_public_view() ) {
            return;
        }
        echo '<style id="ptscps-a11y-seo-style">'
            . 'body.home .elementor-element-caa4541>.elementor-widget-container,'
            . 'body.home .elementor-element-f91c48b>.elementor-widget-container'
            . '{background-color:#006ba4!important;}'
            . '.elementor-post__meta-data .elementor-post-date{color:#686868!important;}'
            . 'body.page .elementor-widget-image-box:not(.banner-home) .elementor-image-box-title a'
            . '{color:#286d92;}'
            . '</style>' . "\n";
    },
    30
);

/**
 * Jannah outputs one empty, zero-height widget title in the top stream area.
 * Mark only empty headings hidden after render; non-empty widget titles are untouched.
 */
add_action(
    'wp_footer',
    static function () {
        if ( ! ptscps_a11y_seo_public_view() ) {
            return;
        }
        echo '<script id="ptscps-empty-title-a11y">'
            . 'document.querySelectorAll(".stream-item-top .sc-widget > h3.widget-title").forEach(function(el){'
            . 'if(!el.textContent.trim() && !el.querySelector("img,svg")){el.hidden=true;el.setAttribute("aria-hidden","true");}'
            . '});'
            . '</script>';
    },
    100
);
