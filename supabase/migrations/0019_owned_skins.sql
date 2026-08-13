-- Full-look skins the player is entitled to (earned or, later, purchased).
-- Earned skins (e.g. King Baldwin) gate on their achievement and don't need a
-- row here; paid skins are gated by membership in this set. Real IAP will write
-- it server-side later; for now a free "preview" unlock writes it client-side.
alter table public.profiles
  add column if not exists owned_skins text[] not null default '{}'::text[];
