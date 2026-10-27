-- Herd Tracker — Supabase schema, v1
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

create extension if not exists pgcrypto;

-- ───────────────────────────── producers ─────────────────────────────
create table producers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- e.g. "Miller Feedyard"
  email       text not null,
  code        text not null unique,          -- 8-char sign-in code, you email it once
  status      text not null default 'active' check (status in ('active','lapsed')),
  renews_at   date,                          -- yearly renewal date, for your own tracking
  created_at  timestamptz not null default now()
);

create table producer_devices (
  producer_id uuid not null references producers(id) on delete cascade,
  device_id   text not null,                 -- random id generated on the phone, stored locally
  linked_at   timestamptz not null default now(),
  primary key (producer_id, device_id)
);
-- App code enforces "max 2 devices per producer" before inserting here.

-- ───────────────────────────── clients ─────────────────────────────
create table clients (
  id          uuid primary key default gen_random_uuid(),
  producer_id uuid not null references producers(id) on delete cascade,
  name        text not null,                 -- e.g. "Hartley Ranch" — matched against spreadsheet uploads
  code        text not null,                 -- 6-char sign-in code
  created_at  timestamptz not null default now(),
  unique (producer_id, code),                -- codes only need to be unique within one producer
  unique (producer_id, name)                 -- so uploads can match by name safely
);

create table client_devices (
  client_id   uuid not null references clients(id) on delete cascade,
  device_id   text not null,
  linked_at   timestamptz not null default now(),
  primary key (client_id, device_id)
);
-- App code enforces "max 2 devices per client" before inserting here.

-- ───────────────────────────── animals ─────────────────────────────
create table animals (
  id          uuid primary key default gen_random_uuid(),
  producer_id uuid not null references producers(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  tag         text not null,                 -- one active animal per number on this client
  target_lb   int  not null default 1500 check (target_lb between 600 and 2500),
  status      text not null default 'active' check (status in ('active','shipped')),
  ship_date   date,
  ship_lb     int,
  created_at  timestamptz not null default now()
);
create index on animals (client_id, status);

-- ───────────────────────────── weigh-ins ─────────────────────────────
create table weighins (
  id          uuid primary key default gen_random_uuid(),
  animal_id   uuid not null references animals(id) on delete cascade,
  weigh_date  date not null,
  weight_lb   int  not null,
  created_at  timestamptz not null default now(),
  unique (animal_id, weigh_date)             -- re-uploading the same sheet is a no-op
);
create index on weighins (animal_id, weigh_date);

-- ─────────────────────── held rows (reused-tag review) ───────────────────────
-- When a weigh-in lands on a tag whose most recent record already shipped,
-- it's held here instead of silently reopening that record.
create table review_queue (
  id             uuid primary key default gen_random_uuid(),
  producer_id    uuid not null references producers(id) on delete cascade,
  client_id      uuid not null references clients(id) on delete cascade,
  prior_animal_id uuid not null references animals(id) on delete cascade,
  tag            text not null,
  weigh_date     date not null,
  weight_lb      int  not null,
  created_at     timestamptz not null default now()
);

-- ───────────────────────────── lock it down ─────────────────────────────
-- The browser never talks to Supabase directly — only Netlify Functions do,
-- using the service role key (full access, server-side only). RLS here is a
-- second layer: even if the public "anon" key ever leaked, it can read or
-- write nothing. Nothing below grants the anon/authenticated roles any access.
alter table producers        enable row level security;
alter table producer_devices enable row level security;
alter table clients          enable row level security;
alter table client_devices   enable row level security;
alter table animals          enable row level security;
alter table weighins         enable row level security;
alter table review_queue     enable row level security;
-- No policies are created, so by default every table denies all access
-- except to the service role, which bypasses RLS entirely.

-- One active animal per tag on a client. A shipped tag can be used again.
-- Another client may use the same number. Already-created databases: run this once.
alter table animals drop constraint if exists animals_client_id_tag_key;
drop index if exists animals_client_tag_unique;
create unique index if not exists animals_client_active_tag_unique
  on animals (client_id, tag)
  where status = 'active';
