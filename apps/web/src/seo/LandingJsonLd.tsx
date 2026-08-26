import { useLocation } from 'react-router-dom';
import { SITE_URL } from './siteUrl';

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Auto Cards',
  url: SITE_URL,
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web, iOS, Android',
  description:
    'Auto Cards turns uploaded slides, documents and notes into gamified, spaced-repetition flashcard decks.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

/**
 * Only on `/` — schema.org wants one canonical description of the product,
 * not one repeated on every page.
 *
 * No `aggregateRating`: fabricating one to look more complete is exactly the
 * kind of structured-data spam Google's guidelines call out, and there is no
 * real rating to report yet.
 */
export function LandingJsonLd() {
  const location = useLocation();
  if (location.pathname !== '/') return null;

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />;
}
