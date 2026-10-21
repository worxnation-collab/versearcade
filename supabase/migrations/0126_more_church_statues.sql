-- Two more statues for the churchyard: the Kneeling Figure and the Stone Cross.
--
-- KEEP IN SYNC with STATUES in src/features/church/rivalry.ts. Restated from
-- 0075 with the two ids appended and nothing else changed; set_church_statue
-- reads this list, so a build that offers them and a server that refuses them
-- would be a tap that raises nothing. Idempotent: create or replace.
create or replace function public.church_statue_exists(p_statue text)
returns boolean
language sql
immutable
parallel safe
as $$
  select p_statue in (
    'statue_shepherd', 'statue_mary', 'statue_moses', 'statue_angel',
    'statue_david', 'statue_dove', 'statue_tomb', 'statue_lion_lamb',
    'statue_praying', 'statue_cross'
  );
$$;
