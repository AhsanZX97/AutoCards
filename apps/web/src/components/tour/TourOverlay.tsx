import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { placeTourTooltip, spotlightRect, type TourRect } from '@autocards/core';
import { Button } from '../ui';
import { cn } from '../../lib/cn';
import { useT } from '../../lib/i18n';
import type { TourStep } from './types';

/** Breathing room between the highlighted element and the edge of the hole. */
const SPOTLIGHT_PADDING = 8;
const TOOLTIP_WIDTH = 340;
/** Keeps the tooltip clear of the screen edge on a phone. */
const VIEWPORT_MARGIN = 16;

interface TourOverlayProps {
  open: boolean;
  /** Must be a stable reference — a new array each render restarts the tour. */
  steps: TourStep[];
  /** Called once, whether the learner reached the end or skipped out. */
  onFinish: () => void;
}

/**
 * A guided walkthrough: the page dims, one element at a time stays lit, and a
 * tooltip beside it says what that element does.
 *
 * The dimming is a single element sitting over the hole with an enormous
 * spread shadow, so there is one moving part to keep in step with the target
 * rather than four panes around it.
 */
export function TourOverlay({ open, steps, onFinish }: TourOverlayProps) {
  const t = useT();
  const [visibleSteps, setVisibleSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TourRect | null>(null);
  const [tooltipSize, setTooltipSize] = useState({ width: TOOLTIP_WIDTH, height: 0 });
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  const tooltipRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const step = visibleSteps[index];
  const isLast = index === visibleSteps.length - 1;

  // A step whose element never rendered — the flashcard toggle on a deck with
  // no cards, say — would spotlight nothing, so drop it before counting steps.
  useEffect(() => {
    if (!open) {
      setVisibleSteps([]);
      setIndex(0);
      return;
    }
    const present = steps.filter((s) => !s.target || document.querySelector(`[data-tour="${s.target}"]`));
    if (present.length === 0) {
      onFinish();
      return;
    }
    setVisibleSteps(present);
    setIndex(0);
  }, [open, steps, onFinish]);

  useEffect(() => {
    if (!open) return undefined;
    function onResize() {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  // Follow the target: the smooth scroll below, a resize, and any layout shift
  // under it all move the hole, so re-measure rather than trust one reading.
  useEffect(() => {
    if (!open || !step) return undefined;
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    if (!el) {
      setTargetRect(null);
      return undefined;
    }

    function measure() {
      const rect = el!.getBoundingClientRect();
      setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    }

    measure();
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Capture phase, because the element may sit inside its own scroller.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, step]);

  // Measured rather than assumed, because the copy decides the height. No dep
  // array: the size can change on any render, and the equality guard below is
  // what stops that from looping.
  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTooltipSize((prev) =>
      Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
        ? prev
        : { width: rect.width, height: rect.height },
    );
  });

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onFinish();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, visibleSteps.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onFinish, visibleSteps.length]);

  // Puts the keyboard where the tour is, so Enter walks through it.
  useEffect(() => {
    if (open && step) nextRef.current?.focus({ preventScroll: true });
  }, [open, step]);

  if (!open || !step) return null;

  const hole = targetRect ? spotlightRect(targetRect, SPOTLIGHT_PADDING) : null;
  const position = placeTourTooltip({
    target: targetRect,
    tooltip: tooltipSize,
    viewport,
    margin: VIEWPORT_MARGIN,
  });

  // The little pointer sits under the middle of the target, not the middle of
  // the tooltip, which are different once the tooltip is clamped to an edge.
  const arrowLeft =
    targetRect && position.placement !== 'center'
      ? Math.min(Math.max(targetRect.left + targetRect.width / 2 - position.left, 24), tooltipSize.width - 24)
      : null;

  function next() {
    if (isLast) onFinish();
    else setIndex((i) => i + 1);
  }

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      {hole ? (
        // Deliberately not transitioned: the hole is re-measured on every
        // scroll event, and an easing curve would leave it trailing the
        // element it is meant to be cut around.
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand-400"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.72)',
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-slate-950/70" />
      )}

      <div
        // Keyed on the step so the pop-in replays each time the tooltip moves.
        key={index}
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className={cn(
          'absolute rounded-2xl bg-white p-5 shadow-2xl animate-pop-in dark:bg-slate-900',
          // Nothing is measured on the very first frame, so the tooltip would
          // otherwise flash in the top-left corner before it lands. Faded
          // rather than hidden, because a hidden button cannot take focus.
          tooltipSize.height === 0 && 'opacity-0',
        )}
        style={{
          top: position.top,
          left: position.left,
          width: Math.min(TOOLTIP_WIDTH, viewport.width - VIEWPORT_MARGIN * 2),
        }}
      >
        {arrowLeft !== null && (
          <div
            aria-hidden
            className="absolute h-3 w-3 rotate-45 bg-white dark:bg-slate-900"
            style={{
              left: arrowLeft - 6,
              ...(position.placement === 'bottom' ? { top: -6 } : { bottom: -6 }),
            }}
          />
        )}

        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">
          {t('tour.stepOf', { current: index + 1, total: visibleSteps.length })}
        </p>
        <h2 id="tour-title" className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
          {step.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onFinish}
            className="text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline dark:hover:text-slate-200"
          >
            {t('tour.skip')}
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setIndex((i) => i - 1)}>
                {t('tour.back')}
              </Button>
            )}
            <Button ref={nextRef} size="sm" onClick={next}>
              {isLast ? t('tour.gotIt') : t('tour.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
