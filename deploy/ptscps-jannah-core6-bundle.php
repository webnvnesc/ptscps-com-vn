<?php
/**
 * Plugin Name: PTSCPS Reversible Jannah Core 6 CSS Bundle
 * Description: Replace exactly six adjacent unmodified Jannah stylesheets with an equivalent prebuilt bundle on public pages. Fail open if stylesheet order/URLs differ.
 * Version: 1.0.0
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
const PTSCPS_CORE6_HANDLES = array(
    'tie-css-base-css',
    'tie-css-styles-css',
    'tie-css-widgets-css',
    'tie-css-helpers-css',
    'tie-fontawesome5-css',
    'tie-css-ilightbox-css',
);
const PTSCPS_CORE6_FILENAME = 'ptscps-jannah-core6-20261117-v1.css';
const PTSCPS_CORE6_MANIFEST = 'ptscps-jannah-core6-20261117-v1.json';

function ptscps_core6_public_request() {
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
 * Font-head plugin currently buffers wp_head at priorities -999999 and 999999.
 * Nest our smaller wp_head buffer INSIDE that existing buffer, so both can run
 * without changing SVG/preconnect behavior or full-page markup.
 */
add_action( 'wp_head', static function () {
    if ( ! ptscps_core6_public_request() ) {
        return;
    }
    $GLOBALS['ptscps_core6_head_level'] = ob_get_level() + 1;
    ob_start();
}, -999998 );

add_action( 'wp_head', static function () {
    if ( ! isset( $GLOBALS['ptscps_core6_head_level'] )
        || ob_get_level() !== $GLOBALS['ptscps_core6_head_level'] ) {
        return;
    }
    unset( $GLOBALS['ptscps_core6_head_level'] );
    $original = ob_get_clean();
    $base = WP_CONTENT_DIR . '/themes/jannah-child/';
    $bundle_path = $base . PTSCPS_CORE6_FILENAME;
    $manifest_path = $base . PTSCPS_CORE6_MANIFEST;
    // Never replace working stylesheets with a missing/unfinished bundle.
    if ( ! is_file( $bundle_path ) || filesize( $bundle_path ) < 20000
        || ! is_file( $manifest_path ) ) {
        echo $original;
        return;
    }
    $manifest = json_decode( (string) file_get_contents( $manifest_path ), true );
    if ( ! is_array( $manifest ) || ( $manifest['version'] ?? '' ) !== '1.0.0'
        || ! isset( $manifest['sources'], $manifest['sha256'] )
        || ! is_array( $manifest['sources'] ) || count( $manifest['sources'] ) !== 6 ) {
        echo $original;
        return;
    }
    $sources = $manifest['sources'];
    $handles = PTSCPS_CORE6_HANDLES;
    $links = array();
    preg_match_all( '~<link\b[^>]*>~i', $original, $all, PREG_OFFSET_CAPTURE );
    foreach ( $all[0] as $index => $item ) {
        $tag = $item[0];
        if ( ! preg_match( '~\bid\s*=\s*(["\'])([^"\']+)\1~i', $tag, $id ) ) {
            continue;
        }
        if ( ! in_array( $id[2], $handles, true ) ) {
            continue;
        }
        if ( isset( $links[ $id[2] ] ) ) {
            // Duplicate handle means not safe to substitute.
            echo $original;
            return;
        }
        if ( ! preg_match( '~\brel\s*=\s*(["\'])stylesheet\1~i', $tag )
            || ! preg_match( '~\bhref\s*=\s*(["\'])([^"\']+)\1~i', $tag, $href ) ) {
            echo $original;
            return;
        }
        $media = '';
        if ( preg_match( '~\bmedia\s*=\s*(["\'])([^"\']+)\1~i', $tag, $m ) ) {
            $media = strtolower( trim( $m[2] ) );
        }
        if ( $media !== '' && $media !== 'all' ) {
            echo $original;
            return;
        }
        $actual_url = html_entity_decode( $href[2], ENT_QUOTES, 'UTF-8' );
        if ( ! isset( $sources[ $id[2] ] )
            || $actual_url !== $sources[ $id[2] ] ) {
            // Fail open after theme upgrade, changed CSS version or CDN rewrite.
            echo $original;
            return;
        }
        $links[ $id[2] ] = array(
            'tag' => $tag, 'offset' => $item[1], 'index' => $index,
        );
    }
    if ( count( $links ) !== 6 ) {
        echo $original;
        return;
    }
    $first = null;
    $previous = null;
    foreach ( $handles as $handle ) {
        $current = $links[ $handle ];
        if ( null === $first ) {
            $first = $current;
        } else {
            if ( $current['index'] !== $previous['index'] + 1 ) {
                echo $original;
                return;
            }
            $between = substr(
                $original,
                $previous['offset'] + strlen( $previous['tag'] ),
                $current['offset'] - $previous['offset'] - strlen( $previous['tag'] )
            );
            if ( preg_match( '~<\s*(?:style|link)\b~i', $between ) ) {
                echo $original;
                return;
            }
        }
        $previous = $current;
    }
    $url = content_url( '/themes/jannah-child/' . PTSCPS_CORE6_FILENAME );
    $url = add_query_arg( 'v', substr( $manifest['sha256'], 0, 12 ), $url );
    $replacement = '<link rel="stylesheet" id="ptscps-jannah-core6-css" href="'
        . esc_url( $url ) . '" media="all" data-ptscps-css-core6="1">';
    // Replace from right to left to avoid invalidating earlier offsets.
    for ( $i = count( $handles ) - 1; $i >= 0; $i-- ) {
        $found = $links[ $handles[ $i ] ];
        $original = substr_replace(
            $original, $i === 0 ? $replacement : '',
            $found['offset'], strlen( $found['tag'] )
        );
    }
    echo $original;
    echo "\n" . '<meta name="ptscps-core6-trial" content="1.0.0" />' . "\n";
}, 999998 );
