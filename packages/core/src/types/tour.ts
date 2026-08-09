/**
 * Guided first-run walkthroughs, one per screen that has enough going on to
 * need one. The ids are persisted, so renaming one re-runs that tour for
 * everyone who had already finished it.
 */
export const TOUR_IDS = ['deck-detail', 'study-setup'] as const;

export type TourId = (typeof TOUR_IDS)[number];

/** Which corner of the target a tour tooltip is anchored to. */
export type TourPlacement = 'top' | 'bottom' | 'center';

/** A rectangle in viewport coordinates — what `getBoundingClientRect` returns. */
export interface TourRect {
  top: number;
  left: number;
  width: number;
  height: number;
}
