/**
 * Falls back to the production domain. Set `VITE_SITE_URL` (no trailing
 * slash) to override for a staging deploy — canonical links, OG tags and the
 * sitemap all read from here.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL?.trim() || 'https://autocards.study').replace(/\/+$/, '');
