<?php
/**
 * Plugin Name: PTSCPS Offscreen Content Visibility Pilot
 * Description: Reversible homepage-only content-visibility experiment for genuinely offscreen Elementor sections.
 * Version: 1.0.0
 *
 * This plugin does not modify post content, Elementor settings, CSS/JS asset loading,
 * Slider Revolution markup, DOM structure, or any WordPress cache configuration.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_head', static function () {
    if ( ! is_front_page() || is_admin() || is_user_logged_in() || is_preview()
        || is_feed() || ( function_exists( 'is_customize_preview' ) && is_customize_preview() )
        || isset( $_GET['elementor-preview'] )
        || isset( $_GET['customize_changeset_uuid'] )
    ) {
        return;
    }

    // Geometry verified on 2026-11-17 in Chromium before deployment:
    // Mobile 412 x 850: news starts y=1070 (991px), customers y=2061 (148px).
    // Desktop 1440 x 900: news starts y=770 (ONSCREEN), customers y=1265 (214px).
    // Never apply to header, first banner, services, or desktop news.
    echo "\n<style id=\"ptscps-offscreen-content-visibility-v1\">\n";
    echo '@supports (content-visibility: auto) {' . "\n";
    echo '  @media (max-width: 767px) {' . "\n";
    echo '    body.home .elementor.elementor-5 > section.elementor-element-1c36b17 {' . "\n";
    echo '      content-visibility: auto; contain-intrinsic-size: auto 991px;' . "\n";
    echo '    }' . "\n";
    echo '    body.home .elementor.elementor-5 > section.elementor-element-1be3f74 {' . "\n";
    echo '      content-visibility: auto; contain-intrinsic-size: auto 148px;' . "\n";
    echo '    }' . "\n";
    echo '  }' . "\n";
    echo '  @media (min-width: 1200px) {' . "\n";
    echo '    body.home .elementor.elementor-5 > section.elementor-element-1be3f74 {' . "\n";
    echo '      content-visibility: auto; contain-intrinsic-size: auto 214px;' . "\n";
    echo '    }' . "\n";
    echo '  }' . "\n";
    echo '}' . "\n</style>\n";
}, 25 );
