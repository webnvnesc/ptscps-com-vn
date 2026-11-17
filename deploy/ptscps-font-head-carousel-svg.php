<?php
/**
 * Plugin Name: PTSCPS Google Font Hints + Customer Carousel SVG Trial
 * Description: Remove only unused Google Fonts preconnects and replace exactly two customer-carousel eicon arrows with inline SVG on the public homepage.
 * Version: 1.0.1
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
 * The Google hints may be printed by Jannah/SEO code directly during wp_head,
 * not via wp_resource_hints. Restrict buffer to callbacks of wp_head only.
 * No full-page buffering and no changes to scripts, preloads or other hosts.
 */
add_action( 'wp_head', static function () {
    if ( ! ptscps_font_svg_trial_public() ) {
        return;
    }
    $GLOBALS['ptscps_google_hint_buffer_level'] = ob_get_level() + 1;
    ob_start();
}, -999999 );

add_action( 'wp_head', static function () {
    if ( ! isset( $GLOBALS['ptscps_google_hint_buffer_level'] )
        || ob_get_level() !== $GLOBALS['ptscps_google_hint_buffer_level'] ) {
        return;
    }
    unset( $GLOBALS['ptscps_google_hint_buffer_level'] );
    $head = ob_get_clean();
    // Remove exactly the preconnect tags, preserving DNS-prefetch and others.
    $head = preg_replace_callback( '~<link\b[^>]*>~i', static function ( $m ) {
        $tag = $m[0];
        if ( ! preg_match( '~\brel\s*=\s*(["\'])preconnect\1~i', $tag )
            || ! preg_match( '~\bhref\s*=\s*(["\'])([^"\']+)\1~i', $tag, $url ) ) {
            return $tag;
        }
        $parts = wp_parse_url( html_entity_decode( $url[2], ENT_QUOTES, 'UTF-8' ) );
        $host = is_array( $parts ) && isset( $parts['host'] ) ? strtolower( $parts['host'] ) : '';
        return in_array( $host, array( 'fonts.googleapis.com', 'fonts.gstatic.com' ), true ) ? '' : $tag;
    }, $head );
    echo $head;
}, 999999 );

/**
 * SVG as a CSS mask on the two proven customer carousel arrows.
 * No JS mutation and no Elementor widget filter that could be bypassed by cache.
 * The original aria-labelled button and keyboard handlers stay untouched.
 * The font glyph is replaced with an empty pseudo-element and SVG mask.
 * Scoped exclusively to the audited homepage carousel widget ID.
 */
add_action( 'wp_head', static function () {
    if ( ! ptscps_font_svg_trial_public() || ! is_front_page() ) {
        return;
    }
    echo '<meta name="ptscps-font-head-trial" content="1.0.1" />' . "\n";
    echo '<style id="ptscps-carousel-svg-style">'
       . '.elementor-element-ed1c7da .elementor-swiper-button i.eicon-chevron-left,'
       . '.elementor-element-ed1c7da .elementor-swiper-button i.eicon-chevron-right'
       . '{display:inline-flex;width:1em;height:1em;font-family:Arial,sans-serif!important}'
       . '.elementor-element-ed1c7da .elementor-swiper-button i.eicon-chevron-left:before,'
       . '.elementor-element-ed1c7da .elementor-swiper-button i.eicon-chevron-right:before'
       . '{content:""!important;display:block;width:1em;height:1em;'
       . 'background-color:currentColor;'
       . '-webkit-mask-position:center;-webkit-mask-repeat:no-repeat;-webkit-mask-size:contain;'
       . 'mask-position:center;mask-repeat:no-repeat;mask-size:contain;'
       . 'font-family:Arial,sans-serif!important}'
       . '.elementor-element-ed1c7da .elementor-swiper-button i.eicon-chevron-left:before'
       . '{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M15 18l-6-6 6-6%27 fill=%27none%27 stroke=%27black%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E");'
       . 'mask-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M15 18l-6-6 6-6%27 fill=%27none%27 stroke=%27black%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E")}'
       . '.elementor-element-ed1c7da .elementor-swiper-button i.eicon-chevron-right:before'
       . '{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M9 18l6-6-6-6%27 fill=%27none%27 stroke=%27black%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E");'
       . 'mask-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M9 18l6-6-6-6%27 fill=%27none%27 stroke=%27black%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E")}'
       . '</style>' . "\n";
}, 99 );
