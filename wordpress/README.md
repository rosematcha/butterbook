# WordPress plugin (deferred to phase 2)

Placeholder. The API in `apps/api` is designed so that a non-browser consumer (this plugin)
can call it directly. When building this out, enable `FEATURE_WORDPRESS_API` in config and
add the plugin's origin to `CORS_ALLOWED_ORIGINS`. All authentication will continue to use
opaque bearer tokens from `/api/v1/auth/login` — never cookies.
