<?php
/**
 * Plugin Name: PTSCPS Automatic WebP for WordPress Uploads
 * Description: Convert new WordPress JPG/PNG uploads and changed SR7 background images to WebP sidecars; keep original URLs and files.
 * Version: 1.0.0
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
if ( ! defined( 'PTSCPS_WEBP_AUTOGEN_V1' ) ) {
    define( 'PTSCPS_WEBP_AUTOGEN_V1', true );
}

/**
 * Resolve an image into the real WordPress uploads directory without
 * trusting user-controlled relative paths or network locations.
 */
function ptscps_webp_upload_path( $raw ) {
    if ( ! is_string( $raw ) || '' === $raw || false !== strpos( $raw, "\0" ) ) {
        return false;
    }
    $uploads = wp_upload_dir();
    if ( ! empty( $uploads['error'] ) || empty( $uploads['basedir'] ) ) {
        return false;
    }
    $dir = realpath( $uploads['basedir'] );
    if ( ! $dir ) {
        return false;
    }
    $candidate = $raw;
    if ( preg_match( '~^https?://|^//~i', $raw ) ) {
        $url = wp_parse_url( 0 === strpos( $raw, '//' ) ? 'https:' . $raw : $raw );
        $base = wp_parse_url( $uploads['baseurl'] );
        if ( ! is_array( $url ) || ! is_array( $base )
            || strtolower( $url['host'] ?? '' ) !== strtolower( $base['host'] ?? '' )
            || empty( $url['path'] ) || empty( $base['path'] ) ) {
            return false;
        }
        $prefix = rtrim( $base['path'], '/' ) . '/';
        $path = rawurldecode( $url['path'] );
        if ( 0 !== strpos( $path, $prefix ) ) {
            return false;
        }
        $relative = substr( $path, strlen( $prefix ) );
        if ( '' === $relative || false !== strpos( $relative, '..' ) ) {
            return false;
        }
        $candidate = $dir . '/' . $relative;
    }
    if ( ! preg_match( '~\.(?:jpe?g|png)$~i', $candidate ) ) {
        return false;
    }
    $real = realpath( $candidate );
    if ( ! $real || 0 !== strpos( $real, $dir . DIRECTORY_SEPARATOR )
        || ! is_file( $real ) || ! is_readable( $real ) ) {
        return false;
    }
    return $real;
}

/**
 * Output must remain smaller than source and preserve original dimensions.
 * Never replace JPG/PNG and never delete a source upload.
 */
function ptscps_webp_generate_one( $raw ) {
    static $seen = array();
    $file = ptscps_webp_upload_path( $raw );
    if ( ! $file || isset( $seen[ $file ] ) ) {
        return false;
    }
    $seen[ $file ] = true;
    $bytes = @filesize( $file );
    if ( ! $bytes || $bytes > 10 * 1024 * 1024 ) {
        return false;
    }
    $dimensions = @getimagesize( $file );
    if ( ! $dimensions || empty( $dimensions[0] ) || empty( $dimensions[1] )
        || $dimensions[0] * $dimensions[1] > 12000000 ) {
        return false;
    }
    $output = $file . '.webp';
    // Regenerate after a same-name upload only when the source changed.
    if ( is_file( $output ) && @filemtime( $output ) >= @filemtime( $file )
        && @filesize( $output ) > 0 ) {
        return true;
    }
    $editor = wp_get_image_editor( $file );
    if ( is_wp_error( $editor ) || ! method_exists( $editor, 'save' ) ) {
        return false;
    }
    if ( method_exists( $editor, 'set_quality' ) ) {
        $editor->set_quality( 82 );
    }
    $tmp = $file . '.ptscps-' . wp_generate_password( 12, false, false ) . '.webp';
    $result = $editor->save( $tmp, 'image/webp' );
    if ( is_wp_error( $result ) || ! is_file( $tmp ) ) {
        @unlink( $tmp );
        return false;
    }
    $produced = @getimagesize( $tmp );
    $size = @filesize( $tmp );
    if ( ! $size || $size >= $bytes * 0.96
        || ! $produced || (int) $produced[0] !== (int) $dimensions[0]
        || (int) $produced[1] !== (int) $dimensions[1]
        || ( $produced['mime'] ?? '' ) !== 'image/webp' ) {
        @unlink( $tmp );
        return false;
    }
    if ( ! @rename( $tmp, $output ) ) {
        @unlink( $tmp );
        return false;
    }
    // Image files are publicly readable like the original.
    @chmod( $output, fileperms( $file ) & 0777 );
    return true;
}

