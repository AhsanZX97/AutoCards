-- Analytics queries for the Supabase dashboard — a rolling 7 days.
--
-- These are the loose, paste-into-the-SQL-Editor versions. The app has its own
-- copy of every question here: `admin_analytics`, added in
-- migrations/0014_admin_analytics.sql, rolls the lot into one jsonb payload
-- behind the `is_admin` flag, and that is what /app/analytics renders.
--
-- Keep them together when either changes. Two differences are deliberate, not
-- drift: the function windows on a zone the caller passes rather than on UTC,
-- and it reports accuracy as a percentage — `data->>'accuracy'` is stored 0..1
-- by the scorer, so the `round(avg(...), 1)` below reads 0.7, not 70.
--
-- These stay useful for the questions the page does not ask, and for checking
-- one of its numbers against the table it came from.
--
-- The SQL Editor runs as superuser, so RLS does not apply and `auth.users` is
-- readable. That is exactly why none of this belongs in the app: the same
-- query from the browser would return only the caller's own rows.
--
-- The window is `current_date - 6` through today — seven days including this
-- one. Today is always partial, so the last point on any chart sits low until
-- the evening. Compare it to the same weekday last week, not to yesterday.
--
-- Daily series are built by scalar subqueries against a `generate_series` of
-- days rather than a LEFT JOIN. Same results, and it avoids two traps: joining
-- two tables onto the same day row multiplies their rows together and corrupts
-- any `sum()`, and `count(*)` over a left join turns every empty day into a 1
-- instead of a 0. A quiet day and a missing day are not the same thing, and a
-- chart that drops one reads as continuous activity.
--
-- Timestamps are UTC. See "local days" at the bottom if that shifts your
-- numbers enough to matter.


-- ---------------------------------------------------------------------------
-- The week in one row
-- ---------------------------------------------------------------------------

-- The block to put at the top of the report. Table, not chart.
select
  (select count(*) from public.profiles
     where created_at >= current_date - 6)                            as signups,
  (select count(distinct owner_id) from public.study_sessions
     where updated_at >= current_date - 6)                            as active_learners,
  (select count(*) from public.study_sessions
     where updated_at >= current_date - 6)                            as sessions,
  (select coalesce(sum((data->>'answered')::int), 0) from public.study_sessions
     where updated_at >= current_date - 6)                            as cards_studied,
  (select count(*) from public.decks
     where deleted_at is null
       and (data->>'createdAt')::timestamptz >= current_date - 6)     as decks_created,
  (select count(*) from public.cards
     where deleted_at is null
       and (data->>'createdAt')::timestamptz >= current_date - 6)     as cards_created,
  (select count(*) from public.subscriptions
     where updated_at >= current_date - 6 and status = 'active')      as subs_touched;


-- Today against the same day last week — the only fair comparison while the
-- current day is still running.
select
  'today'         as period,
  (select count(*) from public.profiles where created_at >= current_date) as signups,
  (select count(distinct owner_id) from public.study_sessions
     where updated_at >= current_date)                                    as learners
union all
select
  'same day last week',
  (select count(*) from public.profiles
     where created_at >= current_date - 7 and created_at < current_date - 6),
  (select count(distinct owner_id) from public.study_sessions
     where updated_at >= current_date - 7 and updated_at < current_date - 6);


-- ---------------------------------------------------------------------------
-- Day by day
-- ---------------------------------------------------------------------------

-- Everything daily, in one snippet. Seven rows, six series. Back several
-- chart blocks off this one and pick different Y columns per block.
select
  to_char(d, 'Dy DD')                                             as day,
  (select count(*) from public.profiles p
     where p.created_at >= d
       and p.created_at <  d + interval '1 day')                   as signups,
  (select count(distinct s.owner_id) from public.study_sessions s
     where s.updated_at >= d
       and s.updated_at <  d + interval '1 day')                   as learners,
  (select count(*) from public.study_sessions s
     where s.updated_at >= d
       and s.updated_at <  d + interval '1 day')                   as sessions,
  (select coalesce(sum((s.data->>'answered')::int), 0)
     from public.study_sessions s
     where s.updated_at >= d
       and s.updated_at <  d + interval '1 day')                   as cards_studied,
  (select count(*) from public.decks dk
     where dk.deleted_at is null
       and (dk.data->>'createdAt')::timestamptz >= d
       and (dk.data->>'createdAt')::timestamptz <  d + interval '1 day')
                                                                   as decks_created,
  (select count(*) from public.cards c
     where c.deleted_at is null
       and (c.data->>'createdAt')::timestamptz >= d
       and (c.data->>'createdAt')::timestamptz <  d + interval '1 day')
                                                                   as cards_created
