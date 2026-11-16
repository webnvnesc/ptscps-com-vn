<?php
/**
 * Plugin Name: PTSCPS Slider Revolution 7 Static FastPath Synchronizer
 * Description: Invalidates and regenerates only anonymous public slider 1 slides 2/3 when Slider Revolution content is saved.
 * Version: 1.0.0
 *
 * The Apache rewrite rule serves the validated public JSON files without WordPress
 * for anonymous GET/HEAD requests. This MU plugin runs only when WordPress runs.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

if ( ! function_exists( 'ptscps_sr7_fp_directory' ) ) {
    function ptscps_sr7_fp_directory() {
        return ABSPATH . '_ptscps-sr7-fastpath';
    }
}

if ( ! function_exists( 'ptscps_sr7_fp_paths' ) ) {
    function ptscps_sr7_fp_paths() {
        $dir = ptscps_sr7_fp_directory();
        return array(
            2 => $dir . '/slide-2.json',
            3 => $dir . '/slide-3.json',
        );
    }
}

/**
 * Called by Slider Revolution content mutation actions. Remove old JSON
 * immediately so a failed refresh can NEVER leave a stale static response.
 */
if ( ! function_exists( 'ptscps_sr7_fp_invalidate' ) ) {
    function ptscps_sr7_fp_invalidate() {
        static $registered = false;
        if ( $registered ) {
            return;
        }
        $registered = true;
        foreach ( ptscps_sr7_fp_paths() as $path ) {
            if ( is_file( $path ) ) {
                @unlink( $path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
            }
        }
        add_action( 'shutdown', 'ptscps_sr7_fp_refresh', PHP_INT_MAX );
    }
}

if ( ! function_exists( 'ptscps_sr7_fp_refresh' ) ) {
    function ptscps_sr7_fp_refresh() {
        $paths = ptscps_sr7_fp_paths();
        $directory = ptscps_sr7_fp_directory();
        if ( ! is_dir( $directory ) || ! is_writable( $directory ) ) {
            error_log( 'PTSCPS SR7 FastPath: directory unavailable for refresh' );
            return;
        }
        foreach ( $paths as $slide_id => $path ) {
            // Extra query parameter intentionally bypasses the strict Apache
            // FastPath rewrite; the native SR7 route returns the fresh payload.
            $url = home_url(
                '/wp-json/sliderrevolution/sliders/1?srengine=7&slideid=' .
                $slide_id . '&ptscps_sr7_refresh=' . time()
            );
            $response = wp_remote_get(
                $url,
                array(
                    'timeout'     => 14,
                    'redirection' => 0,
                    'headers'     => array(
                        'Accept'        => 'application/json',
                        'Cache-Control' => 'no-cache',
                    ),
                )
            );
            if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
                error_log( 'PTSCPS SR7 FastPath: native refresh failed for slide ' . $slide_id );
                continue;
            }
            $body = wp_remote_retrieve_body( $response );
            if ( ! is_string( $body ) || strlen( $body ) < 100 || strlen( $body ) > 100000 ) {
                continue;
            }
            $decoded = json_decode( $body, true );
            if ( ! is_array( $decoded )
                || empty( $decoded['success'] )
                || ! isset( $decoded['slides'] )
                || ! is_array( $decoded['slides'] )
                || ! array_key_exists( 'addOns', $decoded )
            ) {
                error_log( 'PTSCPS SR7 FastPath: invalid native JSON for slide ' . $slide_id );
                continue;
            }
            $temporary = $directory . '/.slide-' . $slide_id . '-' . wp_generate_password( 12, false ) . '.tmp';
            if ( strlen( $body ) !== @file_put_contents( $temporary, $body, LOCK_EX ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
                @unlink( $temporary ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
                continue;
            }
            @chmod( $temporary, 0644 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
            if ( ! @rename( $temporary, $path ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
                @unlink( $temporary ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
            }
        }
    }
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
    add_action( $action, 'ptscps_sr7_fp_invalidate', 1, 0 );
}

// Some global settings changes also affect public slide payload rendering.
add_action(
    'updated_option',
    static function ( $option ) {
        if ( 'sr-options' === $option ) {
            ptscps_sr7_fp_invalidate();
        }
    },
    10,
    1
);
