import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Font files are only discovered by the browser parsing CSS, so Vite never
 * puts them in `index.html` on its own. Preloading the two Latin variable
 * woff2 files (the subset every page actually renders) needs their final
 * hashed names, which only exist once the bundle is built — hence a
 * `transformIndexHtml` hook instead of a hand-written `<link>` in index.html.
 */
function fontPreloadPlugin(): Plugin {
  const FONT_PATTERNS = [/inter-latin-wght-normal.*\.woff2$/, /plus-jakarta-sans-latin-wght-normal.*\.woff2$/];

  return {
    name: 'autocards-font-preload',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return [];

        const fontFiles = Object.values(bundle)
          .map((chunk) => chunk.fileName)
          .filter((fileName) => FONT_PATTERNS.some((pattern) => pattern.test(fileName)));

        return fontFiles.map((fileName) => ({
          tag: 'link',
          injectTo: 'head' as const,
          attrs: {
            rel: 'preload',
            as: 'font',
            type: 'font/woff2',
            href: `/${fileName}`,
            crossorigin: '',
          },
        }));
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), fontPreloadPlugin()],
  server: {
    port: 5173,
  },
  ssr: {
    // `@autocards/core`'s package.json points straight at its .ts source
    // (no build step for consumers) — fine for Vite, but Node can't run a
    // .ts file on its own, so the SSR bundle has to inline it rather than
    // leave it as an external `import`.
    noExternal: [/^@autocards\//],
  },
});
