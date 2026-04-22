export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

// Build-time flag baked into the demo deployment only. Every check in the web
// app keys off this constant so dead-code elimination prunes demo UI from the
// production bundle and prunes marketing UI from the demo bundle.
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// Where the "Sign up for real" link lands. Points at the marketing site by
// default; demo deployments override with NEXT_PUBLIC_MARKETING_URL in case
// the domain changes without a code deploy.
export const MARKETING_URL = (process.env.NEXT_PUBLIC_MARKETING_URL ?? 'https://butterbook.app').replace(/\/+$/, '');

// Where prod pages point visitors who come looking for the demo.
export const DEMO_URL = (process.env.NEXT_PUBLIC_DEMO_URL ?? 'https://demo.butterbook.app').replace(/\/+$/, '');
