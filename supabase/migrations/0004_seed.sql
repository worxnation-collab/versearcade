-- Verse Arcade — seed data (collectible "verse cards")
insert into public.collectibles (key, name, emoji, rarity, description) values
  ('first_light',   'First Light',      '🌅', 'common',    'Played your very first daily verse.'),
  ('week_warrior',  'Week Warrior',     '🔥', 'rare',      'Reached a 7-day streak.'),
  ('night_owl',     'Night Owl',        '🦉', 'common',    'Solved a verse after midnight.'),
  ('flawless',      'Flawless',         '💎', 'rare',      'A perfect, no-miss run.'),
  ('speed_seraph',  'Speed Seraph',     '⚡', 'epic',      'Cleared a verse in record time.'),
  ('month_mountain','Month Mountain',   '⛰️', 'epic',      'Reached a 30-day streak.'),
  ('centurion',     'Centurion',        '👑', 'legendary', 'Reached a 100-day streak.'),
  ('co_op_climber', 'Co-op Climber',    '🧗', 'rare',      'Contributed to a group climb.')
on conflict (key) do nothing;
