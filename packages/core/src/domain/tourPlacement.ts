import type { TourPlacement, TourRect } from '../types';

export interface TourPlacementInput {
  /** The highlighted element's viewport rect, or null for a centred step. */
  target: TourRect | null;
  tooltip: { width: number; height: number };
  viewport: { width: number; height: number };
  /** Breathing room between the spotlight and the tooltip. */
  gap?: number;
  /** Closest the tooltip may come to a viewport edge. */
  margin?: number;
}

export interface TourPlacementResult {
  top: number;
  left: number;
  placement: TourPlacement;
}

const DEFAULT_GAP = 12;
const DEFAULT_MARGIN = 16;

function clamp(value: number, min: number, max: number): number {
  // `min` wins on a crossed range, which is what happens when the tooltip is
  // larger than the space it has to sit in — pin it to the near edge instead of
  // pushing it off the far one.
  return Math.max(min, Math.min(value, max));
}

/**
 * Where a tour tooltip goes for a given target: under it by default, above it
 * when the bottom of the screen is too close, and dead centre when the step
 * highlights nothing at all.
 *
 * Pure geometry, so the overlay only has to supply measured rects.
 */
export function placeTourTooltip({
  target,
  tooltip,
  viewport,
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN,
}: TourPlacementInput): TourPlacementResult {
  if (!target) {
    return {
      placement: 'center',
      top: Math.round((viewport.height - tooltip.height) / 2),
      left: Math.round((viewport.width - tooltip.width) / 2),
    };
  }

  const maxTop = viewport.height - margin - tooltip.height;
  const below = target.top + target.height + gap;
  const above = target.top - gap - tooltip.height;

  const fitsBelow = below <= maxTop;
  const fitsAbove = above >= margin;

  let placement: TourPlacement;
  if (fitsBelow) placement = 'bottom';
  else if (fitsAbove) placement = 'top';
  else {
    // Neither side holds the whole tooltip, so take whichever has more room and
    // let the clamp below keep it on screen.
    const roomBelow = viewport.height - margin - below;
    const roomAbove = target.top - gap - margin;
    placement = roomBelow >= roomAbove ? 'bottom' : 'top';
  }

  const desiredLeft = target.left + target.width / 2 - tooltip.width / 2;

  return {
    placement,
    top: Math.round(clamp(placement === 'bottom' ? below : above, margin, maxTop)),
    left: Math.round(clamp(desiredLeft, margin, viewport.width - margin - tooltip.width)),
  };
}

/**
 * The cutout the spotlight punches out of the dimmed backdrop — the target with
 * a little padding, kept from starting off the top or left of the screen so the
 * ring never draws at a negative origin.
 */
export function spotlightRect(target: TourRect, padding: number): TourRect {
  return {
    top: Math.max(0, target.top - padding),
    left: Math.max(0, target.left - padding),
    width: target.width + padding * 2,
    height: target.height + padding * 2,
  };
}