/** New images uploaded by Media Library (including WP async upload endpoint). */
add_filter( 'wp_handle_upload', static function ( $upload ) {
    if ( is_array( $upload ) && empty( $upload['error'] ) && ! empty( $upload['file'] ) ) {
        ptscps_webp_generate_one( $upload['file'] );
    }
    return $upload;
}, 60, 1 );

/** Also cover intermediate sizes from WordPress thumbnails and resizes. */
add_filter( 'wp_generate_attachment_metadata', static function ( $metadata, $attachment_id ) {
    if ( ! is_array( $metadata ) || empty( $metadata['file'] ) ) {
        return $metadata;
    }
    $full = get_attached_file( $attachment_id );
    if ( ! $full ) {
        return $metadata;
    }
    ptscps_webp_generate_one( $full );
    if ( ! empty( $metadata['sizes'] ) && is_array( $metadata['sizes'] ) ) {
        $directory = dirname( $full );
        foreach ( $metadata['sizes'] as $size ) {
            if ( ! empty( $size['file'] ) && is_string( $size['file'] ) ) {
                ptscps_webp_generate_one( $directory . DIRECTORY_SEPARATOR . $size['file'] );
            }
        }
    }
    return $metadata;
}, 60, 2 );

/**
 * Attachment replacement plugins commonly update metadata instead of creating
 * a new upload. Re-check the actual file after that update.
 */
add_filter( 'wp_update_attachment_metadata', static function ( $metadata, $attachment_id ) {
    if ( is_array( $metadata ) ) {
        $full = get_attached_file( $attachment_id );
        if ( $full ) {
            ptscps_webp_generate_one( $full );
        }
    }
    return $metadata;
}, 60, 2 );

/**
 * Cover a slider edited to use an existing old Media Library image. Trigger
 * once after an actual SR7 write, never during normal frontend render.
 */
function ptscps_webp_schedule_slider_scan() {
    static $added = false;
    if ( $added ) {
        return;
    }
    $added = true;
    add_action( 'shutdown', 'ptscps_webp_sync_slider_images', 40 );
}
function ptscps_webp_sync_slider_images() {
    if ( ! class_exists( 'RevSliderSlider' ) ) {
        return;
    }
    try {
        $slider = new RevSliderSlider();
        $slider->init_by_id( 1, false );
        $slides = $slider->get_slides( true );
        if ( ! is_array( $slides ) ) {
            return;
        }
        $count = 0;
        foreach ( $slides as $slide ) {
            if ( $count++ >= 20 ) {
                break;
            }
            if ( ! is_object( $slide ) || ! method_exists( $slide, 'get_bg_layer' ) ) {
                continue;
            }
            $layer = $slide->get_bg_layer();
            $src = is_array( $layer ) && isset( $layer['bg']['image']['src'] )
                && is_string( $layer['bg']['image']['src'] )
                ? $layer['bg']['image']['src'] : '';
            if ( $src ) {
                ptscps_webp_generate_one( $src );
            }
        }
    } catch ( \Throwable $error ) {
        error_log( 'PTSCPS WebP SR7 scan skipped: ' . $error->getMessage() );
    }
}
foreach ( array(
    'revslider_save_slider_v7',
    'save_slide_v7',
    'revslider_slide_updateSlideFromData_post',
    'revslider_slide_updateSlide',
    'revslider_slider_update_slider',
) as $action ) {
    add_action( $action, 'ptscps_webp_schedule_slider_scan', 15, 0 );
}
