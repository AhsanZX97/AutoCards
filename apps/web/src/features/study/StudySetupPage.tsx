import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  DIFFICULTIES,
  PRIORITIES,
  STUDY_MODES,
  SHUFFLE_MODES,
  applyModePreset,
  computeDeckStats,
  createDefaultStudySettings,
  filterCards,
  normalizeStudySettings,
  type StudySettings,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';
import { useTour } from '../../lib/useTour';
import { Button, Card, CardBody, Chip, Field, FormNotice, Select, Slider, Switch } from '../../components/ui';
import { TourOverlay } from '../../components/tour';
import { EMPTY_ARRAY } from '../../lib/empty';
import { studyTourSteps } from './studyTourSteps';
import { STUDY_MODE_ICONS } from './studyModeIcons';

export function StudySetupPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const app = useApp();
  const t = useT();

  const deck = app.deckStore((s) => (deckId ? s.getDeck(deckId) : undefined));
  const cards = app.deckStore((s) => (deckId ? s.cardsByDeck[deckId] ?? EMPTY_ARRAY : EMPTY_ARRAY));
  const startSession = app.studyStore((s) => s.startSession);

  // Decks saved before a mode was retired still name it, which would leave the
  // picker with nothing selected — normalize before it reaches the UI.
  const [settings, setSettings] = useState<StudySettings>(() =>
    deck ? normalizeStudySettings(deck.defaultSettings) : createDefaultStudySettings(),
  );

  const stats = useMemo(() => computeDeckStats(cards), [cards]);
  // What the session would actually queue up. `activeCount` below only counts
  // unsuspended cards, so it says nothing about whether the filters match.
  const matchingCount = useMemo(() => filterCards(cards, settings.filters).length, [cards, settings.filters]);
  // Runs once, the first time anyone reaches the session setup. Held off until
  // the deck has loaded so the first step never lands on "Deck not found".
  const tour = useTour('study-setup', Boolean(deck));

  if (!deckId) return <Navigate to="/app/decks" replace />;
  if (!deck) {
    return (
      <Card>
        <CardBody className="py-16 text-center text-slate-500 dark:text-slate-400">{t('studySetup.notFound')}</CardBody>
      </Card>
    );
  }
  const activeDeck = deck;

  function setMode(mode: StudySettings['mode']) {
    setSettings((s) => applyModePreset(s, mode));
  }

  function update<K extends keyof StudySettings>(key: K, value: StudySettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function updateFilters<K extends keyof StudySettings['filters']>(key: K, value: StudySettings['filters'][K]) {
    setSettings((s) => ({ ...s, filters: { ...s.filters, [key]: value } }));
  }

  function updateTimer<K extends keyof StudySettings['timer']>(key: K, value: StudySettings['timer'][K]) {
    setSettings((s) => ({ ...s, timer: { ...s.timer, [key]: value } }));
  }

  function toggleDifficulty(d: (typeof DIFFICULTIES)[number]) {
    const current = settings.filters.difficulties;
    updateFilters('difficulties', current.includes(d) ? current.filter((x) => x !== d) : [...current, d]);
  }

  function togglePriority(p: (typeof PRIORITIES)[number]) {
    const current = settings.filters.priorities;
    updateFilters('priorities', current.includes(p) ? current.filter((x) => x !== p) : [...current, p]);
  }

  function toggleCategory(id: string) {
    const current = settings.filters.categoryIds;
    updateFilters('categoryIds', current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  function handleStart() {
    // Starting with an empty queue would create a session the runner cannot
    // show, which used to bounce the learner back to the deck with no reason
    // given. The button is disabled in that case; this is the backstop.
    if (matchingCount === 0) return;
    startSession(activeDeck, cards, settings);
    navigate(`/app/study/${deckId}/run`);
  }

  const activeCount = cards.filter((c) => !c.suspended).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          {t('studySetup.title', { deckTitle: deck.title })}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t.plural('studySetup.cardsAvailable', activeCount, { count: activeCount })}
        </p>
      </div>

      <Card data-tour="study-mode">
        <CardBody>
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">{t('studySetup.studyMode')}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {STUDY_MODES.map((mode) => {
              const active = settings.mode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setMode(mode)}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-brand-600 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                  }`}
                >
                  <span className="text-xl">{STUDY_MODE_ICONS[mode]}</span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                      {t(`studyMode.${mode}` as const)}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      {t(`studyMode.${mode}.description` as const)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Card data-tour="study-pacing">
        <CardBody className="space-y-5">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('studySetup.cardOrderPacing')}</h3>

          <Field label={t('studySetup.shuffle')}>
            <Select value={settings.shuffle} onChange={(e) => update('shuffle', e.target.value as StudySettings['shuffle'])}>
              {SHUFFLE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`shuffleMode.${mode}` as const)}
                </option>
              ))}
            </Select>
          </Field>

          <Slider
            label={t('studySetup.cardLimit')}
            value={settings.filters.cardLimit}
            min={0}
            max={Math.max(20, activeCount)}
            step={5}
            onChange={(v) => updateFilters('cardLimit', v)}
            formatValue={(v) => (v === 0 ? t('studySetup.noLimit') : t('studySetup.cardsUnit', { count: v }))}
          />

          <Switch
            checked={settings.timer.enabled}
            onChange={(v) => updateTimer('enabled', v)}
            label={t('studySetup.timer')}
            description={t('studySetup.timerDescription')}
          />
          {settings.timer.enabled && (
            <Slider
              label={t('studySetup.secondsPerCard')}
              value={settings.timer.perCardSeconds}
              min={5}
              max={90}
              step={5}
              onChange={(v) => updateTimer('perCardSeconds', v)}
              formatValue={(v) => t('studySetup.secondsUnit', { count: v })}
            />
          )}

          <Switch checked={settings.reversed} onChange={(v) => update('reversed', v)} label={t('studySetup.reversed')} description={t('studySetup.reversedDescription')} />
        </CardBody>
      </Card>

      <Card data-tour="study-filters">
        <CardBody className="space-y-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('studySetup.filters')}</h3>

          {deck.categories.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t('studySetup.categories')}</p>
              <div className="flex flex-wrap gap-2">
                {deck.categories.map((cat) => (
                  <Chip key={cat.id} active={settings.filters.categoryIds.includes(cat.id)} onClick={() => toggleCategory(cat.id)}>
                    {cat.icon} {cat.name}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t('studySetup.difficulty')}</p>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => (
                <Chip key={d} active={settings.filters.difficulties.includes(d)} onClick={() => toggleDifficulty(d)}>
                  {t(`difficulty.${d}` as const)}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t('studySetup.priority')}</p>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <Chip key={p} active={settings.filters.priorities.includes(p)} onClick={() => togglePriority(p)}>
                  {t(`priority.${p}` as const)}
                </Chip>
              ))}
            </div>
          </div>

          <Switch checked={settings.filters.starredOnly} onChange={(v) => updateFilters('starredOnly', v)} label={t('studySetup.starredOnly')} />
          <Switch
            checked={settings.filters.excludeMastered}
            onChange={(v) => updateFilters('excludeMastered', v)}
            label={t('studySetup.excludeMastered')}
            description={t('studySetup.excludeMasteredDescription', { threshold: settings.filters.masteredThreshold })}
          />
        </CardBody>
      </Card>

      <Card data-tour="study-scoring">
        <CardBody className="space-y-1">
          <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">{t('studySetup.scoring')}</h3>
          <Switch checked={settings.streakBonus} onChange={(v) => update('streakBonus', v)} label={t('studySetup.streakBonus')} description={t('studySetup.streakBonusDescription')} />
          <Switch checked={settings.speedBonus} onChange={(v) => update('speedBonus', v)} label={t('studySetup.speedBonus')} description={t('studySetup.speedBonusDescription')} />
          <Switch checked={settings.hintPenalty} onChange={(v) => update('hintPenalty', v)} label={t('studySetup.hintPenalty')} description={t('studySetup.hintPenaltyDescription')} />
          <Switch checked={settings.sound} onChange={(v) => update('sound', v)} label={t('studySetup.soundEffects')} />
        </CardBody>
      </Card>

      {matchingCount === 0 && (
        <FormNotice>
          {activeCount === 0 ? t('studySetup.allSuspended') : t('studySetup.noMatches')}
        </FormNotice>
      )}

      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => navigate(`/app/decks/${deckId}`)}>
          {t('studySetup.cancel')}
        </Button>
        <Button size="lg" data-tour="study-start" onClick={handleStart} disabled={matchingCount === 0}>
          {t('studySetup.startStudying')}
        </Button>
      </div>

      <TourOverlay open={tour.open} steps={studyTourSteps(t)} onFinish={tour.finish} />
    </div>
  );
}
