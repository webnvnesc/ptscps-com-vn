<?php
/**
 * Plugin Name: PTSCPS Offscreen Content Visibility Pilot
 * Description: Reversible homepage-only content-visibility experiment for genuinely offscreen Elementor sections.
 * Version: 1.0.1
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

    // Measured mobile 412x850: News section starts at y=1070px,
    // is approximately 991px tall, entirely below the first viewport.
    // Do not include the customer image carousel: its height changes
    // from roughly 148px to 288px when activated while scrolling.
    // No desktop section is deferred; desktop PSI is already excellent.
    echo "\n<style id=\"ptscps-offscreen-content-visibility-v1\">\n";
    echo '@supports (content-visibility: auto) {' . "\n";
    echo '  @media (max-width: 767px) {' . "\n";
    echo '    body.home .elementor.elementor-5 > section.elementor-element-1c36b17 {' . "\n";
    echo '      content-visibility: auto; contain-intrinsic-size: auto 991px;' . "\n";
    echo '    }' . "\n";
    echo '  }' . "\n";
    echo '}' . "\n</style>\n";
}, 25 );
