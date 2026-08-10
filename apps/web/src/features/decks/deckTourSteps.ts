import type { TourStep } from '../../components/tour';

/** Module-level so the reference stays stable across renders of the page. */
export const DECK_TOUR_STEPS: TourStep[] = [
  {
    title: 'This is your deck',
    body: 'A quick tour of what you can do here, about thirty seconds. You can skip it and it will not come back.',
  },
  {
    target: 'deck-add-card',
    title: 'Two ways to add cards',
    body: 'Write a card yourself, or upload a PDF, Word file or slides and let AI draft a batch of them for you.',
  },
  {
    target: 'deck-progress',
    title: 'Watch your progress',
    body: 'Cards move from new to learning to mastered as you answer them correctly. Tap the ⓘ to see how each number is worked out.',
  },
  {
    target: 'deck-filters',
    title: 'Find any card fast',
    body: 'Search the text, or narrow the deck down to one difficulty, your starred cards, or the ones you have paused.',
  },
  {
    target: 'deck-view',
    title: 'Two ways to look at it',
    body: 'List view is for editing and reordering. Flashcards view flips through the deck: use ← → to move and space to flip.',
  },
  {
    target: 'deck-edit',
    title: 'Shape the deck',
    body: 'Rename it, pick an icon and colour, and set up categories so you can study one topic at a time.',
  },
  {
    target: 'deck-study',
    title: 'Then study it',
    body: 'This opens the session setup, where you choose a mode and how many cards to run through.',
  },
];