from generate_series(current_date - 6, current_date, interval '1 day') as d
order by d;


-- Signups per day. Line chart: x = day, y = signups.
--
-- `to_char` rather than a bare date because the chart renderer lays a raw
-- timestamp out on a continuous time axis and labels only the endpoints. Text
-- forces one labelled slot per day; grouping still uses the real date.
select
  to_char(d, 'Dy DD') as day,
  (select count(*) from public.profiles p
     where p.created_at >= d
       and p.created_at <  d + interval '1 day') as signups
from generate_series(current_date - 6, current_date, interval '1 day') as d
order by d;


-- Active learners per day.
--
-- This is the honest activity number until real login tracking exists.
-- `study_sessions.updated_at` is the server clock, and a finished run is
-- something a person actually did — unlike `last_sign_in_at` below, which a
-- long-lived session never moves.
select
  to_char(d, 'Dy DD') as day,
  (select count(distinct s.owner_id) from public.study_sessions s
     where s.updated_at >= d
       and s.updated_at <  d + interval '1 day') as learners
from generate_series(current_date - 6, current_date, interval '1 day') as d
order by d;


-- Cards studied per day — the volume line behind the learner count.
select
  to_char(d, 'Dy DD') as day,
  (select coalesce(sum((s.data->>'answered')::int), 0)
     from public.study_sessions s
     where s.updated_at >= d
       and s.updated_at <  d + interval '1 day') as cards_studied
from generate_series(current_date - 6, current_date, interval '1 day') as d
order by d;


-- Cards created per day.
--
-- `data->>'createdAt'` is written by the client, not the server, so this
-- inherits the device clock and is approximate. It is still the only per-item
-- creation time that exists — `updated_at` moves on every edit and would count
-- an edited card as a new one. Add a server-side `created_at` column when the
-- number needs to be trustworthy rather than indicative.
select
  to_char(d, 'Dy DD') as day,
  (select count(*) from public.cards c
     where c.deleted_at is null
       and (c.data->>'createdAt')::timestamptz >= d
       and (c.data->>'createdAt')::timestamptz <  d + interval '1 day')
     as cards_created
from generate_series(current_date - 6, current_date, interval '1 day') as d
order by d;


-- ---------------------------------------------------------------------------
-- Was the studying any good
-- ---------------------------------------------------------------------------

-- Accuracy per day. A slide usually means decks got harder or longer, not that
-- people got worse. Null days had no sessions at all.
select
  to_char(d, 'Dy DD') as day,
  (select round(avg((s.data->>'accuracy')::numeric), 1)
     from public.study_sessions s
     where s.updated_at >= d
       and s.updated_at <  d + interval '1 day') as avg_accuracy
from generate_series(current_date - 6, current_date, interval '1 day') as d
order by d;


-- Shape of a typical session this week — is a run 5 cards or 50?
select
  count(*)                                              as sessions,
  round(avg((data->>'answered')::numeric), 1)           as avg_cards,
  round(avg((data->>'durationMs')::numeric) / 60000, 1) as avg_minutes,
  round(avg((data->>'accuracy')::numeric), 1)           as avg_accuracy
from public.study_sessions
where updated_at >= current_date - 6;


-- Which study modes people chose this week. Donut chart.
select
  data->>'mode' as mode,
  count(*)      as sessions
from public.study_sessions
where updated_at >= current_date - 6
group by 1
order by 2 desc;


-- Most-studied decks this week. `deckTitle` is denormalised into the summary,
-- so this still names decks that have since been deleted.
select
  data->>'deckTitle'            as deck,
  count(*)                      as sessions,
  sum((data->>'answered')::int) as cards_answered
