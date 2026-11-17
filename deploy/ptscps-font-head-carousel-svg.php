<?php
/**
 * Plugin Name: PTSCPS Google Font Hints + Customer Carousel SVG Trial
 * Description: Remove only unused Google Fonts preconnects and replace exactly two customer-carousel eicon arrows with inline SVG on the public homepage.
 * Version: 1.0.0
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/** Do not touch admin, Elementor editor, preview, AJAX, REST or feeds. */
function ptscps_font_svg_trial_public() {
    if ( is_admin() || is_feed() || is_preview() || wp_doing_ajax() ) {
        return false;
    }
    if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
        return false;
    }
    if ( function_exists( 'is_customize_preview' ) && is_customize_preview() ) {
        return false;
    }
    foreach ( array( 'elementor-preview', 'preview', 'vc_editable', 'customize_changeset_uuid' ) as $key ) {
        if ( isset( $_GET[ $key ] ) ) {
            return false;
        }
    }
    return true;
}

/**
 * Preconnects come from the WordPress resource hints pipeline.
 * Preserve every other domain and all dns-prefetch/preload entries.
 * If another plugin bypasses this filter, post-deploy QA will fail closed.
 */
add_filter( 'wp_resource_hints', static function ( $hints, $relation_type ) {
    if ( 'preconnect' !== $relation_type || ! ptscps_font_svg_trial_public() ) {
        return $hints;
    }
    return array_values( array_filter( $hints, static function ( $hint ) {
        $href = is_array( $hint ) ? ( isset( $hint['href'] ) ? $hint['href'] : '' ) : $hint;
        if ( ! is_string( $href ) ) {
            return true;
        }
        $parts = wp_parse_url( $href );
        $host = is_array( $parts ) && isset( $parts['host'] ) ? strtolower( $parts['host'] ) : '';
        return ! in_array( $host, array( 'fonts.googleapis.com', 'fonts.gstatic.com' ), true );
    } ) );
}, PHP_INT_MAX, 2 );

/**
 * Elementor's widget output filter keeps the same Swiper click/keyboard
 * handlers and parent aria-labels; only the decorative <i> becomes an SVG.
 * Restrict to the verified homepage image-carousel widget id ed1c7da.
 * Fail open (original HTML) if either icon or markup changes.
 */
add_filter( 'elementor/widget/render_content', static function ( $content, $widget ) {
    if ( ! ptscps_font_svg_trial_public() || ! is_front_page()
        || ! is_object( $widget ) || ! method_exists( $widget, 'get_id' )
        || 'ed1c7da' !== $widget->get_id()
        || ! is_string( $content )
        || false === strpos( $content, 'elementor-swiper-button-prev' )
        || false === strpos( $content, 'elementor-swiper-button-next' ) ) {
        return $content;
    }
    if ( 1 !== substr_count( $content, 'eicon-chevron-left' )
        || 1 !== substr_count( $content, 'eicon-chevron-right' ) ) {
        return $content;
    }
    $seen = array();
    $pattern = '~<i\b[^>]*\bclass\s*=\s*(["\'])[^"\']*\beicon-chevron-(left|right)\b[^"\']*\1[^>]*>\s*</i>~i';
    $replaced = preg_replace_callback( $pattern, static function ( $match ) use ( &$seen ) {
        $direction = strtolower( $match[2] );
        $seen[] = $direction;
        $points = 'left' === $direction ? '15 18 9 12 15 6' : '9 18 15 12 9 6';
        return '<svg xmlns="http://www.w3.org/2000/svg" class="ptscps-carousel-svg"'
            . ' aria-hidden="true" focusable="false" width="1em" height="1em"'
            . ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
            . ' stroke-linecap="round" stroke-linejoin="round">'
            . '<polyline points="' . $points . '"></polyline></svg>';
    }, $content, 2, $count );
    if ( 2 !== $count || count( $seen ) !== 2
        || ! in_array( 'left', $seen, true ) || ! in_array( 'right', $seen, true ) ) {
        return $content;
    }
    return is_string( $replaced ) ? $replaced : $content;
}, 99, 2 );

add_action( 'wp_head', static function () {
    if ( ! ptscps_font_svg_trial_public() || ! is_front_page() ) {
        return;
    }
    echo '<style id="ptscps-carousel-svg-style">'
       . '.elementor-element-ed1c7da .elementor-swiper-button .ptscps-carousel-svg'
       . '{display:block;width:1em;height:1em;flex:none;vertical-align:middle;pointer-events:none}'
       . '</style>' . "\n";
}, 99 );
