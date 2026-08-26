import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import App from '../App';
import { AppProvider } from '../lib/appContext';

/** Re-exported so scripts/prerender.mjs can read path/title/description
 * without re-implementing the manifest — it ignores `element` entirely. */
export { publicRoutes } from './routes';

/**
 * Renders `<App>` for one URL to a markup string, for the build-time
 * prerender script (`scripts/prerender.mjs`) to drop into a static HTML
 * shell per route.
 *
 * Built via `vite build --ssr --mode prerender` (see `.env.prerender`).
 * `createApp` needs a real Supabase client to construct at all, but nothing
 * server-rendered here calls it outside a `useEffect` — effects don't run
 * during `renderToString` — so every prerendered page still renders as an
 * anonymous visitor would see it; hydration reconciles the real session on
 * the client.
 */
export function renderApp(url: string): string {
  return renderToString(
    <StaticRouter location={url}>
      <AppProvider>
        <App />
      </AppProvider>
    </StaticRouter>,
  );
}
