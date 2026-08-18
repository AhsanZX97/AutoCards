import type { Translator } from '@autocards/core';
import type { TourStep } from '../../components/tour';

export function studyTourSteps(t: Translator): TourStep[] {
  return [
    {
      title: t('studyTour.intro.title'),
      body: t('studyTour.intro.body'),
    },
    {
      target: 'study-mode',
      title: t('studyTour.mode.title'),
      body: t('studyTour.mode.body'),
    },
    {
      target: 'study-pacing',
      title: t('studyTour.pacing.title'),
      body: t('studyTour.pacing.body'),
    },
    {
      target: 'study-filters',
      title: t('studyTour.filters.title'),
      body: t('studyTour.filters.body'),
    },
    {
      target: 'study-scoring',
      title: t('studyTour.scoring.title'),
      body: t('studyTour.scoring.body'),
    },
    {
      target: 'study-start',
      title: t('studyTour.start.title'),
      body: t('studyTour.start.body'),
    },
  ];
}
