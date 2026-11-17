<?php
/**
 * Plugin Name: PTSCPS SR7 First Slide CSS Poster
 * Description: Render the first current Slider Revolution banner image as CSS immediately, with a no-JS fallback.
 * Version: 1.0.1
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
function ptscps_sr7_poster_allowed() {
    return is_front_page() && ! is_admin() && ! is_feed()
        && ! is_preview() && ! ( function_exists( 'is_customize_preview' ) && is_customize_preview() )
        && ! isset( $_GET['elementor-preview'] )
        && ! isset( $_GET['customize_changeset_uuid'] );
}
/**
 * Elementor emits the native <sr7-module> markup. Its first <sr7-slide>
 * already has a <noscript><img src=...> managed by Slider Revolution.
 * Read that source from the actual rendered widget: no duplicated slides,
 * hard-coded image URL, REST call or database query.
 */
function ptscps_sr7_poster_widget( $html, $widget ) {
    if ( ! ptscps_sr7_poster_allowed() || ! is_string( $html )
        || false === strpos( $html, '<sr7-module' )
        || false === strpos( $html, '<sr7-slide' )
        ) {
        return $html;
    }
    if ( ! preg_match( '~<sr7-module\b[^>]*\bdata-id="1"[^>]*>~i', $html, $module, PREG_OFFSET_CAPTURE ) ) {
        return $html;
    }
    $tag = $module[0][0];
    $offset = $module[0][1];
    if ( preg_match( '~\bstyle\s*=~i', $tag ) || preg_match( '~\bdata-ptscps-poster\s*=~i', $tag ) ) {
        return $html; // Fail open on an unexpected custom layout.
    }
    $rest = substr( $html, $offset + strlen( $tag ) );
    if ( ! preg_match( '~<sr7-slide\b[^>]*>([\s\S]*?)</sr7-slide>~i', $rest, $first ) ) {
        return $html;
    }
    if ( ! preg_match( '~<sr7-bg\b[^>]*>\s*<noscript>\s*<img\b[^>]*\bsrc\s*=\s*(["\'])(.*?)\1~i', $first[1], $image ) ) {
        return $html; // No static background on first slide: don't guess.
    }
    $src = html_entity_decode( $image[2], ENT_QUOTES, 'UTF-8' );
    if ( strpos( $src, '//' ) === 0 ) {
        $src = 'https:' . $src;
    }
    $parts = wp_parse_url( $src );
    $origin = wp_parse_url( home_url( '/' ) );
    if ( ! is_array( $parts ) || ! is_array( $origin )
        || strtolower( $parts['host'] ?? '' ) !== strtolower( $origin['host'] ?? '' )
        || ( $parts['scheme'] ?? '' ) !== 'https'
        || empty( $parts['path'] )
        || false === strpos( $parts['path'], '/wp-content/uploads/' )
        || ! preg_match( '~\.(?:jpe?g|png|webp|avif)$~i', $parts['path'] ) ) {
        return $html;
    }
    $url = esc_url( $src );
    if ( ! $url ) {
        return $html;
    }
    $style = 'background-image:url(\'' . $url . '\');'
        . 'background-position:center center;background-size:cover;background-repeat:no-repeat;';
    $new = substr( $tag, 0, -1 )
        . ' data-ptscps-poster="' . esc_attr( $src ) . '"'
        . ' style="' . esc_attr( $style ) . '">';
    return substr_replace( $html, $new, $offset, strlen( $tag ) );
}
add_filter( 'elementor/widget/render_content', 'ptscps_sr7_poster_widget', 20, 2 );
// Slider Revolution's Elementor widget can print its shortcode output outside
// the widget render_content return buffer. Parse the final Elementor/page content
// as well, while keeping the transformation idempotent via the poster marker.
add_filter( 'the_content', static function ( $html ) {
    return ptscps_sr7_poster_widget( $html, null );
}, PHP_INT_MAX );
add_filter( 'elementor/frontend/the_content', static function ( $html ) {
    return ptscps_sr7_poster_widget( $html, null );
}, PHP_INT_MAX );

/**
 * A banner image or slide order change must invalidate WordPress HTML cache.
 * A native WPSC purge runs only after an SR7 content mutation in WP admin.
 * The existing SR7 static-REST FastPath invalidator remains unchanged.
 */
function ptscps_sr7_poster_invalidate_cache() {
    if ( ! is_admin() ) {
        return;
    }
    static $scheduled = false;
    if ( $scheduled ) {
        return;
    }
    $scheduled = true;
    add_action( 'shutdown', static function () {
        if ( function_exists( 'wp_cache_clear_cache' ) ) {
            wp_cache_clear_cache();
        }
    }, PHP_INT_MAX );
}
foreach ( array(
    'revslider_save_slider_v7',
    'save_slide_v7',
    'revslider_slide_updateSlideFromData_post',
    'revslider_slide_deleteSlide',
    'revslider_slider_on_delete_slider',
    'revslider_slide_updateSlide',
    'revslider_slider_update_slider',
) as $action ) {
    add_action( $action, 'ptscps_sr7_poster_invalidate_cache', 20, 0 );
}
