import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { publicRoutes } from './routes';
import { SITE_URL } from './siteUrl';

function setMetaByName(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setMetaByProperty(property: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Keeps `<title>`, the meta description, OG/Twitter tags and the canonical
 * link in step with the matched route on client-side navigation.
 *
 * The build-time prerender script writes the same values straight into each
 * route's static HTML — this only has to take over from there, so a crawler
 * or a first paint never depends on JS running at all.
 */
export function PageMeta() {
  const location = useLocation();

  useEffect(() => {
    const route = publicRoutes.find((r) => r.path === location.pathname);
    if (!route) return;

    document.title = route.title;
    setMetaByName('description', route.description);
    setMetaByProperty('og:title', route.title);
    setMetaByProperty('og:description', route.description);
    setMetaByName('twitter:title', route.title);
    setMetaByName('twitter:description', route.description);
    setCanonical(`${SITE_URL}${route.path}`);
  }, [location.pathname]);

  return null;
}
