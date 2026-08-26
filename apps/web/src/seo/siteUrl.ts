/**
 * No production domain is recorded anywhere in the repo yet, so this falls
 * back to a placeholder. Set `VITE_SITE_URL` (no trailing slash) once the
 * real domain is live — canonical links, OG tags and the sitemap all read
 * from here.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL?.trim() || 'https://autocards.app').replace(/\/+$/, '');
