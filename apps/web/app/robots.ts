import type { MetadataRoute } from 'next';
import { IS_DEMO, MARKETING_URL } from '../lib/env';

// Generates /robots.txt at build time. The demo deployment blocks every
// crawler outright; the marketing deployment advertises the sitemap and
// allows everything. Static export picks this up via Next.js's Metadata
// Files convention.
//
// `force-static` is required under `output: 'export'` — without it Next
// treats the route as dynamic and the build (and dev server) errors out.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  if (IS_DEMO) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    };
  }
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${MARKETING_URL}/sitemap.xml`,
  };
}
