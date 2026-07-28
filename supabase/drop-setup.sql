-- Run once in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.drop_submissions (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  tiktok_handle text not null,
  notes text not null default '',
  consent boolean not null default false,
  status text not null default 'uploading'
    check (status in ('uploading', 'new', 'editing', 'done')),
  ip_hash text not null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table if not exists public.drop_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.drop_submissions(id) on delete cascade,
  original_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 52428800),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists drop_submissions_recent_ip
  on public.drop_submissions (ip_hash, created_at desc);
create index if not exists drop_files_submission
  on public.drop_files (submission_id);

alter table public.drop_submissions enable row level security;
alter table public.drop_files enable row level security;

-- The service-role-backed Netlify functions are the only database access path.
-- No public RLS policies are intentionally created.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photo-drops',
  'photo-drops',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'image/tiff', 'image/dng', 'image/x-adobe-dng', 'image/avif',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
