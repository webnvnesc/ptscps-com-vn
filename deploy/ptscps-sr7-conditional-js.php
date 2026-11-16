<?php
/**
 * Plugin Name: PTSCPS Conditional SR7 Frontend JS
 * Description: Load Slider Revolution JS only on pages which use it, preserving WordPress, Elementor and edit/preview flows.
 * Version: 1.0.0
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

if ( ! function_exists( 'ptscps_sr7_js_gate_safe' ) ) {
    function ptscps_sr7_js_gate_safe() {
        if ( is_admin() || is_preview() || ! is_page() || is_front_page() || is_home() ) {
            return false;
        }
        if ( function_exists( 'is_customize_preview' ) && is_customize_preview() ) {
            return false;
        }
        foreach ( array( 'elementor-preview', 'preview', 'customize_changeset_uuid', 'vc_editable', 'action' ) as $key ) {
            if ( isset( $_GET[ $key ] ) ) {
                return false;
            }
        }
        if ( ! function_exists( 'get_queried_object_id' ) || ! function_exists( 'get_post' ) ) {
            return false;
        }
        // If an SR widget is active anywhere, fail open: it could be in header/footer/sidebar.
        if ( function_exists( 'is_active_widget' ) && is_active_widget( false, false, 'rev-slider-widget', true ) ) {
            return false;
        }
        $id = (int) get_queried_object_id();
        if ( $id < 1 ) {
            return false;
        }
        $post = get_post( $id );
        if ( ! $post || 'page' !== $post->post_type ) {
            return false;
        }
        // WordPress shortcode, block, WPBakery, Elementor widget and inline HTML.
        $pattern = '~(?:\[rev_slider\b|\[sr7\b|rev-slider-widget|revslider|sliderrevolution|rev_slider|<sr7-module\b|<rs-module\b|SR7\.JSON|sr7-elementor)~i';
        if ( preg_match( $pattern, (string) $post->post_content ) ) {
            return false;
        }
        $elementor = get_post_meta( $id, '_elementor_data', true );
        if ( is_array( $elementor ) ) {
            $elementor = wp_json_encode( $elementor );
        }
        if ( is_string( $elementor ) &&
             ( preg_match( $pattern, $elementor ) ||
               preg_match( '~"widgetType"\s*:\s*"global"~i', $elementor ) ) ) {
            return false;
        }
        // Child/plugin hook can force the slider loader back on for a custom widget.
        if ( apply_filters( 'ptscps_sr7_js_gate_force_include', false, $id ) ) {
            return false;
        }
        return true;
    }
}
if ( ! function_exists( 'ptscps_sr7_js_gate_active' ) ) {
    function ptscps_sr7_js_gate_active() {
        // Activated after isolated mobile and desktop browser QA.
        return true;
    }
}
add_action( 'wp_enqueue_scripts', static function () {
    if ( ! ptscps_sr7_js_gate_active() ) {
        return;
    }
    if ( ! ptscps_sr7_js_gate_safe() ) {
        if ( ! headers_sent() ) {
            header( 'X-PTSCPS-SR7-JS-Gate: preserved' );
        }
        return;
    }
    // Tested against Slider Revolution 7.1.4 actual native handle names.
    $changed = false;
    foreach ( array( 'sr7', 'tp-tools' ) as $handle ) {
        if ( wp_script_is( $handle, 'enqueued' ) ) {
            wp_dequeue_script( $handle );
            $changed = true;
        }
    }
    if ( ! headers_sent() ) {
        header( 'X-PTSCPS-SR7-JS-Gate: ' . ( $changed ? 'removed' : 'not-enqueued' ) );
    }
}, PHP_INT_MAX );
