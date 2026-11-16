<?php
/**
 * Plugin Name: PTSCPS SR7 REST Selective Plugin Loader
 * Description: Optimize only anonymous Slider Revolution 7 slide REST GET requests.
 * Version: 1.1.0
 *
 * Live mode for exact anonymous Slider Revolution REST routes.
 * Keep full WordPress core and Slider Revolution active. Never modify stored
 * active_plugins option or change WordPress admin/editor/preview requests.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

function ptscps_sr7_slim_target_request() {
    if ( 'GET' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
        return false;
    }
    $path = parse_url( $_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH );
    if ( ! is_string( $path ) || ! preg_match( '~^/wp-json/sliderrevolution/sliders/[1-9][0-9]*/?$~D', $path ) ) {
        return false;
    }
    // The additional parameter bypasses previously installed static rewrite.
    $engine = $_GET['srengine'] ?? '';
    $slide = $_GET['slideid'] ?? '';
    if ( ! is_scalar( $engine ) || '7' !== (string) $engine ||
         ! is_scalar( $slide ) || ! preg_match( '/^[1-9][0-9]{0,7}$/D', (string) $slide ) ) {
        return false;
    }
    // Do not affect logged-in users, credentials or editing/preview flows.
    if ( ! empty( $_SERVER['HTTP_AUTHORIZATION'] ) || ! empty( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ) ) {
        return false;
    }
    foreach ( $_COOKIE as $key => $value ) {
        if ( strncmp( (string) $key, 'wordpress_logged_in_', 18 ) === 0 ||
             strncmp( (string) $key, 'wordpress_sec_', 14 ) === 0 ) {
            return false;
        }
    }
    return true;
}
function ptscps_sr7_slim_enabled() {
    // Validated canary: JSON identical for both slides; anonymous GET only.
    return true;
}
add_filter( 'option_active_plugins', static function ( $plugins ) {
    if ( ! is_array( $plugins ) || ! ptscps_sr7_slim_target_request() || ! ptscps_sr7_slim_enabled() ) {
        return $plugins;
    }
    // Keep runtime, security and language dependencies. Rest/plugin settings
    // remain managed normally by WordPress. No global deactivation.
    $required = array(
        'revslider/revslider.php',
        'wordfence/wordfence.php',
        'polylang/polylang.php',
        'wp-super-cache/wp-cache.php',
    );
    if ( ! in_array( 'revslider/revslider.php', $plugins, true ) ) {
        return $plugins; // Fail open if SR7 was moved/renamed.
    }
    return array_values( array_intersect( $plugins, $required ) );
}, PHP_INT_MAX );
add_action( 'rest_api_init', static function () {
    if ( ptscps_sr7_slim_target_request() && ptscps_sr7_slim_enabled() ) {
        header( 'X-PTSCPS-SR7-Plugin-Profile: slim' );
    }
}, 1 );
