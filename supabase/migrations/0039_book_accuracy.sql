-- Per-book accuracy. A running correct/answered tally per book of the Bible,
-- fed by every question the player answers — daily drops, practice replays,
-- focus drills, "keep it" reviews and battles all count the same, because this
-- measures knowledge, not rank. The Study tab reads it back as a review chart
-- (weakest book first) so practice has an obvious target.
--
-- Tallies are additive, so two devices playing the same day both count; the
-- client only ever sends the delta from one finished run.

create table if not exists public.book_accuracy (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  book           text not null,
  correct        integer not null default 0,
  answered       integer not null default 0,
  last_played_on date,
  updated_at     timestamptz not null default now(),
  primary key (user_id, book),
  constraint book_accuracy_sane check (correct >= 0 and answered >= correct)
);

alter table public.book_accuracy enable row level security;
drop policy if exists "book accuracy self-select" on public.book_accuracy;
drop policy if exists "book accuracy self-write"  on public.book_accuracy;
create policy "book accuracy self-select" on public.book_accuracy
  for select using (auth.uid() = user_id);
-- Writes go through record_book_accuracy (security definer); still scope any
-- direct write to the owner as defense in depth.
create policy "book accuracy self-write" on public.book_accuracy
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Fold one finished run into a book's tally. p_day is the client's LOCAL date
-- (same convention as the rest of the app) and is only stored for display, so
-- it's clamped rather than trusted. A run is at most a handful of questions —
-- the bounds below keep a bad or hostile client from inflating a tally.
create or replace function public.record_book_accuracy(
  p_book     text,
  p_correct  integer,
  p_answered integer,
  p_day      date default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_book text;
  v_answered integer;
  v_correct integer;
  v_day date;
  v_row public.book_accuracy%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  v_book := btrim(coalesce(p_book, ''));
  if v_book = '' then raise exception 'book is required'; end if;
  if length(v_book) > 60 then v_book := left(v_book, 60); end if;

  -- One run is 1..25 questions; anything outside that is not a real run.
  v_answered := least(greatest(coalesce(p_answered, 0), 0), 25);
  if v_answered = 0 then raise exception 'nothing to record'; end if;
  v_correct := least(greatest(coalesce(p_correct, 0), 0), v_answered);

  v_day := coalesce(p_day, current_date);
  if v_day < current_date - 1 or v_day > current_date + 1 then
    v_day := current_date;
  end if;

  insert into public.book_accuracy (user_id, book, correct, answered, last_played_on)
  values (uid, v_book, v_correct, v_answered, v_day)
  on conflict (user_id, book) do update set
    correct        = public.book_accuracy.correct + excluded.correct,
    answered       = public.book_accuracy.answered + excluded.answered,
    last_played_on = greatest(
      coalesce(public.book_accuracy.last_played_on, excluded.last_played_on),
      excluded.last_played_on
    ),
    updated_at     = now()
  returning * into v_row;

  return json_build_object(
    'book', v_row.book,
    'correct', v_row.correct,
    'answered', v_row.answered,
    'last_played_on', v_row.last_played_on
  );
end;
$$;

grant execute on function public.record_book_accuracy(text, integer, integer, date) to authenticated;

notify pgrst, 'reload schema';
