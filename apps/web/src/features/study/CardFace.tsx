import type { Flashcard } from '@autocards/core';
import { DIFFICULTY_BADGE } from '../../lib/badges';

interface CardFaceProps {
  card: Flashcard;
  flipped: boolean;
  promptText: string;
  answerText: string;
  onFlip: () => void;
}

export function CardFace({ card, flipped, promptText, answerText, onFlip }: CardFaceProps) {
  return (
    <div className="relative" style={{ perspective: '1200px' }}>
      <div
        onClick={() => !flipped && onFlip()}
        className="relative min-h-[280px] w-full cursor-pointer transition-transform duration-500"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front */}
        <div
          className="card-face absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-glow"
        >
          <span className={`mb-4 rounded-full px-2.5 py-1 text-xs font-medium ${DIFFICULTY_BADGE[card.difficulty].classes}`}>
            {DIFFICULTY_BADGE[card.difficulty].label}
          </span>
          <p className="text-lg font-semibold leading-snug text-white sm:text-xl">{promptText}</p>
          <p className="mt-6 text-xs text-slate-500">Click card or "Show answer" to flip</p>
        </div>

        {/* Back */}
        <div
          className="card-face absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-indigo-500/40 bg-gradient-to-br from-indigo-950 to-slate-900 p-8 text-center shadow-glow"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <span className="mb-4 text-xs font-medium uppercase tracking-wide text-indigo-400">Answer</span>
          <p className="text-lg font-semibold leading-snug text-white sm:text-xl">{answerText}</p>
        </div>
      </div>
    </div>
  );
}
