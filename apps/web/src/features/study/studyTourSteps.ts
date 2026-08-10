import type { TourStep } from '../../components/tour';

/** Module-level so the reference stays stable across renders of the page. */
export const STUDY_TOUR_STEPS: TourStep[] = [
  {
    title: 'Set up your session',
    body: 'Nothing here is permanent. These choices shape this one session, and you can change them next time.',
  },
  {
    target: 'study-mode',
    title: 'Pick how you want to be asked',
    body: 'Each mode sets sensible defaults for everything below it, so choosing one is usually all you need to do.',
  },
  {
    target: 'study-pacing',
    title: 'Order and pacing',
    body: 'Shuffle the deck, cap how many cards come up, and add a per-card countdown if you want the pressure.',
  },
  {
    target: 'study-filters',
    title: 'Narrow it down',
    body: 'Study one category, one difficulty, or just your starred cards. "Exclude mastered" keeps you on the cards you still get wrong.',
  },
  {
    target: 'study-scoring',
    title: 'Scoring',
    body: 'Bonuses for streaks and quick answers, a penalty for peeking at a hint. Turn off what you do not want counted.',
  },
  {
    target: 'study-start',
    title: 'That is it',
    body: 'Start the session and answer the cards. You will get a breakdown of how you did at the end.',
  },
];
