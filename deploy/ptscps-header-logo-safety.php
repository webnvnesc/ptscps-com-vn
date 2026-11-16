<?php
/**
 * Plugin Name: PTSCPS Header Logo Safety Guard
 * Description: Small inline image bound to prevent oversized logo if Jannah CSS requests fail intermittently.
 * Version: 1.0.0
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
add_action( 'wp_head', static function () {
    // Do not add frontend fallback rules inside WordPress/Elementor editing.
    if ( is_admin() || is_preview() || ( function_exists( 'is_customize_preview' ) && is_customize_preview() ) || isset( $_GET['elementor-preview'] ) ) {
        return;
    }
    // Keep the guard independent of theme/plugin network-delivered CSS. It
    // caps only the header's normal image (not Slider Revolution/Elementor).
    // Jannah normally renders 295x99 desktop and 160x54 mobile.
    $css = <<<'CSS'
#theme-header img.tie-logo-img-default {
    max-width: 295px !important;
    max-height: 99px !important;
}
@media (max-width: 767px) {
    #theme-header img.tie-logo-img-default {
        max-width: 160px !important;
        max-height: 54px !important;
    }
}
CSS;
    echo '<style id="ptscps-header-logo-safety-css">' . $css . '</style>';
}, 1 );
