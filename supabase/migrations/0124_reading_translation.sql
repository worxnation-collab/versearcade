-- 0124 — the Bible a player reads in follows their account.
--
-- `settings.readingTranslation` has always lived on the device. With licensed
-- versions available through API.Bible (the `bible-text` Edge Function), a
-- player who picks the NLT on their phone should find it picked on the web too,
-- so the choice is mirrored onto the profile.
--
-- Written through the existing "profiles self-update" policy (0002), exactly as
-- sound_enabled / haptics_enabled are — no RPC. The check constraint is the
-- validation: a fixed list of ids, the same ones as TRANSLATIONS_ALL in
-- src/lib/translations.ts (the usual keep-them-in-sync pair). Nowhere here to
-- write a string. Null means "never chosen", and the device's own default wins.
--
-- It is a reading preference and nothing else: not on get_player_card, not on
-- any board, not counted anywhere.
--
-- Production recorded 0122 and 0123 from another branch before this was
-- written; checked with list_migrations, so this takes 0124.

alter table public.profiles add column if not exists reading_translation text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_reading_translation_check'
  ) then
    alter table public.profiles add constraint profiles_reading_translation_check
      check (reading_translation is null
        or reading_translation in ('bsb', 'nlt', 'msg', 'kjv', 'web', 'asv', 'dra', 'bbe'));
  end if;
end $$;
