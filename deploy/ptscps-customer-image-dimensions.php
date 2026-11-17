<?php
/**
 * Plugin Name: PTSCPS Elementor Customer Carousel Image Dimensions
 * Description: Add native width/height to existing customer Swiper images from safe local upload metadata.
 * Version: 1.0.0
 *
 * Scope: homepage Elementor image-carousel widget ed1c7da only. Does not edit
 * widget data, image sources, CSS, carousel JS, image lazy-load or srcset.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
function ptscps_customer_dimensions_allowed() {
    return is_front_page() && ! is_admin() && ! is_feed() && ! is_preview()
        && ! ( function_exists( 'is_customize_preview' ) && is_customize_preview() )
        && ! isset( $_GET['elementor-preview'] )
        && ! isset( $_GET['customize_changeset_uuid'] );
}
function ptscps_customer_image_size_from_local_url( $src ) {
    static $sizes = array();
    if ( isset( $sizes[ $src ] ) ) {
        return $sizes[ $src ] ?: null;
    }
    $sizes[ $src ] = false;
    $url = wp_parse_url( html_entity_decode( $src, ENT_QUOTES, 'UTF-8' ) );
    $uploads = wp_upload_dir();
    $base = wp_parse_url( $uploads['baseurl'] ?? '' );
    if ( ! is_array( $url ) || ! is_array( $base )
        || strtolower( $url['host'] ?? '' ) !== strtolower( $base['host'] ?? '' )
        || empty( $url['path'] ) || empty( $base['path'] )
        || ! in_array( strtolower( $url['scheme'] ?? '' ), array( 'https', 'http' ), true )
        || ! preg_match( '~\.(?:png|jpe?g|webp|gif|avif)$~i', $url['path'] )
    ) {
        return null;
    }
    $base_path = rtrim( $base['path'], '/' ) . '/';
    $url_path = rawurldecode( $url['path'] );
    if ( 0 !== strpos( $url_path, $base_path ) ) {
        return null;
    }
    $relative = substr( $url_path, strlen( $base_path ) );
    if ( '' === $relative || false !== strpos( $relative, '..' ) ) {
        return null;
    }
    $directory = realpath( $uploads['basedir'] );
    if ( ! $directory ) {
        return null;
    }
    $file = realpath( $directory . DIRECTORY_SEPARATOR . str_replace( '/', DIRECTORY_SEPARATOR, $relative ) );
    if ( ! $file || 0 !== strpos( $file, $directory . DIRECTORY_SEPARATOR ) || ! is_file( $file ) ) {
        return null;
    }
    $size = @getimagesize( $file );
    if ( ! is_array( $size ) || empty( $size[0] ) || empty( $size[1] )
        || $size[0] > 15000 || $size[1] > 15000 ) {
        return null;
    }
    $sizes[ $src ] = array( (int) $size[0], (int) $size[1] );
    return $sizes[ $src ];
}
add_filter( 'elementor/widget/render_content', static function ( $html, $widget ) {
    if ( ! ptscps_customer_dimensions_allowed() || ! is_string( $html )
        || false === strpos( $html, 'swiper-slide-image' ) || ! is_object( $widget )
        || ! method_exists( $widget, 'get_name' )
        || 'image-carousel' !== $widget->get_name()
        || ! method_exists( $widget, 'get_data' )
        || 'ed1c7da' !== (string) $widget->get_data( 'id' ) ) {
        return $html;
    }
    return preg_replace_callback( '~<img\b[^>]*>~i', static function ( $match ) {
        $tag = $match[0];
        if ( ! preg_match( '~\bclass\s*=\s*(["\'])(.*?)\1~is', $tag, $class )
            || ! preg_match( '~(?:^|\s)swiper-slide-image(?:\s|$)~', $class[2] )
            || preg_match( '~\b(?:width|height)\s*=~i', $tag )
            || ! preg_match( '~\bsrc\s*=\s*(["\'])(.*?)\1~is', $tag, $src_match ) ) {
            return $tag;
        }
        $size = ptscps_customer_image_size_from_local_url( $src_match[2] );
        if ( ! $size ) {
            return $tag;
        }
        return preg_replace(
            '~\s*(/?)>$~',
            ' width="' . $size[0] . '" height="' . $size[1] . '"$1>',
            $tag,
            1
        );
    }, $html );
}, 25, 2 );
