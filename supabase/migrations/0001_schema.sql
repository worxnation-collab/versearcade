-- Verse Arcade — core schema
-- ---------------------------------------------------------------------------
-- Design notes:
--  * One shared "daily drop" for everyone -> daily_verses keyed by date.
--  * A user can only play a given day once -> UNIQUE(user_id, drop_date).
--  * Scoring / XP / streaks are computed SERVER-SIDE in submit_play() so the
--    client can't fabricate points (App Store + fairness). See 0003_functions.
--  * No global leaderboard by design. "Ambient presence" is a warm feed of
--    usernames + a live opened-count, never a ranking.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- PROFILES ------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text,
  avatar_emoji  text not null default '📖',
  xp            integer not null default 0,
  level         integer not null default 1,
  current_streak  integer not null default 0,
  longest_streak  integer not null default 0,
  streak_freezes  integer not null default 2,   -- kind loss-aversion: a miss can be absorbed
  last_played_on  date,
  total_plays   integer not null default 0,
  timezone      text not null default 'UTC',
  sound_enabled   boolean not null default true,
  haptics_enabled boolean not null default true,
  reduce_motion   boolean not null default false,
  onboarded     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- DAILY VERSES --------------------------------------------------------------
-- Populated by an Edge Function / cron the night before (see docs). Questions
-- and facts are stored as JSONB so the "quiz" is fixed & identical for all.
create table if not exists public.daily_verses (
  drop_date    date primary key,
  translation  text not null default 'BSB',
  reference    text not null,              -- e.g. "John 3:16"
  book         text not null,
  chapter      integer not null,
  verse_start  integer not null,
  verse_end    integer,
  verse_text   text not null,
  theme        text,                       -- short thematic tag for the day
  questions    jsonb not null default '[]'::jsonb,
  facts        jsonb not null default '[]'::jsonb,  -- "did you know" reveals
  created_at   timestamptz not null default now()
);

-- PLAYS ---------------------------------------------------------------------
create table if not exists public.plays (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  drop_date     date not null references public.daily_verses(drop_date) on delete cascade,
  score         integer not null default 0,
  time_ms       integer not null default 0,
  correct_count integer not null default 0,
  total_questions integer not null default 0,
  combo_max     integer not null default 0,
  xp_earned     integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (user_id, drop_date)
);
create index if not exists plays_drop_date_idx on public.plays(drop_date);

-- ANSWERS (analytics + "review your day") -----------------------------------
create table if not exists public.answers (
  id            uuid primary key default gen_random_uuid(),
  play_id       uuid not null references public.plays(id) on delete cascade,
  question_index integer not null,
  choice_index  integer,
  correct       boolean not null default false,
  time_ms       integer not null default 0
);

-- AMBIENT PRESENCE ----------------------------------------------------------
-- A rolling, non-competitive feed. Rows are snapshots (username stored inline)
-- so the feed needs no join and reveals nothing sensitive.
create table if not exists public.presence_events (
  id           bigint generated always as identity primary key,
  drop_date    date not null,
  username     text not null,
  avatar_emoji text not null default '📖',
  points       integer not null default 0,
  kind         text not null default 'scored', -- scored | opened | streak | levelup
  created_at   timestamptz not null default now()
);
create index if not exists presence_recent_idx on public.presence_events(created_at desc);

-- GROUPS (co-op tier) -------------------------------------------------------
create table if not exists public.groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  emoji          text not null default '🔥',
  join_code      text unique not null,
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  xp             integer not null default 0,
  level          integer not null default 1,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_active_on date,
  created_at     timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member',   -- owner | member
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Each member contributes their day's score to the group's collective total.
create table if not exists public.group_plays (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.groups(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  drop_date         date not null,
  contributed_score integer not null default 0,
  created_at        timestamptz not null default now(),
  unique (group_id, user_id, drop_date)
);
create index if not exists group_plays_group_date_idx on public.group_plays(group_id, drop_date);

-- COLLECTIBLES (verse cards — a collection loop) ----------------------------
create table if not exists public.collectibles (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  name        text not null,
  emoji       text not null default '✨',
  rarity      text not null default 'common', -- common | rare | epic | legendary
  description text
);

create table if not exists public.user_collectibles (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  collectible_id uuid not null references public.collectibles(id) on delete cascade,
  earned_on      date not null default current_date,
  primary key (user_id, collectible_id)
);
