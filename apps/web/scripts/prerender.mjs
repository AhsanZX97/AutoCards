// Runs after both `vite build` (client) and
// `vite build --ssr src/seo/entry-server.tsx --mode prerender` (server) have
// produced dist/ and dist-ssr/. Renders every public route to static HTML so
// crawlers get real markup instead of an empty <div id="root">, and writes
// sitemap.xml + a real 404.html alongside it.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url))); // apps/web
const distDir = join(root, 'dist');
const ssrEntry = join(root, 'dist-ssr', 'entry-server.js');

if (!existsSync(join(distDir, 'index.html'))) {
  throw new Error('dist/index.html not found — run `vite build` before prerendering.');
}
if (!existsSync(ssrEntry)) {
  throw new Error('dist-ssr/entry-server.js not found — run the SSR build before prerendering.');
}

const { renderApp, publicRoutes } = await import(String(new URL(`file://${ssrEntry.replace(/\\/g, '/')}`)));

const SITE_URL = (process.env.VITE_SITE_URL?.trim() || 'https://autocards.study').replace(/\/+$/, '');
const template = readFileSync(join(distDir, 'index.html'), 'utf8');

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Replaces the `content`/`href` of the first tag matched by `tagPattern`. */
function replaceAttr(html, tagPattern, attr, value) {
  return html.replace(tagPattern, (tag) => tag.replace(new RegExp(`${attr}="[^"]*"`), `${attr}="${escapeHtml(value)}"`));
}

function withMeta(html, { title, description, canonicalHref, noindex }) {
  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  out = replaceAttr(out, /<meta[^>]*name="description"[^>]*>/, 'content', description);
  out = replaceAttr(out, /<meta[^>]*property="og:title"[^>]*>/, 'content', title);
  out = replaceAttr(out, /<meta[^>]*property="og:description"[^>]*>/, 'content', description);
  out = replaceAttr(out, /<meta[^>]*name="twitter:title"[^>]*>/, 'content', title);
  out = replaceAttr(out, /<meta[^>]*name="twitter:description"[^>]*>/, 'content', description);
  out = replaceAttr(out, /<link[^>]*rel="canonical"[^>]*>/, 'href', canonicalHref);
  // `og:url` is per-page and must match the canonical URL, or a share card
  // points every route at the landing page. The two image tags are already
  // absolute in index.html; they only need rewriting when SITE_URL isn't the
  // production origin (a staging deploy setting VITE_SITE_URL).
  out = replaceAttr(out, /<meta[^>]*property="og:url"[^>]*>/, 'content', canonicalHref);
  out = replaceAttr(out, /<meta[^>]*property="og:image"[^>]*>/, 'content', `${SITE_URL}/og-image.png`);
  out = replaceAttr(out, /<meta[^>]*name="twitter:image"[^>]*>/, 'content', `${SITE_URL}/og-image.png`);
  if (noindex) {
    out = out.replace('</head>', '  <meta name="robots" content="noindex" />\n  </head>');
  }
  return out;
}

function outputPathFor(routePath) {
  if (routePath === '/') return join(distDir, 'index.html');
  // Matches vercel.json's `cleanUrls: true` convention: /foo/bar -> foo/bar.html.
  return join(distDir, `${routePath.replace(/^\//, '')}.html`);
}

function writeHtml(outPath, html) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  console.log('prerendered', outPath.slice(distDir.length + 1) || 'index.html');
}

for (const route of publicRoutes) {
  const appHtml = renderApp(route.path);
  const html = withMeta(template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`), {
    title: route.title,
    description: route.description,
    canonicalHref: `${SITE_URL}${route.path}`,
  });
  writeHtml(outputPathFor(route.path), html);
}

// The catch-all `*` route (NotFoundPage), for a real static 404.html —
// Vercel serves this automatically, with a 404 status, for any request that
// matches neither a static file nor a rewrite. See vercel.json.
const notFoundHtml = renderApp('/__autocards_not_found__');
const notFoundPage = withMeta(template.replace('<div id="root"></div>', `<div id="root">${notFoundHtml}</div>`), {
  title: 'Page not found — Auto Cards',
  description: 'The page you were looking for does not exist.',
  canonicalHref: `${SITE_URL}/404`,
  noindex: true,
});
writeHtml(join(distDir, '404.html'), notFoundPage);

// sitemap.xml
const today = new Date().toISOString().slice(0, 10);
const urls = publicRoutes
  .map(
    (route) => `  <url>
    <loc>${SITE_URL}${route.path}</loc>
    <lastmod>${today}</lastmod>${route.changefreq ? `\n    <changefreq>${route.changefreq}</changefreq>` : ''}
  </url>`,
  )
  .join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
writeFileSync(join(distDir, 'sitemap.xml'), sitemap);
console.log('wrote sitemap.xml with', publicRoutes.length, 'urls');

process.exit(0);
