import { describe, expect, it } from 'vitest';
import { placeTourTooltip, spotlightRect } from '../tourPlacement';
import type { TourRect } from '../../types';

const VIEWPORT = { width: 1000, height: 800 };
const TOOLTIP = { width: 320, height: 200 };

function rect(partial: Partial<TourRect> = {}): TourRect {
  return { top: 300, left: 340, width: 320, height: 60, ...partial };
}

describe('placeTourTooltip', () => {
  it('centres the tooltip when the step has no target', () => {
    const result = placeTourTooltip({ target: null, tooltip: TOOLTIP, viewport: VIEWPORT });
    expect(result).toEqual({ placement: 'center', top: 300, left: 340 });
  });

  it('sits below the target when there is room underneath', () => {
    const result = placeTourTooltip({ target: rect(), tooltip: TOOLTIP, viewport: VIEWPORT, gap: 12 });
    expect(result.placement).toBe('bottom');
    expect(result.top).toBe(372);
  });

  it('flips above the target when the space below is too short', () => {
    const result = placeTourTooltip({
      target: rect({ top: 700 }),
      tooltip: TOOLTIP,
      viewport: VIEWPORT,
      gap: 12,
    });
    expect(result.placement).toBe('top');
    expect(result.top).toBe(488);
  });

  it('centres the tooltip horizontally on the target', () => {
    const result = placeTourTooltip({ target: rect({ left: 340, width: 320 }), tooltip: TOOLTIP, viewport: VIEWPORT });
    expect(result.left).toBe(340);
  });

  it('clamps a tooltip that would overhang the right edge', () => {
    const result = placeTourTooltip({
      target: rect({ left: 900, width: 80 }),
      tooltip: TOOLTIP,
      viewport: VIEWPORT,
      margin: 16,
    });
    expect(result.left).toBe(664);
  });

  it('clamps a tooltip that would overhang the left edge', () => {
    const result = placeTourTooltip({
      target: rect({ left: 0, width: 80 }),
      tooltip: TOOLTIP,
      viewport: VIEWPORT,
      margin: 16,
    });
    expect(result.left).toBe(16);
  });

  it('pins to the left margin when the tooltip is wider than the viewport', () => {
    const result = placeTourTooltip({
      target: rect(),
      tooltip: { width: 1200, height: 200 },
      viewport: VIEWPORT,
      margin: 16,
    });
    expect(result.left).toBe(16);
  });

  it('takes the roomier side and stays on screen when neither side fits', () => {
    const tall = { width: 320, height: 600 };
    const result = placeTourTooltip({
      target: rect({ top: 200, height: 400 }),
      tooltip: tall,
      viewport: VIEWPORT,
      margin: 16,
    });
    expect(result.placement).toBe('bottom');
    expect(result.top).toBe(184);
  });
});

describe('spotlightRect', () => {
  it('grows the target by the padding on every side', () => {
    expect(spotlightRect(rect({ top: 100, left: 100, width: 200, height: 50 }), 8)).toEqual({
      top: 92,
      left: 92,
      width: 216,
      height: 66,
    });
  });

  it('never reports a negative origin for a target at the viewport edge', () => {
    expect(spotlightRect(rect({ top: 2, left: 0, width: 200, height: 50 }), 8)).toEqual({
      top: 0,
      left: 0,
      width: 216,
      height: 66,
    });
  });
});