from public.study_sessions
where updated_at >= current_date - 6
group by 1
order by 2 desc
limit 15;


-- ---------------------------------------------------------------------------
-- Did this week's signups actually get anywhere
-- ---------------------------------------------------------------------------

-- The funnel that matters, for people who joined in the last 7 days:
-- signed up -> built something -> actually studied -> came back.
--
-- The gap between the second and third column is the one to chase. Someone who
-- uploaded a document and never studied the result got nothing out of the
-- product, and it cost a generation to find that out.
select
  count(*)                                                   as signed_up,
  count(*) filter (where exists (
    select 1 from public.decks d
    where d.owner_id = p.id and d.deleted_at is null))       as built_a_deck,
  count(*) filter (where exists (
    select 1 from public.study_sessions s
    where s.owner_id = p.id))                                as studied_once,
  count(*) filter (where (
    select count(*) from public.study_sessions s
    where s.owner_id = p.id) >= 3)                           as studied_3_plus,
  round(100.0 * count(*) filter (where exists (
    select 1 from public.study_sessions s
    where s.owner_id = p.id)) / nullif(count(*), 0), 1)      as activated_pct
from public.profiles p
where p.created_at >= current_date - 6;


-- Same thing per signup day, so a bad day is visible rather than averaged
-- away. `activated` means they studied within 24 hours of signing up.
select
  to_char(d, 'Dy DD') as signup_day,
  (select count(*) from public.profiles p
     where p.created_at >= d
       and p.created_at <  d + interval '1 day')            as signed_up,
  (select count(*) from public.profiles p
     where p.created_at >= d
       and p.created_at <  d + interval '1 day'
       and exists (
         select 1 from public.study_sessions s
         where s.owner_id = p.id
           and s.updated_at < p.created_at + interval '1 day')) as activated
from generate_series(current_date - 6, current_date, interval '1 day') as d
order by d;


-- This week's signups who have not studied anything. The short list worth
-- actually reading — today's entries may simply not have got to it yet.
select
  p.username,
  p.created_at as signed_up,
  exists (select 1 from public.decks d
          where d.owner_id = p.id and d.deleted_at is null) as has_a_deck
from public.profiles p
where p.created_at >= current_date - 6
  and not exists (select 1 from public.study_sessions s where s.owner_id = p.id)
order by p.created_at desc;


-- How this week's signups arrived, and whether they finished confirming.
-- An unconfirmed pile-up usually means the mail is landing in spam.
select
  coalesce(raw_app_meta_data->>'provider', 'email')      as provider,
  count(*)                                               as signups,
  count(*) filter (where email_confirmed_at is not null) as confirmed
from auth.users
where created_at >= current_date - 6
group by 1
order by 2 desc;


-- Sign-in recency. Treat as a FLOOR, not a count of active users.
-- `last_sign_in_at` moves when someone signs in fresh; a user who stays signed
-- in on a device may not produce a new sign-in for months, and will look
-- dormant here while studying daily. Cross-check against active learners
-- above, and replace this outright once a `user_activity` table exists.
select
  count(*) filter (where last_sign_in_at >= current_date)     as signed_in_today,
  count(*) filter (where last_sign_in_at >= current_date - 6) as signed_in_7d,
  count(*)                                                    as accounts
from auth.users;


-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

-- What changed on the billing side this week. `cancelling` are people who
-- still have the plan but have already decided to leave — the only churn
-- signal that arrives before the money stops.
select
  status,
  plan,
  count(*)                                     as subs,
  count(*) filter (where cancel_at_period_end) as cancelling
from public.subscriptions
where updated_at >= current_date - 6
group by status, plan
order by subs desc;


-- Plan mix as it stands right now. Not windowed — this is a snapshot, and it
-- is what the app actually honours, since `profiles.plan` is server-written.
select plan, count(*) as users
from public.profiles
group by plan
order by users desc;


-- Renewals and expiries landing in the next 7 days.
select
  p.username,
  s.plan,
  s.status,
  s.current_period_end    as renews_on,
  s.cancel_at_period_end  as leaving
