import { STUDY_MODES, applyModePreset, type StudySettings } from '@autocards/core';
import { Button, Card, CardBody, Switch } from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import { STUDY_MODE_ICONS } from '../../study/studyModeIcons';
import { cn } from '../../../lib/cn';

/**
 * The mode picker, wired to the settings the run below it actually uses —
 * picking Survival really does hand the runner three lives, and turning the
 * speed bonus off really does drop it out of the score breakdown two screens
 * later.
 */
export function SetupFrame({
  deckTitle,
  cardCount,
  settings,
  onChange,
  compact,
  onStart,
}: {
  deckTitle: string;
  cardCount: number;
  settings: StudySettings;
  onChange: (settings: StudySettings) => void;
  compact: boolean;
  onStart: () => void;
}) {
  const t = useT();

  return (
    <div className={cn('mx-auto max-w-3xl', compact ? 'space-y-4 p-4 pt-10' : 'space-y-6 p-8')}>
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          {t('studySetup.title', { deckTitle })}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t.plural('studySetup.cardsAvailable', cardCount, { count: cardCount })}
        </p>
      </div>

      <Card>
        <CardBody>
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">{t('studySetup.studyMode')}</h3>
          <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-2')}>
            {STUDY_MODES.map((mode) => {
              const active = settings.mode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => onChange(applyModePreset(settings, mode))}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-4 text-left transition-colors',
                    active
                      ? 'border-brand-600 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700',
                  )}
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

      <Card>
        <CardBody className="space-y-1">
          <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">{t('studySetup.scoring')}</h3>
          <Switch
            checked={settings.streakBonus}
            onChange={(value) => onChange({ ...settings, streakBonus: value })}
            label={t('studySetup.streakBonus')}
            description={t('studySetup.streakBonusDescription')}
          />
          <Switch
            checked={settings.speedBonus}
            onChange={(value) => onChange({ ...settings, speedBonus: value })}
            label={t('studySetup.speedBonus')}
            description={t('studySetup.speedBonusDescription')}
          />
          <Switch
            checked={settings.timer.enabled}
            onChange={(value) => onChange({ ...settings, timer: { ...settings.timer, enabled: value } })}
            label={t('studySetup.timer')}
            description={t('studySetup.timerDescription')}
          />
        </CardBody>
      </Card>

      <Button size="lg" className="w-full justify-center" onClick={onStart}>
        {t('studySetup.startStudying')}
      </Button>
    </div>
  );
}
