import { useMemo, useState } from 'react';
import {
  analyticsDelta,
  compactCount,
  funnelStages,
  remindersHealth,
  type AnalyticsDay,
  type AnalyticsReport,
} from '@autocards/core';
import { Badge, Card, CardBody } from '../../components/ui';
import { cn } from '../../lib/cn';
import { ChartCard } from './charts/ChartCard';
import { DataTable } from './charts/DataTable';
import { DonutChart } from './charts/DonutChart';
import { FunnelChart } from './charts/FunnelChart';
import { RankedBars } from './charts/RankedBars';
import { StackedBar } from './charts/StackedBar';
import { StatTile } from './charts/StatTile';
import { TimeSeriesChart } from './charts/TimeSeriesChart';
import {
  SERIES_COLORS,
  STATUS_COLORS,
  areaPath,
  formatNumber,
  formatPercent,
  linePath,
} from './charts/chartUtils';
import { WINDOW_PRESETS, useAnalytics } from './useAnalytics';

/**
 * The owner's dashboard. English only, and deliberately not translated: it is a
 * one-person screen, and forty strings in every locale for an audience of one
 * is a cost with no reader.
 *
 * Everything on it comes from `admin_analytics` in one call — see
 * `supabase/migrations/0014_admin_analytics.sql`. Nothing here recomputes a
 * number the server already worked out, so the page and a SQL snippet can never
 * disagree about what a week was.
 */