from public.subscriptions s
join public.profiles p on p.id = s.user_id
where s.current_period_end between now() and now() + interval '7 days'
order by s.current_period_end;


-- Stripe webhook traffic per day. A silent day with active subscriptions is
-- worth investigating — it means events are not reaching us.
select
  to_char(d, 'Dy DD') as day,
  (select count(*) from public.stripe_events e
     where e.received_at >= d
       and e.received_at <  d + interval '1 day') as events
from generate_series(current_date - 6, current_date, interval '1 day') as d
order by d;


-- ---------------------------------------------------------------------------
-- What it cost
-- ---------------------------------------------------------------------------

-- Generations per day — the OpenRouter spend, as closely as it can be seen at
-- daily resolution.
--
-- `usage_counters` is the authoritative count but is keyed by month, so it
-- cannot answer a 7-day question. This counts decks carrying `generatedBy`
-- instead, by their client-written `createdAt`. Close, not exact: a generation
-- that failed after spending its upload leaves no deck, and a deleted deck
-- still cost money, so this reads slightly low. Use the monthly figure below
-- for anything you would put next to an invoice.
select
  to_char(d, 'Dy DD') as day,
  (select count(*) from public.decks dk
     where dk.data->>'generatedBy' is not null
       and (dk.data->>'createdAt')::timestamptz >= d
       and (dk.data->>'createdAt')::timestamptz <  d + interval '1 day')
     as generations
from generate_series(current_date - 6, current_date, interval '1 day') as d
order by d;


-- The authoritative month-to-date total, and who is driving it. Monthly by
-- design — this is the allowance period, not a rolling window.
select
  sum(uploads)                        as uploads_this_month,
  count(*) filter (where uploads > 0) as users_who_generated,
  max(uploads)                        as heaviest_single_user
from public.usage_counters
where period = to_char(now() at time zone 'utc', 'YYYY-MM');


-- Heaviest users this month. A free account near its cap is an upgrade
-- conversation; one far past what the plan allows is a bug.
select
  p.username,
  p.plan,
  u.uploads
from public.usage_counters u
join public.profiles p on p.id = u.user_id
where u.period = to_char(now() at time zone 'utc', 'YYYY-MM')
order by u.uploads desc
limit 15;


-- Which models produced this week's decks.
select
  coalesce(data->>'generatedBy', '(hand-written)') as model,
  count(*)                                          as decks
from public.decks
where deleted_at is null
  and (data->>'createdAt')::timestamptz >= current_date - 6
group by 1
order by 2 desc;


-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------

-- Reminders that actually fired this week, and the email/push split. Email
-- costs money to send and push does not, so the ratio matters beyond
-- curiosity.
select
  count(*) filter (where last_sent_at >= current_date - 6)                        as fired_this_week,
  count(*) filter (where last_sent_at >= current_date - 6 and email_enabled)      as by_email,
  count(*) filter (where last_sent_at >= current_date - 6 and not email_enabled)  as push_only,
  count(*) filter (where created_at >= current_date - 6)                          as created_this_week
from public.deck_reminders;


-- Is the sweep keeping up? A growing overdue count means `send-reminders` is
-- failing silently on its cron.
select
  count(*) filter (where next_send_at is null)  as not_scheduled,
  count(*) filter (where next_send_at < now())  as overdue,
  count(*) filter (where next_send_at >= now()) as scheduled
from public.deck_reminders;


-- ---------------------------------------------------------------------------
-- Local days
-- ---------------------------------------------------------------------------
--
-- Everything above buckets on UTC days. If you are hours off UTC, an evening
-- signup lands on tomorrow. To bucket on your own calendar day, compare dates
-- in your zone instead of using a half-open range:
--
--   where (p.created_at at time zone 'Europe/London')::date = d::date
--
-- and for the single-value filters:
--
--   where (created_at at time zone 'Europe/London')::date
--         > (now() at time zone 'Europe/London')::date - 7
--
-- This gives up the index on `created_at`, which is irrelevant at these row
-- counts and would not be at a hundred times them.
