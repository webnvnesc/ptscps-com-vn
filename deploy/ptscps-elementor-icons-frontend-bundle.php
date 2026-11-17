<?php
/**
 * Plugin Name: PTSCPS Reversible Elementor Icons and Frontend CSS Bundle
 * Description: Merge only the two adjacent Elementor icon and frontend styles. Original links remain the safe fallback.
 * Version: 1.0.0
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
const PTSCPS_EIF_HANDLES = array(
    'elementor-icons-css',
    'elementor-frontend-css',
);
const PTSCPS_EIF_BUNDLE = 'ptscps-elementor-icons-frontend-20261118-v1.css';
const PTSCPS_EIF_MANIFEST = 'ptscps-elementor-icons-frontend-20261118-v1.json';

function ptscps_eif_is_public_html() {
    if ( is_admin() || is_feed() || is_preview() || wp_doing_ajax()  ) {
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
    if ( ! ptscps_eif_is_public_html() ) {
        return;
    }
    $GLOBALS['ptscps_eif_head_level'] = ob_get_level() + 1;
    ob_start();
}, -999996 );

add_action( 'wp_head', static function () {
    if ( ! isset( $GLOBALS['ptscps_eif_head_level'] )
        || ob_get_level() !== $GLOBALS['ptscps_eif_head_level'] ) {
        return;
    }
    unset( $GLOBALS['ptscps_eif_head_level'] );
    $html = ob_get_clean();
    $base = WP_CONTENT_DIR . '/themes/jannah-child/';
    $bundle = $base . PTSCPS_EIF_BUNDLE;
    $manifest_file = $base . PTSCPS_EIF_MANIFEST;
    if ( ! is_file( $bundle ) || filesize( $bundle ) < 25000 || ! is_file( $manifest_file ) ) {
        echo $html;
        return;
    }
    $manifest = json_decode( (string) file_get_contents( $manifest_file ), true );
    if ( ! is_array( $manifest ) || ( $manifest['version'] ?? '' ) !== '1.0.0'
        || ! isset( $manifest['sha256'], $manifest['sources'], $manifest['bytes'] )
        || ! is_array( $manifest['sources'] ) || count( $manifest['sources'] ) !== count( PTSCPS_EIF_HANDLES )
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
            || ! in_array( $id[2], PTSCPS_EIF_HANDLES, true ) ) {
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
    if ( count( $links ) !== count( PTSCPS_EIF_HANDLES ) ) {
        echo $html;
        return;
    }

    $last = null;
    foreach ( PTSCPS_EIF_HANDLES as $handle ) {
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
        content_url( '/themes/jannah-child/' . PTSCPS_EIF_BUNDLE )
    );
    $replacement = '<link rel="stylesheet" id="ptscps-elementor-icons-frontend-css" href="'
        . esc_url( $uri ) . '" media="all" data-ptscps-eif="1">';
    for ( $i = count( PTSCPS_EIF_HANDLES ) - 1; $i >= 0; $i-- ) {
        $entry = $links[ PTSCPS_EIF_HANDLES[ $i ] ];
        $html = substr_replace(
            $html,
            $i === 0 ? $replacement : '',
            $entry['at'],
            strlen( $entry['tag'] )
        );
    }
    echo $html;
    echo "\n" . '<meta name="ptscps-elementor-icons-frontend-trial" content="1.0.0" />' . "\n";
}, 999996 );