export function AnalyticsPage() {
  const [days, setDays] = useState<number>(7);
  const { report, loading, refreshing, error, reason, reload } = useAnalytics(days);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Analytics</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {report
              ? `${report.from} → ${report.to} · days cut on ${report.timeZone}`
              : 'Everything across every account, straight from Postgres.'}
          </p>
        </div>

        {/* One filter row, above everything it scopes: every card below reads
            the same window, so no two numbers can be about different weeks. */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            {WINDOW_PRESETS.map((preset) => (
              <button
                key={preset.days}
                type="button"
                onClick={() => setDays(preset.days)}
                aria-pressed={days === preset.days}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  days === preset.days
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {loading ? 'Reading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <Card>
          <CardBody className="flex items-start gap-3">
            <span aria-hidden className="text-lg">
              {reason === 'forbidden' ? '🔒' : '⚠️'}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {reason === 'forbidden' ? 'Not an administrator' : 'The analytics could not be read'}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error}</p>
              {reason === 'unavailable' && (
                <p className="mt-2 text-xs text-slate-400">
                  If this project has never run it, apply{' '}
                  <code className="font-mono">supabase/migrations/0014_admin_analytics.sql</code> in the SQL
                  editor.
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {!report && loading && <LoadingState />}

      {report && (
        <div className={cn('space-y-8 transition-opacity', refreshing && 'opacity-60')}>
          <Report report={report} days={days} />
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
      ))}
    </div>
  );
}

function Report({ report, days }: { report: AnalyticsReport; days: number }) {
  const versus = `vs previous ${days} days`;
  const dates = useMemo(() => report.daily.map((day) => day.date), [report]);

  const trend = (key: keyof AnalyticsDay) => report.daily.map((day) => day[key] as number | null);
  const series = (key: keyof AnalyticsDay, label: string, slot: number) => ({
    key: String(key),
    label,
    color: SERIES_COLORS[slot]!,
    values: trend(key),
  });

  const stages = funnelStages(report.funnel);
  const activated = stages.find((stage) => stage.key === 'studiedOnce');
  const health = remindersHealth(report.reminders);

  return (
    <>
      {/* ------------------------------------------------------- the headline */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardBody className="flex h-full flex-col justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Cards studied</p>
              <p className="mt-2 text-5xl font-semibold leading-none text-slate-900 dark:text-white">
                {compactCount(report.current.cardsStudied)}
              </p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                in the last {days} days, by {compactCount(report.current.learners)} people
              </p>
            </div>

            {/* The shape of the window under the headline number. Deliberately
                unlabelled — the chart below carries the values. */}
            <HeroTrend values={trend('cardsStudied')} />

            <dl className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center dark:border-slate-800">
              {[
                ['Accounts', report.lifetime.accounts],
                ['Decks', report.lifetime.decks],
                ['Cards', report.lifetime.cards],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-[11px] text-slate-400">{label}</dt>
                  <dd className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {compactCount(value as number)}
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:col-span-2 xl:grid-cols-3">
          <StatTile
            label="Active learners"
            value={report.current.learners}
            delta={analyticsDelta(report.current.learners, report.previous.learners)}
            deltaLabel={versus}
            trend={trend('learners')}
          />
          <StatTile
            label="Signups"
            value={report.current.signups}
            delta={analyticsDelta(report.current.signups, report.previous.signups)}
            deltaLabel={versus}
            trend={trend('signups')}
          />
          <StatTile
            label="Sessions"
            value={report.current.sessions}
            delta={analyticsDelta(report.current.sessions, report.previous.sessions)}
            deltaLabel={versus}
            trend={trend('sessions')}
          />
          <StatTile
            label="Decks created"
            value={report.current.decksCreated}
            delta={analyticsDelta(report.current.decksCreated, report.previous.decksCreated)}
            deltaLabel={versus}
            trend={trend('decksCreated')}
          />
          <StatTile
            label="Generations"
            value={report.current.generations}
            delta={analyticsDelta(report.current.generations, report.previous.generations)}
            deltaLabel={versus}
            trend={trend('generations')}
          />
          <StatTile
            label="Accuracy"
            value={report.current.accuracy}
            display={formatPercent(report.current.accuracy)}
            delta={analyticsDelta(report.current.accuracy, report.previous.accuracy)}
            deltaLabel={versus}
            trend={trend('accuracy')}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------- activity */}
      <Section title="Activity" note="Today is still running, so the last point on every chart sits low until the evening.">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard
            title="Who studied, and how much"
            subtitle="Distinct accounts that finished a run, against the number of runs."
            table={{
              columns: ['Day', 'Learners', 'Sessions'],
              rows: report.daily.map((day) => [day.date, day.learners, day.sessions]),
            }}
          >
            <TimeSeriesChart
              dates={dates}
              windowDays={days}
              series={[series('learners', 'Learners', 0), series('sessions', 'Sessions', 1)]}
            />
          </ChartCard>

          <ChartCard
            title="Cards answered"
            subtitle="The volume behind the learner count."
            table={{
              columns: ['Day', 'Cards'],
              rows: report.daily.map((day) => [day.date, day.cardsStudied]),
            }}
          >
            <TimeSeriesChart
              dates={dates}
              windowDays={days}
              area
              series={[series('cardsStudied', 'Cards studied', 0)]}
            />
          </ChartCard>

          <ChartCard
            title="Accuracy per day"
            subtitle="A slide usually means decks got harder or longer, not that people got worse. Days with no sessions are left blank."
            table={{
              columns: ['Day', 'Accuracy'],
              rows: report.daily.map((day) => [day.date, formatPercent(day.accuracy)]),
            }}
          >
            <TimeSeriesChart
              dates={dates}
              windowDays={days}
              yMax={100}
              format={(value) => (value === null ? '—' : `${value}%`)}
              series={[series('accuracy', 'Accuracy', 0)]}
            />
          </ChartCard>

          <ChartCard
            title="What a run looks like"
            subtitle="Averages across every session in the window."
            right={<Badge variant="neutral">{report.sessionShape.sessions} sessions</Badge>}
          >
            <div className="grid grid-cols-3 gap-4 py-4 text-center">
              {[
                ['Cards', formatNumber(report.sessionShape.avgCards)],
                ['Minutes', formatNumber(report.sessionShape.avgMinutes)],
                ['Accuracy', formatPercent(report.sessionShape.avgAccuracy)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
                  <p className="mt-1 text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <DonutChart
                centerLabel="sessions"
                slices={report.modes.map((mode) => ({
                  label: MODE_LABELS[mode.mode] ?? mode.mode,
                  value: mode.sessions,
                  note: mode.accuracy === null ? undefined : formatPercent(mode.accuracy),
                }))}
              />
            </div>
          </ChartCard>
        </div>

        <ChartCard
          title="Most-studied decks"
          subtitle="Deck titles are copied into each session summary, so decks that have since been deleted still appear."
        >
          <RankedBars
            unit="sessions"
            rows={report.topDecks.map((deck) => ({
              label: deck.deck,
              value: deck.sessions,
              note: `${compactCount(deck.cardsAnswered)} cards`,
            }))}
            empty="Nobody studied anything in this window."
          />
        </ChartCard>
      </Section>

      {/* ------------------------------------------------------------ growth */}
      <Section title="Growth" note="Whether the people who joined actually got anywhere.">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard
            title="Signups, and who got started"
            subtitle="Activated means they studied something within a day of joining."
            table={{
              columns: ['Day', 'Signed up', 'Activated'],
              rows: report.activation.map((day) => [day.date, day.signedUp, day.activated]),
            }}
          >
            <TimeSeriesChart
              dates={report.activation.map((day) => day.date)}
              windowDays={days}
              kind="column"
              series={[
                {
                  key: 'signedUp',
                  label: 'Signed up',
                  color: SERIES_COLORS[0]!,
                  values: report.activation.map((day) => day.signedUp),
                },
                {
                  key: 'activated',
                  label: 'Activated',
                  color: SERIES_COLORS[1]!,
                  values: report.activation.map((day) => day.activated),
                },
              ]}
            />
          </ChartCard>

          <ChartCard
            title="How far this window's signups got"
            subtitle="The gap between building a deck and studying it is the one worth chasing — that person spent a generation and got nothing back."
            right={
              activated?.share !== null && activated?.share !== undefined ? (
                <Badge variant={activated.share >= 50 ? 'success' : 'warning'}>{activated.share}% activated</Badge>
              ) : undefined
            }
          >
            <FunnelChart stages={stages} />
          </ChartCard>

          <ChartCard
            title="Decks and cards being made"
            subtitle="Timestamps here are written by the device, not the server, so treat them as indicative."
            table={{
              columns: ['Day', 'Decks', 'Generated', 'Cards'],
              rows: report.daily.map((day) => [day.date, day.decksCreated, day.generations, day.cardsCreated]),
            }}
          >
            <TimeSeriesChart
              dates={dates}
              windowDays={days}
              kind="column"
              series={[series('decksCreated', 'Decks', 0), series('generations', 'of which generated', 1)]}
            />
          </ChartCard>

          <ChartCard
            title="Signed up, never studied"
            subtitle="The short list worth reading. Today's entries may simply not have got to it yet."
          >
            <DataTable
              rows={report.stalled}
              rowKey={(row) => row.username}
              empty="Everybody who joined has studied something."
              columns={[
                {
                  header: 'Username',
                  cell: (row) => <span className="font-medium text-slate-700 dark:text-slate-200">@{row.username}</span>,
                },
                { header: 'Joined', cell: (row) => new Date(row.signedUp).toLocaleString('en-GB') },
                {
                  header: 'Has a deck',
                  align: 'right',
                  cell: (row) => (row.hasADeck ? 'Yes' : 'No'),
                },
              ]}
            />
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="How they arrived" subtitle="An unconfirmed pile-up usually means the mail is landing in spam.">
            <DataTable
              rows={report.providers}
              rowKey={(row) => row.provider}
              empty="No signups in this window."
              columns={[
                { header: 'Provider', cell: (row) => row.provider },
                { header: 'Signups', align: 'right', cell: (row) => row.signups },
                {
                  header: 'Confirmed',
                  align: 'right',
                  cell: (row) => (
                    <span className={cn(row.confirmed < row.signups && 'text-amber-600 dark:text-amber-400')}>
                      {row.confirmed}
                    </span>
                  ),
                },
              ]}
            />
          </ChartCard>

          <ChartCard
            title="Sign-in recency"
            subtitle="A floor, not a count of active users: staying signed in on a device produces no fresh sign-in for months."
          >
            <div className="grid grid-cols-2 gap-4 py-2 sm:grid-cols-4">
              {[
                ['Today', report.signIns.signedInToday],
                [`Last ${days}d`, report.signIns.signedInWindow],
                ['Accounts', report.signIns.accounts],
                ['Unconfirmed', report.signIns.unconfirmed],
              ].map(([label, value]) => (
                <div key={label as string} className="text-center">
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                    {compactCount(value as number)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      </Section>

      {/* ------------------------------------------------------------- money */}
      <Section title="Money" note="Plans as the server holds them, and what generation is costing.">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Plan mix" subtitle="A snapshot of every account, not just this window's.">
            <StackedBar
              segments={report.planMix.map((row) => ({ label: row.plan, value: row.users }))}
              empty="No accounts yet."
            />
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4 dark:border-slate-800">
              {[
                ['Active', report.subscriptions.active],
                ['Trialing', report.subscriptions.trialing],
                ['Past due', report.subscriptions.pastDue],
                ['Cancelling', report.subscriptions.cancelling],
              ].map(([label, value]) => (
                <div key={label as string} className="text-center">
                  <p className="text-xl font-semibold text-slate-900 dark:text-white">{value as number}</p>
                  <p className="mt-1 text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard
            title="Uploads this month"
            subtitle={`The authoritative spend figure, for ${report.usage.period}. Monthly by design — this is the allowance period, not the window above.`}
          >
            <div className="grid grid-cols-3 gap-4 py-4 text-center">
              {[
                ['Uploads', report.usage.uploads],
                ['People', report.usage.usersWhoGenerated],
                ['Heaviest', report.usage.heaviestSingleUser],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                    {compactCount(value as number)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <DataTable
                rows={report.topUploaders}
                rowKey={(row) => row.username}
                maxHeight="12rem"
                empty="Nobody has generated anything this month."
                columns={[
                  { header: 'Username', cell: (row) => `@${row.username}` },
                  { header: 'Plan', cell: (row) => row.plan },
                  { header: 'Uploads', align: 'right', cell: (row) => row.uploads },
                ]}
              />
            </div>
          </ChartCard>

          <ChartCard title="Which models wrote the decks" subtitle="Decks created in this window, by what made them.">
            <RankedBars
              unit="decks"
              rows={report.models.map((model) => ({ label: model.model, value: model.decks }))}
              empty="No decks were created in this window."
            />
          </ChartCard>

          <ChartCard
            title="Renewals and endings"
            subtitle="The next 14 days. `Leaving` means they have already cancelled and are running out the period."
          >
            <DataTable
              rows={report.renewals}
              rowKey={(row) => row.username}
              empty="Nothing renews in the next two weeks."
              columns={[
                { header: 'Username', cell: (row) => `@${row.username}` },
                { header: 'Plan', cell: (row) => `${row.plan} · ${row.status}` },
                { header: 'Date', cell: (row) => new Date(row.renewsOn).toLocaleDateString('en-GB') },
                {
                  header: 'Leaving',
                  align: 'right',
                  cell: (row) =>
                    row.leaving ? <Badge variant="warning">Cancelling</Badge> : <span className="text-slate-400">—</span>,
                },
              ]}
            />
          </ChartCard>
        </div>
      </Section>

      {/* ------------------------------------------------------------ plumbing */}
      <Section title="Plumbing" note="The two jobs that fail quietly.">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard
            title="Reminder sweep"
            subtitle="Email costs money to send and push does not, so the split matters. A backlog means the cron is failing."
            right={
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: STATUS_COLORS[health] }}
                />
                <span className="text-slate-500 dark:text-slate-400">
                  {health === 'good' ? 'Keeping up' : health === 'warning' ? 'Running late' : 'Backlogged'}
                </span>
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-4 py-2 sm:grid-cols-4">
              {[
                ['Fired', report.reminders.firedThisWindow],
                ['By email', report.reminders.byEmail],
                ['Push only', report.reminders.pushOnly],
                ['Scheduled', report.reminders.scheduled],
              ].map(([label, value]) => (
                <div key={label as string} className="text-center">
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">{value as number}</p>
                  <p className="mt-1 text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            {(report.reminders.overdue > 0 || report.reminders.notScheduled > 0) && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                ⚠️ {report.reminders.overdue} overdue and {report.reminders.notScheduled} with no next send. Check
                the <code className="font-mono">send-reminders</code> cron.
              </p>
            )}
          </ChartCard>

          <ChartCard
            title="Stripe webhook traffic"
            subtitle="A silent day with live subscriptions means events are not reaching us."
            table={{
              columns: ['Day', 'Events'],
              rows: report.daily.map((day) => [day.date, day.stripeEvents]),
            }}
          >
            <TimeSeriesChart
              dates={dates}
              windowDays={days}
              kind="column"
              height={150}
              series={[series('stripeEvents', 'Events', 0)]}
            />
          </ChartCard>
        </div>
      </Section>

      <p className="pb-2 text-center text-xs text-slate-400">
        Read at {new Date(report.generatedAt).toLocaleString('en-GB')} · timestamps written by devices
        (deck and card creation) are approximate
      </p>
    </>
  );
}

/** The headline number's own shape: a wash under a hairline, no axis, no labels. */
function HeroTrend({ values }: { values: (number | null)[] }) {
  const width = 260;
  const height = 68;
  const max = values.reduce<number>((top, value) => (value !== null && value > top ? value : top), 0) || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const x = (index: number) => index * step;
  const y = (value: number) => height - (value / max) * (height - 6) - 3;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="my-5 h-16 w-full"
      aria-hidden
    >
      <path d={areaPath(values, x, y, height)} fill="var(--viz-series-1)" opacity={0.1} />
      <path
        d={linePath(values, x, y)}
        fill="none"
        stroke="var(--viz-series-1)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
        {note && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const MODE_LABELS: Record<string, string> = {
  timed: 'Timed drill',
  exam: 'Exam',
  cram: 'Cram',
  survival: 'Survival',
};
