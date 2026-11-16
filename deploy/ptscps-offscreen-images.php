<?php
/**
 * Plugin Name: PTSCPS Offscreen Image Loading
 * Description: Constrained loading for offscreen Elementor partner logos and Jannah archive thumbnails.
 * Version: 1.0.0
 *
 * This mu-plugin is independent of Elementor and Jannah theme files.
 * Existing content, editor data, SR7 images, and WordPress attachment files remain unchanged.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Only the offscreen homepage Elementor Image Carousel uses this hook.
 * Do not alter sliders (SR7), other Elementor widgets, logged-in editing, or
 * the first image visible in the viewport.
 */
add_filter(
    'elementor/widget/render_content',
    static function ( $content, $widget ) {
        if ( is_admin() || is_preview() || ! is_front_page() ||
            isset( $_GET['elementor-preview'] ) || ! is_object( $widget ) ||
            ! method_exists( $widget, 'get_name' ) ||
            'image-carousel' !== $widget->get_name() ||
            false === strpos( $content, 'swiper-slide-image' )
        ) {
            return $content;
        }

        // Only image sources that were verified to exist with a real HTTP 200
        // in the pre-deploy audit. Do not touch original attachment metadata.
        $variants = array(
            '2222221z5245174915163_4145568119040ed86e3b35d70f0b52ca-scaled.jpg' => array(
                'file' => '2222221z5245174915163_4145568119040ed86e3b35d70f0b52ca-768x289.jpg',
                'width' => 768,
            ),
            '333333z5245174082713_4252facd17ae73b1c1d1864970e283b0-scaled.jpg' => array(
                'file' => '333333z5245174082713_4252facd17ae73b1c1d1864970e283b0-1024x354.jpg',
                'width' => 1024,
            ),
        );

        return preg_replace_callback(
            '~<img\b[^>]*>~i',
            static function ( $match ) use ( $variants ) {
                $tag = $match[0];
                if ( ! preg_match( '~\bclass\s*=\s*(["\'])(.*?)\1~is', $tag, $classes ) ||
                    ! preg_match( '~(?:^|\s)swiper-slide-image(?:\s|$)~', $classes[2] )
                ) {
                    return $tag;
                }
                if ( ! preg_match( '~\bloading\s*=~i', $tag ) ) {
                    $tag = preg_replace( '~\s*/?>$~', ' loading="lazy" />', $tag, 1 );
                }
                if ( ! preg_match( '~\bsrc\s*=\s*(["\'])(.*?)\1~is', $tag, $src_match ) ) {
                    return $tag;
                }
                $src = html_entity_decode( $src_match[2], ENT_QUOTES, 'UTF-8' );
                $url = wp_parse_url( $src );
                if ( ! is_array( $url ) || empty( $url['path'] ) ) {
                    return $tag;
                }
                $original_file = basename( $url['path'] );
                if ( ! isset( $variants[ $original_file ] ) ||
                    false === strpos( $url['path'], '/wp-content/uploads/2024/04/' )
                ) {
                    return $tag;
                }
                $variant = $variants[ $original_file ];
                $smaller = str_replace( $original_file, $variant['file'], $src );
                if ( $smaller === $src ) {
                    return $tag;
                }
                // Maintain srcset fallback for larger screen/pixel-density cases.
                $replacement = 'src="' . esc_url( $smaller ) . '"';
                $tag = str_replace( $src_match[0], $replacement, $tag );
                if ( ! preg_match( '~\bsrcset\s*=~i', $tag ) ) {
                    $tag = preg_replace(
                        '~\s*/?>$~',
                        ' srcset="' . esc_url( $smaller ) . ' ' . intval( $variant['width'] ) . 'w, ' .
                            esc_url( $src ) . ' 2560w" sizes="(max-width: 767px) 76vw, (max-width: 1199px) 240px, 176px" />',
                        $tag,
                        1
                    );
                }
                return $tag;
            },
            $content
        );
    },
    20,
    2
);

/**
 * Jannah listing thumbnails are rendered by get_the_post_thumbnail.
 * Preserve the first 6 (top rows); defer remaining category thumbnails.
 * This does not touch single-post featured images or unrelated widgets.
 */
add_filter(
    'post_thumbnail_html',
    static function ( $html, $post_id, $post_thumbnail_id, $size, $attr ) {
        static $archive_seen = 0;
        if ( is_admin() || is_preview() || ! is_category() ||
            empty( $html ) || 'jannah-image-large' !== $size ||
            false === strpos( $html, 'wp-post-image' )
        ) {
            return $html;
        }
        ++$archive_seen;
        if ( $archive_seen <= 6 || preg_match( '~\bloading\s*=~i', $html ) ) {
            return $html;
        }
        return preg_replace( '~<img\b~i', '<img loading="lazy"', $html, 1 );
    },
    20,
    5
);
