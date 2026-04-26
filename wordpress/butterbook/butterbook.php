<?php
/**
 * Plugin Name:       Butterbook
 * Plugin URI:        https://butterbook.app
 * Description:       Embed Butterbook booking and membership forms on your WordPress site.
 * Version:           1.0.0
 * Requires at least: 5.9
 * Requires PHP:      7.4
 * Author:            Butterbook
 * Author URI:        https://butterbook.app
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       butterbook
 */

defined('ABSPATH') || exit;

define('BUTTERBOOK_VERSION', '1.0.0');
define('BUTTERBOOK_DEFAULT_HOST', 'https://butterbook.app');

/**
 * Register the settings page under Settings > Butterbook.
 */
add_action('admin_menu', function () {
    add_options_page(
        'Butterbook Settings',
        'Butterbook',
        'manage_options',
        'butterbook',
        'butterbook_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting('butterbook_settings', 'butterbook_org_slug', [
        'type'              => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default'           => '',
    ]);
    register_setting('butterbook_settings', 'butterbook_host', [
        'type'              => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'default'           => BUTTERBOOK_DEFAULT_HOST,
    ]);

    add_settings_section('butterbook_main', '', '__return_false', 'butterbook');

    add_settings_field('butterbook_org_slug', 'Organization slug', function () {
        $value = esc_attr(get_option('butterbook_org_slug', ''));
        echo '<input type="text" name="butterbook_org_slug" value="' . $value . '" class="regular-text" placeholder="my-museum" />';
        echo '<p class="description">Your Butterbook organization slug (visible in your Butterbook dashboard URL).</p>';
    }, 'butterbook', 'butterbook_main');

    add_settings_field('butterbook_host', 'Butterbook host', function () {
        $value = esc_attr(get_option('butterbook_host', BUTTERBOOK_DEFAULT_HOST));
        echo '<input type="url" name="butterbook_host" value="' . $value . '" class="regular-text" />';
        echo '<p class="description">Only change this if you self-host Butterbook.</p>';
    }, 'butterbook', 'butterbook_main');
});

function butterbook_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    ?>
    <div class="wrap">
        <h1>Butterbook Settings</h1>
        <form method="post" action="options.php">
            <?php
            settings_fields('butterbook_settings');
            do_settings_sections('butterbook');
            submit_button();
            ?>
        </form>
        <hr />
        <h2>Shortcodes</h2>
        <p>Use these shortcodes in any page or post:</p>
        <table class="widefat" style="max-width: 600px;">
            <thead><tr><th>Shortcode</th><th>Description</th></tr></thead>
            <tbody>
                <tr><td><code>[butterbook_book]</code></td><td>Embeds the visitor booking form.</td></tr>
                <tr><td><code>[butterbook_join]</code></td><td>Embeds the membership sign-up page.</td></tr>
            </tbody>
        </table>
        <p>Both shortcodes accept an optional <code>height</code> attribute (default: <code>700px</code>).</p>
        <p>Example: <code>[butterbook_book height="800px"]</code></p>
    </div>
    <?php
}

/**
 * [butterbook_book] — Embed the booking / intake form.
 *
 * @param array $atts Shortcode attributes.
 * @return string HTML output.
 */
add_shortcode('butterbook_book', function ($atts) {
    $atts = shortcode_atts(['height' => '700px'], $atts, 'butterbook_book');
    return butterbook_iframe('/embed', $atts['height']);
});

/**
 * [butterbook_join] — Embed the membership join page.
 *
 * @param array $atts Shortcode attributes.
 * @return string HTML output.
 */
add_shortcode('butterbook_join', function ($atts) {
    $atts = shortcode_atts(['height' => '700px'], $atts, 'butterbook_join');
    return butterbook_iframe('/join', $atts['height']);
});

/**
 * Build a responsive, CSP-friendly iframe wrapper.
 *
 * @param string $path    The path on the Butterbook host.
 * @param string $height  CSS height for the iframe.
 * @return string HTML.
 */
function butterbook_iframe($path, $height) {
    $slug = sanitize_text_field(get_option('butterbook_org_slug', ''));
    if (empty($slug)) {
        return '<p style="color:#b91c1c;font-size:14px;">Butterbook: Please set your organization slug in <strong>Settings &gt; Butterbook</strong>.</p>';
    }

    $host = esc_url(get_option('butterbook_host', BUTTERBOOK_DEFAULT_HOST));
    $src  = esc_url($host . $path . '?org=' . rawurlencode($slug));
    $h    = esc_attr($height);

    return <<<HTML
<div class="butterbook-embed" style="position:relative;width:100%;max-width:100%;overflow:hidden;">
    <iframe
        src="{$src}"
        style="width:100%;height:{$h};border:none;border-radius:8px;"
        loading="lazy"
        allow="payment"
        referrerpolicy="strict-origin-when-cross-origin"
        title="Butterbook"
    ></iframe>
</div>
HTML;
}
