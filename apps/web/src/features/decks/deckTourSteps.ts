import type { Translator } from '@autocards/core';
import type { TourStep } from '../../components/tour';

export function deckTourSteps(t: Translator): TourStep[] {
  return [
    {
      title: t('deckTour.intro.title'),
      body: t('deckTour.intro.body'),
    },
    {
      target: 'deck-add-card',
      title: t('deckTour.addCard.title'),
      body: t('deckTour.addCard.body'),
    },
    {
      target: 'deck-progress',
      title: t('deckTour.progress.title'),
      body: t('deckTour.progress.body'),
    },
    {
      target: 'deck-filters',
      title: t('deckTour.filters.title'),
      body: t('deckTour.filters.body'),
    },
    {
      target: 'deck-view',
      title: t('deckTour.view.title'),
      body: t('deckTour.view.body'),
    },
    {
      target: 'deck-edit',
      title: t('deckTour.edit.title'),
      body: t('deckTour.edit.body'),
    },
    {
      target: 'deck-study',
      title: t('deckTour.study.title'),
      body: t('deckTour.study.body'),
    },
  ];
}
