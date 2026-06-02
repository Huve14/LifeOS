-- suveda_app_state: each user gets their own row keyed by auth.uid()
create table if not exists public.suveda_app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- suveda_chat_messages: each user's messages keyed by auth.uid()
create table if not exists public.suveda_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null default 'main',
  role text not null check (role in ('user', 'ai')),
  text text not null,
  created_at timestamptz not null default now()
);

-- suveda_shopping_items: shared shopping list for family
create table if not exists public.suveda_shopping_items (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'other',
  item text not null,
  quantity text default '',
  price integer default 0,
  supplied_by text default '',
  note text default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- suveda_share_tokens: tokens for sharing lists
create table if not exists public.suveda_share_tokens (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default gen_random_uuid()::text,
  label text default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.suveda_app_state enable row level security;
alter table public.suveda_chat_messages enable row level security;
alter table public.suveda_shopping_items enable row level security;
alter table public.suveda_share_tokens enable row level security;

-- Drop old policies (safe to run even if they don't exist)
drop policy if exists "read write app state" on public.suveda_app_state;
drop policy if exists "read write chat messages" on public.suveda_chat_messages;
drop policy if exists "user owns app state" on public.suveda_app_state;
drop policy if exists "user owns chat messages" on public.suveda_chat_messages;

-- Allow access to own data OR the legacy shared row (for backward compatibility)
create policy "user or legacy app state"
on public.suveda_app_state
for all
using (auth.uid()::text = id OR id = 'suveda-main')
with check (auth.uid()::text = id OR id = 'suveda-main');

create policy "user or legacy chat messages"
on public.suveda_chat_messages
for all
using (auth.uid()::text = thread_id OR thread_id = 'main')
with check (auth.uid()::text = thread_id OR thread_id = 'main');

-- Public access for shared shopping list (protection via share token)
drop policy if exists "public access shopping items" on public.suveda_shopping_items;
create policy "public access shopping items"
on public.suveda_shopping_items
for all
using (true)
with check (true);

drop policy if exists "public access share tokens" on public.suveda_share_tokens;
create policy "public access share tokens"
on public.suveda_share_tokens
for all
using (true)
with check (true);

-- Enable realtime for live updates
alter publication supabase_realtime add table suveda_shopping_items;

-- Seed default shopping items from the spreadsheet
insert into public.suveda_shopping_items (category, item, quantity, price, supplied_by, note, sort_order) values
  ('🎁 Gifts',      'travel pouch / wallet',   '',     300, '', 'gifts', 1),
  ('🎁 Gifts',      'tote bag',                '',     500, '', 'gifts', 2),
  ('🎁 Gifts',      'vanity bag',              '',     200, '', 'gifts', 3),
  ('🎁 Gifts',      'lunch box',               '',     150, '', 'gifts', 4),
  ('🎁 Gifts',      'lunch bag',               '',     200, '', 'gifts', 5),
  ('🎁 Gifts',      'water bottle',            '',     200, '', 'gifts', 6),
  ('🎁 Gifts',      'bath towels & hand towels','x3',   100, '', 'gifts', 7),
  ('🎁 Gifts',      'beach towel',             'x1',   200, '', 'gifts', 8),
  ('🎁 Gifts',      'bed linen',               'x2',   300, '', 'gifts', 9),
  ('🎁 Gifts',      'duvet set',               'x2',   500, '', 'gifts', 10),
  ('👗 Clothes',    'pants',                   'x5',  2100, '', '', 11),
  ('👗 Clothes',    'tops',                    'x10', 3000, '', '', 12),
  ('👗 Clothes',    'heels',                   'x3',  1500, '', '', 13),
  ('👗 Clothes',    'blazers',                 'x2',  1000, '', '', 14),
  ('👗 Clothes',    'jersey',                  'x3',   900, '', '', 15),
  ('👗 Clothes',    'underwear packs',         'x2',   600, '', '', 16),
  ('👗 Clothes',    'underwear packs',         'x2',   500, '', '', 17),
  ('👗 Clothes',    'pyjamas',                 'x3',   900, '', '', 18),
  ('👗 Clothes',    'sneakers',               '',    2200, '', '', 19),
  ('🧳 Luggage',    'hard shell luggage',     'x3',     0, 'Laven', '', 20),
  ('🧳 Luggage',    'travel plugs',           'x2',   300, 'Huve', '', 21),
  ('🧳 Luggage',    'travel cubes',           'x2',   250, 'Huve', '', 22),
  ('🧳 Luggage',    'power bank',             '',     500, '', '', 23),
  ('🧳 Luggage',    'iphone charger',         '',     400, '', '', 24),
  ('🧳 Luggage',    'documents folder',       '',     100, '', '', 25),
  ('📱 Electronics', 'esim data',             '',     400, '', 'kovidh to advise', 26),
  ('💊 Medical',    'meds',                   '',       0, '', 'medical aid', 27),
  ('💊 Medical',    'plasters',               '',      50, '', '', 28),
  ('💊 Medical',    'over the counter meds',  '',     150, '', 'medical aid', 29),
  ('🧴 Toiletries', 'skincare',               'x3',  1000, '', '', 30),
  ('🧴 Toiletries', 'toothpaste',             '',      50, 'Ramona', '', 31),
  ('🧴 Toiletries', 'shower gel',             '',      80, '', '', 32),
  ('🧴 Toiletries', 'scrub',                  '',      40, '', '', 33),
  ('🧴 Toiletries', 'shampoo & conditioner',  '',     500, '', '', 34),
  ('🧴 Toiletries', 'deodorant',              'x2',   100, '', '', 35),
  ('🧴 Toiletries', 'pads',                   '',     100, '', '', 36),
  ('🧴 Toiletries', 'sunblock',               '',     100, 'Laven', '', 37),
  ('🧴 Toiletries', 'toothbrush',             '',      50, '', '', 38),
  ('🧴 Toiletries', 'aftersun',               '',     100, 'Laven', '', 39),
  ('🧴 Toiletries', 'sponge kitchen',         '',      40, '', '', 40),
  ('🧴 Toiletries', 'swab',                   '',      50, '', '', 41),
  ('🧴 Toiletries', 'toilet paper',           '4 rolls',50, 'Ramona', '', 42),
  ('🧴 Toiletries', 'dish cloths',            'x3',   100, '', '', 43),
  ('🍪 Snacks',     'snacks',                 '',     500, '', '', 44),
  ('🍪 Snacks',     'biltong',                '',       0, '', '', 45),
  ('🍪 Snacks',     'biscuits',               '',       0, '', '', 46),
  ('🍪 Snacks',     'tinkies',                '',       0, '', '', 47),
  ('🍪 Snacks',     'jungle energy bar',      '',       0, '', '', 48),
  ('🌶️ Spices',     'masalas',                '',     100, 'Ramona', '', 49)
on conflict do nothing;

-- 👆 Run this SQL, then:
-- 1. Go to Supabase Dashboard → Authentication → Providers → Email → Enable
-- 2. For testing, disable "Confirm email"
-- 3. After running, restart dev server
