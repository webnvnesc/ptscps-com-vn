<?php
/**
 * Plugin Name: PTSCPS Responsive Jannah Logo
 * Description: Add responsive image candidates only to the native Jannah header logo.
 * Version: 1.0.1
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
if ( ! function_exists( 'ptscps_responsive_logo_enabled' ) ) {
    function ptscps_responsive_logo_enabled() {
        if ( is_admin() || is_preview() || ( function_exists( 'is_customize_preview' ) && is_customize_preview() ) ) {
            return false;
        }
        foreach ( array( 'elementor-preview', 'preview', 'vc_editable', 'customize_changeset_uuid' ) as $key ) {
            if ( isset( $_GET[ $key ] ) ) {
                return false;
            }
        }
        return true;
    }
}
if ( ! function_exists( 'ptscps_responsive_logo_capture' ) ) {
    function ptscps_responsive_logo_capture() {
        if ( ! ptscps_responsive_logo_enabled() ) {
            return;
        }
        if ( isset( $GLOBALS['ptscps_logo_buffer_level'] ) ) {
            return;
        }
        ob_start();
        $GLOBALS['ptscps_logo_buffer_level'] = ob_get_level();
    }
}
if ( ! function_exists( 'ptscps_responsive_logo_replace' ) ) {
    function ptscps_responsive_logo_replace() {
        if ( ! isset( $GLOBALS['ptscps_logo_buffer_level'] ) ) {
            return;
        }
        $level = (int) $GLOBALS['ptscps_logo_buffer_level'];
        unset( $GLOBALS['ptscps_logo_buffer_level'] );
        if ( ob_get_level() !== $level ) {
            return;
        }
        $html = ob_get_clean();
        $base = content_url( '/uploads/2024/08/' );
        $original = $base . 'logo-2024.jpg';
        if ( strpos( $html, 'tie-logo-img-default' ) === false || strpos( $html, $original ) === false ) {
            echo $html; // Pass other/custom logos through unchanged.
            return;
        }
        $small = esc_url( $base . 'logo-2024-320x107-ptscps.jpg' );
        $medium = esc_url( $base . 'logo-2024-640x214-ptscps.jpg' );
        $large = esc_url( $base . 'logo-2024-1024x343.jpg' );
        $result = preg_replace_callback(
            '~<img\b[^>]*\bclass\s*=\s*["\'][^"\']*\btie-logo-img-default\b[^"\']*["\'][^>]*>~i',
            static function ( $matches ) use ( $original, $small, $medium, $large ) {
                $img = $matches[0];
                if ( strpos( $img, $original ) === false ) {
                    return $img;
                }
                $img = preg_replace( '~\s(?:srcset|sizes|src|width|height)\s*=\s*(?:"[^"]*"|\'[^\']*\')~i', '', $img );
                $attributes = ' src="' . $small . '"'
                    . ' srcset="' . $small . ' 320w, ' . $medium . ' 640w, ' . $large . ' 1024w"'
                    . ' sizes="(max-width: 767px) 160px, 295px"'
                    . ' width="320" height="107"';
                return preg_replace( '~\s*/?>$~', $attributes . ' />', $img, 1 );
            },
            $html,
            1
        );
        if ( is_string( $result ) ) {
            // Native Jannah <picture> places a <source> before <img>. Browsers
            // select source[srcset] first; updating <img> alone wastes bandwidth.
            $candidates = $small . ' 320w, ' . $medium . ' 640w, ' . $large . ' 1024w';
            $result = preg_replace_callback(
                '~<source\b[^>]*\bclass\s*=\s*["\'][^"\']*\btie-logo-source-default\b[^"\']*["\'][^>]*>~i',
                static function ( $matches ) use ( $original, $candidates ) {
                    $source = $matches[0];
                    if ( strpos( $source, $original ) === false ) {
                        return $source;
                    }
                    $source = preg_replace( '~\s(?:srcset|sizes)\s*=\s*(?:"[^"]*"|\'[^\']*\')~i', '', $source );
                    return preg_replace(
                        '~\s*/?>$~',
                        ' srcset="' . esc_attr( $candidates ) . '" sizes="(max-width: 767px) 160px, 295px" />',
                        $source,
                        1
                    );
                },
                $result,
                1
            );
        }
        echo is_string( $result ) ? $result : $html;
    }
}
add_action( 'TieLabs/Logo/before', 'ptscps_responsive_logo_capture', PHP_INT_MAX );
add_action( 'TieLabs/Logo/after', 'ptscps_responsive_logo_replace', PHP_INT_MIN );
