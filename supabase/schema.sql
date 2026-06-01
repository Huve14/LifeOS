create table if not exists public.suveda_app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.suveda_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null default 'main',
  role text not null check (role in ('user', 'ai')),
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.suveda_app_state enable row level security;
alter table public.suveda_chat_messages enable row level security;

drop policy if exists "read write app state" on public.suveda_app_state;
create policy "read write app state"
on public.suveda_app_state
for all
using (true)
with check (true);

drop policy if exists "read write chat messages" on public.suveda_chat_messages;
create policy "read write chat messages"
on public.suveda_chat_messages
for all
using (true)
with check (true);