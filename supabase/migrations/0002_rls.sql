-- Verse Arcade — Row Level Security
-- ---------------------------------------------------------------------------
-- Principle: reads are generous where data is non-sensitive (so co-op UIs and
-- the ambient feed work), writes are locked to the owner, and all *scoring*
-- goes through SECURITY DEFINER functions (0003) rather than direct inserts.
-- ---------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.daily_verses      enable row level security;
alter table public.plays             enable row level security;
alter table public.answers           enable row level security;
alter table public.presence_events   enable row level security;
alter table public.groups            enable row level security;
alter table public.group_members     enable row level security;
alter table public.group_plays       enable row level security;
alter table public.collectibles      enable row level security;
alter table public.user_collectibles enable row level security;

-- PROFILES: anyone signed-in can read (username/level/avatar are public by
-- nature and needed for group rosters); you may only edit your own row.
create policy "profiles readable" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles self-update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles self-insert" on public.profiles
  for insert with check (auth.uid() = id);

-- DAILY VERSES: world-readable (the shared drop). No client writes.
create policy "verses readable" on public.daily_verses
  for select using (true);

-- PLAYS: you can read your own; inserts happen via submit_play() only.
create policy "plays self-read" on public.plays
  for select using (auth.uid() = user_id);

-- ANSWERS: read your own via join to your plays.
create policy "answers self-read" on public.answers
  for select using (
    exists (select 1 from public.plays p where p.id = answers.play_id and p.user_id = auth.uid())
  );

-- PRESENCE: world-readable feed. Inserts via functions only (no direct write).
create policy "presence readable" on public.presence_events
  for select using (true);

-- GROUPS: members can read their groups; owner manages.
create policy "groups readable by members" on public.groups
  for select using (
    exists (select 1 from public.group_members m where m.group_id = groups.id and m.user_id = auth.uid())
  );
create policy "groups owner update" on public.groups
  for update using (auth.uid() = owner_id);

create policy "group_members read own groups" on public.group_members
  for select using (
    exists (select 1 from public.group_members m2 where m2.group_id = group_members.group_id and m2.user_id = auth.uid())
  );
create policy "group_members self leave" on public.group_members
  for delete using (auth.uid() = user_id);

create policy "group_plays readable by members" on public.group_plays
  for select using (
    exists (select 1 from public.group_members m where m.group_id = group_plays.group_id and m.user_id = auth.uid())
  );

-- COLLECTIBLES: catalog world-readable; ownership self-readable.
create policy "collectibles readable" on public.collectibles
  for select using (true);
create policy "user_collectibles self-read" on public.user_collectibles
  for select using (auth.uid() = user_id);
