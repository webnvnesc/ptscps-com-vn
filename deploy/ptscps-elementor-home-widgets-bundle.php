<?php
/**
 * Plugin Name: PTSCPS Reversible Homepage Elementor Widget CSS Bundle
 * Description: Merge only the 10 adjacent Elementor/Swiper widget styles used on the homepage. Original links remain the safe fallback.
 * Version: 1.0.0
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
const PTSCPS_EHW_HANDLES = array(
    'widget-image-css',
    'widget-image-box-css',
    'widget-heading-css',
    'widget-spacer-css',
    'widget-divider-css',
    'widget-posts-css',
    'e-motion-fx-css',
    'swiper-css',
    'e-swiper-css',
    'widget-image-carousel-css',
);
const PTSCPS_EHW_BUNDLE = 'ptscps-elementor-home-widgets-20261117-v1.css';
const PTSCPS_EHW_MANIFEST = 'ptscps-elementor-home-widgets-20261117-v1.json';

function ptscps_ehw_is_public_home() {
    if ( is_admin() || is_feed() || is_preview() || wp_doing_ajax() || ! is_front_page() || is_paged() ) {
        return false;
    }
    if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
        return false;
    }
    if ( function_exists( 'is_customize_preview' ) && is_customize_preview() ) {
        return false;
    }
    // Native Elementor editing/preview and customizer are never modified.
    foreach ( array( 'elementor-preview', 'preview', 'vc_editable', 'customize_changeset_uuid' ) as $key ) {
        if ( isset( $_GET[ $key ] ) ) {
            return false;
        }
    }
    return true;
}

// Nested within the pre-existing font-head (-999999...999999) and
// Jannah core6 (-999998...999998) buffers without changing either behavior.
add_action( 'wp_head', static function () {
    if ( ! ptscps_ehw_is_public_home() ) {
        return;
    }
    $GLOBALS['ptscps_ehw_head_level'] = ob_get_level() + 1;
    ob_start();
}, -999997 );

add_action( 'wp_head', static function () {
    if ( ! isset( $GLOBALS['ptscps_ehw_head_level'] )
        || ob_get_level() !== $GLOBALS['ptscps_ehw_head_level'] ) {
        return;
    }
    unset( $GLOBALS['ptscps_ehw_head_level'] );
    $html = ob_get_clean();
    $base = WP_CONTENT_DIR . '/themes/jannah-child/';
    $bundle = $base . PTSCPS_EHW_BUNDLE;
    $manifest_file = $base . PTSCPS_EHW_MANIFEST;
    if ( ! is_file( $bundle ) || filesize( $bundle ) < 10000 || ! is_file( $manifest_file ) ) {
        echo $html;
        return;
    }
    $manifest = json_decode( (string) file_get_contents( $manifest_file ), true );
    if ( ! is_array( $manifest ) || ( $manifest['version'] ?? '' ) !== '1.0.0'
        || ! isset( $manifest['sha256'], $manifest['sources'], $manifest['bytes'] )
        || ! is_array( $manifest['sources'] ) || count( $manifest['sources'] ) !== count( PTSCPS_EHW_HANDLES )
        || ! is_string( $manifest['sha256'] )
        || ! preg_match( '/^[a-f0-9]{64}$/', $manifest['sha256'] )
        || (int) $manifest['bytes'] !== filesize( $bundle ) ) {
        echo $html;
        return;
    }

    // Limit matching to parsed tag boundaries and retain the precise CSS cascade.
    preg_match_all( '~<(?:link|style|script)\b[^>]*>~i', $html, $tags, PREG_OFFSET_CAPTURE );
    $links = array();
    foreach ( $tags[0] as $index => $tag_data ) {
        $tag = $tag_data[0];
        if ( ! preg_match( '~^<link\b~i', $tag ) ) {
            continue;
        }
        if ( ! preg_match( '~(?:\s)id\s*=\s*(["\'])([^"\']+)\1~i', $tag, $id )
            || ! in_array( $id[2], PTSCPS_EHW_HANDLES, true ) ) {
            continue;
        }
        if ( isset( $links[ $id[2] ] )
            || ! preg_match( '~(?:\s)rel\s*=\s*(["\'])stylesheet\1~i', $tag )
            || ! preg_match( '~(?:\s)href\s*=\s*(["\'])([^"\']+)\1~i', $tag, $href ) ) {
            echo $html;
            return;
        }
        $media = 'all';
        if ( preg_match( '~(?:\s)media\s*=\s*(["\'])([^"\']+)\1~i', $tag, $m ) ) {
            $media = strtolower( trim( $m[2] ) );
        }
        $url = html_entity_decode( $href[2], ENT_QUOTES, 'UTF-8' );
        if ( $media !== 'all' || ! isset( $manifest['sources'][ $id[2] ] )
            || $url !== $manifest['sources'][ $id[2] ] ) {
            echo $html;
            return;
        }
        $links[ $id[2] ] = array(
            'tag' => $tag, 'index' => $index, 'at' => $tag_data[1],
        );
    }
    if ( count( $links ) !== count( PTSCPS_EHW_HANDLES ) ) {
        echo $html;
        return;
    }

    $last = null;
    foreach ( PTSCPS_EHW_HANDLES as $handle ) {
        $item = $links[ $handle ];
        // Must be consecutively linked with no inline <style>, JS or other <link>.
        if ( null !== $last && $item['index'] !== $last['index'] + 1 ) {
            echo $html;
            return;
        }
        $last = $item;
    }
    $uri = add_query_arg(
        'v',
        substr( $manifest['sha256'], 0, 12 ),
        content_url( '/themes/jannah-child/' . PTSCPS_EHW_BUNDLE )
    );
    $replacement = '<link rel="stylesheet" id="ptscps-elementor-home-widgets-css" href="'
        . esc_url( $uri ) . '" media="all" data-ptscps-ehw="1">';
    for ( $i = count( PTSCPS_EHW_HANDLES ) - 1; $i >= 0; $i-- ) {
        $entry = $links[ PTSCPS_EHW_HANDLES[ $i ] ];
        $html = substr_replace(
            $html,
            $i === 0 ? $replacement : '',
            $entry['at'],
            strlen( $entry['tag'] )
        );
    }
    echo $html;
    echo "\n" . '<meta name="ptscps-elementor-home-widgets-trial" content="1.0.0" />' . "\n";
}, 999997 );
