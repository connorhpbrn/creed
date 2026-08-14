create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text check (
    name is null
    or char_length(btrim(name)) between 1 and 50
  ),
  avatar_path text check (
    avatar_path is null
    or char_length(btrim(avatar_path)) between 1 and 512
  ),
  message text check (
    message is null
    or char_length(btrim(message)) between 1 and 240
  ),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create unique index sponsors_user_id_unique
  on public.sponsors (user_id)
  where user_id is not null;

create table public.sponsor_donations (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  amount_cents integer not null check (amount_cents between 500 and 50000),
  stripe_payment_intent_id text not null unique check (
    char_length(btrim(stripe_payment_intent_id)) between 1 and 255
  ),
  status text not null default 'pending' check (
    status in ('pending', 'succeeded', 'refunded', 'disputed')
  ),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index sponsor_donations_sponsor_id_created_at_idx
  on public.sponsor_donations (sponsor_id, created_at desc);

alter table public.sponsors enable row level security;
alter table public.sponsor_donations enable row level security;

revoke all on table public.sponsors from anon, authenticated;
revoke all on table public.sponsor_donations from anon, authenticated;

grant select, insert, update, delete on table public.sponsors to service_role;
grant select, insert, update, delete on table public.sponsor_donations to service_role;
