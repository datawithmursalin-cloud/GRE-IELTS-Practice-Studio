-- Private storage for the public studio's username/password profiles and scores.
-- Access is only through the studio-api Edge Function; this schema is not exposed
-- to Supabase's Data API and has no browser-role grants or RLS policies.
create schema if not exists studio;
revoke all on schema studio from public, anon, authenticated;

create table if not exists studio.profiles (
  id text primary key,
  name text not null,
  name_key text not null unique,
  password_salt text,
  password_hash text,
  claim_code_hash text,
  created_at timestamptz not null default now(),
  check ((password_salt is null) = (password_hash is null)),
  check (length(name) between 1 and 40)
);
alter table studio.profiles enable row level security;
revoke all on studio.profiles from public, anon, authenticated, service_role;

create table if not exists studio.sessions (
  token_hash text primary key,
  profile_id text not null references studio.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists studio_sessions_profile_idx on studio.sessions(profile_id);
create index if not exists studio_sessions_expiry_idx on studio.sessions(expires_at);
alter table studio.sessions enable row level security;
revoke all on studio.sessions from public, anon, authenticated, service_role;

create table if not exists studio.score_history (
  profile_id text not null references studio.profiles(id) on delete cascade,
  id text not null,
  completed_at timestamptz not null,
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  primary key (profile_id, id)
);
create index if not exists studio_score_history_recent_idx on studio.score_history(profile_id, completed_at desc);
alter table studio.score_history enable row level security;
revoke all on studio.score_history from public, anon, authenticated, service_role;

create table if not exists studio.login_attempts (
  profile_id text primary key references studio.profiles(id) on delete cascade,
  failures integer not null default 0 check (failures >= 0),
  blocked_until timestamptz
);
alter table studio.login_attempts enable row level security;
revoke all on studio.login_attempts from public, anon, authenticated, service_role;

create table if not exists studio.registration_attempts (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);
alter table studio.registration_attempts enable row level security;
revoke all on studio.registration_attempts from public, anon, authenticated, service_role;

insert into studio.profiles (id, name, name_key)
values ('mursalin', 'Syed', 'syed'), ('ramisa', 'Ramisa', 'ramisa')
on conflict (id) do nothing;
