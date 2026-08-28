import { useMemo } from 'react';
import { computeDeckStats, deckSources, getAnswerText, getPromptText, type Deck, type Flashcard } from '@autocards/core';
import { Badge, Button, Card, CardBody } from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import { cardTypeLabelT } from '../../../lib/cardTypeLabel';
import { DIFFICULTY_BADGE } from '../../../lib/badges';
import { cn } from '../../../lib/cn';

/** The deck as it stands the moment generation finishes: every card new, nothing studied. */
export function DeckFrame({
  deck,
  cards,
  compact,
  onStudy,
}: {
  deck: Deck;
  cards: Flashcard[];
  compact: boolean;
  onStudy: () => void;
}) {
  const t = useT();
  const stats = useMemo(() => computeDeckStats(cards), [cards]);
  const source = deckSources(deck)[0];

  return (
    <div className={cn('mx-auto max-w-3xl', compact ? 'space-y-4 p-4 pt-10' : 'space-y-6 p-8')}>
      <div className={cn('flex gap-4', compact ? 'flex-col' : 'items-start justify-between')}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="text-3xl">{deck.icon}</span>
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">{deck.title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{deck.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {deck.tags.map((tag) => (
                <Badge key={tag} variant="neutral">
                  #{tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <Button size="lg" className={cn('shrink-0 justify-center', compact && 'w-full')} onClick={onStudy}>
          {t('demo.deck.studyNow')}
        </Button>
      </div>

      {source && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {t('demo.deck.sourceLine', { filename: source.filename, pages: source.pageCount ?? 0 })}
          {deck.generatedBy ? ` · ${t('demo.deck.generatedBy', { model: deck.generatedBy })}` : ''}
        </p>
      )}

      <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-4')}>
        <Stat label={t('demo.deck.cards')} value={stats.total} />
        <Stat label={t('demo.deck.new')} value={stats.new} />
        <Stat label={t('demo.deck.mastered')} value={stats.mastered} />
        <Stat label={t('demo.deck.averageMastery')} value={`${stats.averageMastery}%`} />
      </div>

      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-2')}>
        {cards.map((card) => (
          <Card key={card.id}>
            <CardBody className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="neutral">{cardTypeLabelT(t, card.type)}</Badge>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_BADGE[card.difficulty].classes}`}>
                  {t(`difficulty.${card.difficulty}` as const)}
                </span>
              </div>
              <p className="text-sm font-semibold leading-snug text-slate-900 dark:text-white">{getPromptText(card)}</p>
              <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{getAnswerText(card)}</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardBody className="p-4 text-center">
        <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </CardBody>
    </Card>
  );
}
