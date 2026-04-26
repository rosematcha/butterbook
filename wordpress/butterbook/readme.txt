=== Butterbook ===
Contributors: butterbook
Tags: booking, museum, scheduling, membership, visits
Requires at least: 5.9
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Embed Butterbook booking and membership forms on your WordPress site.

== Description ==

Butterbook is a scheduling and membership platform built for museums, galleries, and cultural institutions. This plugin lets you embed Butterbook forms directly into your WordPress pages using simple shortcodes.

**Shortcodes:**

* `[butterbook_book]` - Embeds the visitor booking / check-in form.
* `[butterbook_join]` - Embeds the membership sign-up page.

Both shortcodes accept an optional `height` attribute (default: `700px`).

**Setup:**

1. Install and activate the plugin.
2. Go to Settings > Butterbook.
3. Enter your Butterbook organization slug.
4. Add a shortcode to any page or post.

== Installation ==

1. Upload the `butterbook` folder to the `/wp-content/plugins/` directory.
2. Activate the plugin through the Plugins menu in WordPress.
3. Go to Settings > Butterbook and enter your organization slug.

== Frequently Asked Questions ==

= Where do I find my organization slug? =

Your organization slug is visible in your Butterbook dashboard URL (e.g., `butterbook.app/app` after logging in). You can also find it under Settings > Organization in the Butterbook admin.

= Can I customize the height of the embed? =

Yes. Use the `height` attribute: `[butterbook_book height="900px"]`.

= Does this work with page builders? =

Yes. The shortcodes work in any context that processes WordPress shortcodes, including Gutenberg, Elementor, and WPBakery.

== Changelog ==

= 1.0.0 =
* Initial release.
* Shortcodes: `[butterbook_book]` and `[butterbook_join]`.
* Settings page for organization slug and custom host.
