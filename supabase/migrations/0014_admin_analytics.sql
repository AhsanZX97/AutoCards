-- The owner's analytics page, as one function.
--
-- `supabase/analytics.sql` holds the same questions as loose snippets for the
-- SQL Editor. This is the version the app can actually call: every snippet
-- rolled into a single `jsonb` payload, behind the `is_admin` flag.
--
-- Why a function rather than queries from the browser: the app's client runs
-- under RLS as the signed-in user, and every policy in this schema is
-- `owner_id = auth.uid()`. The same select from a page would return only the
-- caller's own rows and quietly read as "one user, no activity". Security
-- definer runs as the owner instead, which is also the only way to see
-- `auth.users` at all.
--
-- The guard is the same shape as `admin_set_plan`: the function checks the
-- flag itself, so it is safe to grant to every signed-in user — a non-admin
-- gets an exception rather than somebody else's numbers.
--
-- Windowing. `p_days` is the width in days including today; `p_tz` is the zone
-- days are cut on, so an evening signup lands on the evening's date rather
-- than tomorrow's UTC one. Every bucket is a half-open `[local midnight, next
-- local midnight)` range against `timestamptz`, which stays index-usable and
-- survives a DST change. Today is always partial — the last point on any
-- series sits low until the evening, which is what the `previous` totals are
-- for: they cover the equally-long window immediately before this one, so a
-- comparison is like-for-like.


-- Client-written JSON, read defensively.
--
-- `data->>'createdAt'` comes off a device clock in a payload this schema does
-- not validate. A single malformed value would abort the entire read and take
-- the whole page down with it, so a bad one becomes null — one missing point
-- on one chart — rather than an error.
create or replace function public.analytics_ts(p_data jsonb, p_key text)
returns timestamptz
language plpgsql
stable
strict
parallel safe
as $$
begin
  return (p_data ->> p_key)::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function public.analytics_num(p_data jsonb, p_key text)
returns numeric
language plpgsql
immutable
strict
parallel safe
as $$
begin
  return (p_data ->> p_key)::numeric;
exception when others then
  return null;
end;
$$;


create or replace function public.admin_analytics(p_days int default 7, p_tz text default 'UTC')
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  -- Clamped rather than rejected: the page offers presets, and a hand-typed
  -- 100000 should read as "a year" instead of scanning every row ever written.
  v_days      int  := least(greatest(coalesce(p_days, 7), 1), 365);
  v_tz        text := coalesce(nullif(btrim(p_tz), ''), 'UTC');
  v_today     date;
  v_start     date;
  v_from      timestamptz;
  v_to        timestamptz;
  v_prev_from timestamptz;
  v_month     text;
  v_result    jsonb;
begin
  if not coalesce((select is_admin from public.profiles where id = auth.uid()), false) then
    raise exception 'Only an administrator can read the analytics';
  end if;

  -- An unrecognised zone name would abort the read. The numbers are still
  -- worth showing on UTC days, so fall back and say so in the payload.
  begin
    v_today := (now() at time zone v_tz)::date;
  exception when others then
    v_tz := 'UTC';
    v_today := (now() at time zone 'UTC')::date;
  end;

  v_start     := v_today - (v_days - 1);
  v_from      := (v_start::timestamp at time zone v_tz);
  v_to        := ((v_today + 1)::timestamp at time zone v_tz);
  v_prev_from := ((v_start - v_days)::timestamp at time zone v_tz);
  -- The allowance period is a UTC month by definition — `usagePeriod()` on the
  -- client keys it that way — so this one ignores p_tz on purpose.
  v_month     := to_char(now() at time zone 'utc', 'YYYY-MM');

  with
  -- The current window and the equally-long one before it, so every headline
  -- number carries a like-for-like comparison instead of a bare count.
  windows(label, lo, hi) as (
    values ('current', v_from, v_to), ('previous', v_prev_from, v_from)
  ),
  totals as (
    select
      w.label,
      jsonb_build_object(
        'signups', (select count(*) from public.profiles p
                     where p.created_at >= w.lo and p.created_at < w.hi),
        'learners', (select count(distinct s.owner_id) from public.study_sessions s
                      where s.updated_at >= w.lo and s.updated_at < w.hi),
        'sessions', (select count(*) from public.study_sessions s
                      where s.updated_at >= w.lo and s.updated_at < w.hi),
        'cardsStudied', (select coalesce(sum(public.analytics_num(s.data, 'answered')), 0)
                          from public.study_sessions s
                          where s.updated_at >= w.lo and s.updated_at < w.hi),
        'decksCreated', (select count(*) from public.decks d
                          where d.deleted_at is null
                            and public.analytics_ts(d.data, 'createdAt') >= w.lo
                            and public.analytics_ts(d.data, 'createdAt') <  w.hi),
        'cardsCreated', (select count(*) from public.cards c
                          where c.deleted_at is null
                            and public.analytics_ts(c.data, 'createdAt') >= w.lo
                            and public.analytics_ts(c.data, 'createdAt') <  w.hi),
        -- Approximate by construction: a generation that failed after spending
        -- its upload leaves no deck, and a deleted one still cost money. The
        -- authoritative figure is `usage.uploadsThisMonth` below.
        'generations', (select count(*) from public.decks d
                         where d.data ->> 'generatedBy' is not null
                           and public.analytics_ts(d.data, 'createdAt') >= w.lo
                           and public.analytics_ts(d.data, 'createdAt') <  w.hi),
        -- Stored 0..1 by the scorer; reported as a percentage, which is how
        -- every other surface in the app talks about accuracy.
        'accuracy', (select round(avg(public.analytics_num(s.data, 'accuracy')) * 100, 1)
                      from public.study_sessions s
                      where s.updated_at >= w.lo and s.updated_at < w.hi)
      ) as value
    from windows w
  ),

  -- One row per local day. Built from scalar subqueries against a
  -- generate_series rather than a LEFT JOIN, so a quiet day is a 0 and not a
  -- gap — and so two tables cannot multiply each other's rows into a wrong sum.
  days as (
    select
      d::date                                            as day,
      (d::timestamp at time zone v_tz)                   as lo,
      ((d + interval '1 day')::timestamp at time zone v_tz) as hi
    from generate_series(v_start::timestamp, v_today::timestamp, interval '1 day') as d
  ),
  daily as (
    select jsonb_agg(
      jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'signups', (select count(*) from public.profiles p
                     where p.created_at >= lo and p.created_at < hi),
        'learners', (select count(distinct s.owner_id) from public.study_sessions s
                      where s.updated_at >= lo and s.updated_at < hi),
        'sessions', (select count(*) from public.study_sessions s
                      where s.updated_at >= lo and s.updated_at < hi),
        'cardsStudied', (select coalesce(sum(public.analytics_num(s.data, 'answered')), 0)
                          from public.study_sessions s
                          where s.updated_at >= lo and s.updated_at < hi),
        'decksCreated', (select count(*) from public.decks d
                          where d.deleted_at is null
                            and public.analytics_ts(d.data, 'createdAt') >= lo
                            and public.analytics_ts(d.data, 'createdAt') <  hi),
        'cardsCreated', (select count(*) from public.cards c
                          where c.deleted_at is null
                            and public.analytics_ts(c.data, 'createdAt') >= lo
                            and public.analytics_ts(c.data, 'createdAt') <  hi),
        'generations', (select count(*) from public.decks d
                         where d.data ->> 'generatedBy' is not null
                           and public.analytics_ts(d.data, 'createdAt') >= lo
                           and public.analytics_ts(d.data, 'createdAt') <  hi),
        -- Null, not zero, on a day with no sessions: an average of nothing is
        -- not 0% and a chart that draws it as one invents a collapse.
        'accuracy', (select round(avg(public.analytics_num(s.data, 'accuracy')) * 100, 1)
                      from public.study_sessions s
                      where s.updated_at >= lo and s.updated_at < hi),
        'stripeEvents', (select count(*) from public.stripe_events e
                          where e.received_at >= lo and e.received_at < hi)
      ) order by day
    ) as value
    from days
  ),

  -- What a run looks like this window: 5 cards or 50, two minutes or twenty.
  shape as (
    select jsonb_build_object(
      'sessions', count(*),
      'avgCards', round(avg(public.analytics_num(data, 'answered')), 1),
      'avgMinutes', round(avg(public.analytics_num(data, 'durationMs')) / 60000, 1),
      'avgAccuracy', round(avg(public.analytics_num(data, 'accuracy')) * 100, 1)
    ) as value
    from public.study_sessions
    where updated_at >= v_from and updated_at < v_to
  ),

  modes as (
    select coalesce(jsonb_agg(item order by sessions desc), '[]'::jsonb) as value
    from (
      select
        jsonb_build_object(
          'mode', coalesce(data ->> 'mode', 'unknown'),
          'sessions', count(*),
          'accuracy', round(avg(public.analytics_num(data, 'accuracy')) * 100, 1)
        ) as item,
        count(*) as sessions
      from public.study_sessions
      where updated_at >= v_from and updated_at < v_to
      group by data ->> 'mode'
    ) m
  ),

  -- `deckTitle` is denormalised into the summary, so this still names decks
  -- that have since been deleted — which is the point: the studying happened.
  top_decks as (
    select coalesce(jsonb_agg(item order by sessions desc), '[]'::jsonb) as value
    from (
      select
        jsonb_build_object(
          'deck', coalesce(data ->> 'deckTitle', '(untitled)'),
          'sessions', count(*),
          'cardsAnswered', coalesce(sum(public.analytics_num(data, 'answered')), 0)
        ) as item,
        count(*) as sessions
      from public.study_sessions
      where updated_at >= v_from and updated_at < v_to
      group by data ->> 'deckTitle'
      order by count(*) desc
      limit 15
    ) d
  ),

  -- Signed up -> built something -> studied it -> kept going. The drop between
  -- the second and third stage is the one that matters: somebody who uploaded
  -- a document and never studied the result got nothing out of the product,
  -- and it cost a generation to find that out.
  funnel as (
    select jsonb_build_object(
      'signedUp', count(*),
      'builtADeck', count(*) filter (where exists (
        select 1 from public.decks d where d.owner_id = p.id and d.deleted_at is null)),
      'studiedOnce', count(*) filter (where exists (
        select 1 from public.study_sessions s where s.owner_id = p.id)),
      'studied3Plus', count(*) filter (where (
        select count(*) from public.study_sessions s where s.owner_id = p.id) >= 3)
    ) as value
    from public.profiles p
    where p.created_at >= v_from and p.created_at < v_to
  ),

  -- The same funnel per signup day, so one bad day is visible rather than
  -- averaged away. "Activated" means they studied within a day of joining.
  activation as (
    select jsonb_agg(
      jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'signedUp', (select count(*) from public.profiles p
                      where p.created_at >= lo and p.created_at < hi),
        'activated', (select count(*) from public.profiles p
                       where p.created_at >= lo and p.created_at < hi
                         and exists (
                           select 1 from public.study_sessions s
                           where s.owner_id = p.id
                             and s.updated_at < p.created_at + interval '1 day'))
      ) order by day
    ) as value
    from days
  ),

  -- The short list worth actually reading. Today's entries may simply not have
  -- got to it yet, which is why the signup time comes with it.
  stalled as (
    select coalesce(jsonb_agg(item order by signed_up desc), '[]'::jsonb) as value
    from (
      select
        jsonb_build_object(
          'username', p.username,
          'signedUp', p.created_at,
          'hasADeck', exists (select 1 from public.decks d
                               where d.owner_id = p.id and d.deleted_at is null)
        ) as item,
        p.created_at as signed_up
      from public.profiles p
      where p.created_at >= v_from and p.created_at < v_to
        and not exists (select 1 from public.study_sessions s where s.owner_id = p.id)
      order by p.created_at desc
      limit 25
    ) s
  ),

  -- How they arrived, and whether they finished confirming. A pile of
  -- unconfirmed email signups usually means the mail is landing in spam.
  providers as (
    select coalesce(jsonb_agg(item order by signups desc), '[]'::jsonb) as value
    from (
      select
        jsonb_build_object(
          'provider', coalesce(raw_app_meta_data ->> 'provider', 'email'),
          'signups', count(*),
          'confirmed', count(*) filter (where email_confirmed_at is not null)
        ) as item,
        count(*) as signups
      from auth.users
      where created_at >= v_from and created_at < v_to
      group by coalesce(raw_app_meta_data ->> 'provider', 'email')
    ) p
  ),

  -- A floor, never a count of active users: somebody who stays signed in on a
  -- device may not produce a fresh sign-in for months while studying daily.
  -- `learners` is the honest activity number; this is here to cross-check it.
  signins as (
    select jsonb_build_object(
      'signedInToday', count(*) filter (where last_sign_in_at >= (v_today::timestamp at time zone v_tz)),
      'signedInWindow', count(*) filter (where last_sign_in_at >= v_from),
      'accounts', count(*),
      'unconfirmed', count(*) filter (where email_confirmed_at is null)
    ) as value
    from auth.users
  ),

  -- `cancelling` are people who still have the plan but have already decided
  -- to leave — the only churn signal that arrives before the money stops.
  subs as (
    select jsonb_build_object(
      'active', count(*) filter (where status in ('active', 'trialing')),
      'trialing', count(*) filter (where status = 'trialing'),
      'pastDue', count(*) filter (where status in ('past_due', 'unpaid')),
      'cancelling', count(*) filter (where cancel_at_period_end and status in ('active', 'trialing')),
      'touchedThisWindow', count(*) filter (where updated_at >= v_from and updated_at < v_to)
    ) as value
    from public.subscriptions
  ),

  -- Not windowed: this is a snapshot, and it is what the app actually honours,
  -- since `profiles.plan` is server-written.
  plan_mix as (
    select coalesce(jsonb_agg(jsonb_build_object('plan', plan, 'users', users) order by users desc), '[]'::jsonb) as value
    from (select plan, count(*) as users from public.profiles group by plan) p
  ),

  renewals as (
    select coalesce(jsonb_agg(item order by renews_on), '[]'::jsonb) as value
    from (
      select
        jsonb_build_object(
          'username', p.username,
          'plan', s.plan,
          'status', s.status,
          'renewsOn', s.current_period_end,
          'leaving', s.cancel_at_period_end
        ) as item,
        s.current_period_end as renews_on
      from public.subscriptions s
      join public.profiles p on p.id = s.user_id
      where s.current_period_end between now() and now() + interval '14 days'
      order by s.current_period_end
      limit 25
    ) r
  ),

  -- The authoritative spend figure. Monthly by design — this is the allowance
  -- period, not a rolling window — so it never lines up with the charts above,
  -- and it is the one to put next to an invoice.
  usage as (
    select jsonb_build_object(
      'period', v_month,
      'uploads', coalesce(sum(uploads), 0),
      'usersWhoGenerated', count(*) filter (where uploads > 0),
      'heaviestSingleUser', coalesce(max(uploads), 0)
    ) as value
    from public.usage_counters
    where period = v_month
  ),

  -- A free account near its cap is an upgrade conversation; one far past what
  -- the plan allows is a bug.
  top_uploaders as (
    select coalesce(jsonb_agg(item order by uploads desc), '[]'::jsonb) as value
    from (
      select
        jsonb_build_object('username', p.username, 'plan', p.plan, 'uploads', u.uploads) as item,
        u.uploads
      from public.usage_counters u
      join public.profiles p on p.id = u.user_id
      where u.period = v_month and u.uploads > 0
      order by u.uploads desc
      limit 15
    ) t
  ),

  models as (
    select coalesce(jsonb_agg(jsonb_build_object('model', model, 'decks', decks) order by decks desc), '[]'::jsonb) as value
    from (
      select coalesce(data ->> 'generatedBy', '(hand-written)') as model, count(*) as decks
      from public.decks
      where deleted_at is null
        and public.analytics_ts(data, 'createdAt') >= v_from
        and public.analytics_ts(data, 'createdAt') <  v_to
      group by 1
    ) m
  ),

  -- Email costs money to send and push does not, so the split matters beyond
  -- curiosity. A growing `overdue` count means the `send-reminders` cron is
  -- failing silently.
  reminders as (
    select jsonb_build_object(
      'firedThisWindow', count(*) filter (where last_sent_at >= v_from and last_sent_at < v_to),
      'byEmail', count(*) filter (where last_sent_at >= v_from and last_sent_at < v_to and email_enabled),
      'pushOnly', count(*) filter (where last_sent_at >= v_from and last_sent_at < v_to and not email_enabled),
      'createdThisWindow', count(*) filter (where created_at >= v_from and created_at < v_to),
      'notScheduled', count(*) filter (where next_send_at is null),
      'overdue', count(*) filter (where next_send_at < now()),
      'scheduled', count(*) filter (where next_send_at >= now())
    ) as value
    from public.deck_reminders
  ),

  -- Everything ever, for the header. Cheap, and the only place the totals the
  -- rolling window keeps hiding are visible.
  lifetime as (
    select jsonb_build_object(
      'accounts', (select count(*) from public.profiles),
      'decks', (select count(*) from public.decks where deleted_at is null),
      'cards', (select count(*) from public.cards where deleted_at is null),
      'sessions', (select count(*) from public.study_sessions),
      'cardsStudied', (select coalesce(sum(public.analytics_num(data, 'answered')), 0)
                        from public.study_sessions),
      'paidAccounts', (select count(*) from public.profiles where plan <> 'free')
    ) as value
  )

  select jsonb_build_object(
    'generatedAt', now(),
    'days', v_days,
    'timeZone', v_tz,
    'from', to_char(v_start, 'YYYY-MM-DD'),
    'to', to_char(v_today, 'YYYY-MM-DD'),
    'current', (select value from totals where label = 'current'),
    'previous', (select value from totals where label = 'previous'),
    'daily', (select value from daily),
    'sessionShape', (select value from shape),
    'modes', (select value from modes),
    'topDecks', (select value from top_decks),
    'funnel', (select value from funnel),
    'activation', (select value from activation),
    'stalled', (select value from stalled),
    'providers', (select value from providers),
    'signIns', (select value from signins),
    'subscriptions', (select value from subs),
    'planMix', (select value from plan_mix),
    'renewals', (select value from renewals),
    'usage', (select value from usage),
    'topUploaders', (select value from top_uploaders),
    'models', (select value from models),
    'reminders', (select value from reminders),
    'lifetime', (select value from lifetime)
  )
  into v_result;

  return v_result;
end;
$$;

-- Security definer with a user id it does not take as an argument: the caller
-- is always `auth.uid()`, so the only thing to lock down is who may run it at
-- all. `authenticated` is right — the flag check inside is the real gate.
--
-- `anon` is revoked by name as well as through PUBLIC. This project grants the
-- Data API roles execute on new functions in `public` by default (see
-- `[api] ... db-api-roles` in config.toml), which lands as an explicit grant
-- that revoking PUBLIC does not touch. A signed-out caller would still get an
-- exception — `auth.uid()` is null, so the flag check fails — but a function
-- that reads every account should not be callable without a session at all.
revoke execute on function public.admin_analytics(int, text) from public, anon;
grant execute on function public.admin_analytics(int, text) to authenticated;
