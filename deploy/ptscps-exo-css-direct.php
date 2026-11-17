<?php
/**
 * Plugin Name: PTSCPS Exo Font CSS Direct
 * Description: Load Exo stylesheet directly and remove Jannah's redundant WebFont Loader, retaining wf-active font selectors.
 * Version: 1.0.2
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
/**
 * Never change editor/admin, customizer, previews, REST or feeds.
 * The normal anonymous site receives Exo through a plain early stylesheet.
 */
function ptscps_exo_direct_active() {
    return ! is_admin() && ! is_feed() && ! is_preview()
        && ! ( function_exists( 'is_customize_preview' ) && is_customize_preview() )
        && ! isset( $_GET['elementor-preview'] )
        && ! isset( $_GET['customize_changeset_uuid'] );
}
add_action( 'wp_enqueue_scripts', static function () {
    if ( ! ptscps_exo_direct_active() ) {
        return;
    }
    wp_enqueue_style(
        'ptscps-exo-direct',
        content_url( '/uploads/ptscps-exo-fonts/exo-direct-v1.css' ),
        array(),
        null,
        'all'
    );
}, 1 );

add_filter( 'language_attributes', static function ( $attributes ) {
    if ( ! ptscps_exo_direct_active() ) {
        return $attributes;
    }
    // Jannah's selectors use .wf-active body; the class belongs on HTML.
    if ( preg_match( '~\\bclass\\s*=~i', $attributes ) ) {
        return preg_replace_callback(
            '~\\bclass\\s*=\\s*(["\\\'])(.*?)\\1~i',
            static function ( $m ) {
                return 'class=' . $m[1] . trim( $m[2] . ' wf-active' ) . $m[1];
            },
            $attributes,
            1
        );
    }
    return $attributes . ' class="wf-active"';
}, 20 );

/**
 * Jannah currently prints a specific Exo-only WebFontConfig bootstrap at
 * wp_footer. Buffer only footer callbacks rather than the whole page.
 * If a Jannah update changes the bootstrap, pass the original markup
 * unchanged; do not suppress a script using a general URL-matching rule.
 */
add_action( 'wp_footer', static function () {
    if ( ! ptscps_exo_direct_active() ) {
        return;
    }
    $GLOBALS['ptscps_exo_footer_buffer_level'] = ob_get_level() + 1;
    ob_start();
}, -999999 );

add_action( 'wp_footer', static function () {
    if ( empty( $GLOBALS['ptscps_exo_footer_buffer_level'] )
        || ob_get_level() !== (int) $GLOBALS['ptscps_exo_footer_buffer_level'] ) {
        return;
    }
    unset( $GLOBALS['ptscps_exo_footer_buffer_level'] );
    $html = ob_get_clean();
    $pattern = '~<script>\s*WebFontConfig\s*=\s*\{[\s\S]*?wf\.src\s*=\s*["\']//ajax\.googleapis\.com/ajax/libs/webfont/1/webfont\.js["\'];[\s\S]*?\}\)\(\);\s*</script>~i';
    $changes = 0;
    $updated = preg_replace_callback(
        $pattern,
        static function ( $matches ) {
            // Only the known Exo-only block is safe to eliminate. Preserve
            // other WebFontConfig consumers, families, custom JS and widgets.
            $block = $matches[0];
            if ( strpos( $block, "'Exo:" ) === false
                || preg_match( '~families:\s*\[([^\]]+)\]~', $block, $family )
                && preg_match( '~["\'](?!Exo:)[A-Za-z][^"\']*:[^"\']+["\']~', $family[1] ) ) {
                return $block;
            }
            return "\n<!-- PTSCPS Exo loaded via CSS; WebFont Loader unnecessary -->\n";
        },
        $html,
        1,
        $changes
    );
    echo is_string( $updated ) ? $updated : $html;
}, 999999 );
