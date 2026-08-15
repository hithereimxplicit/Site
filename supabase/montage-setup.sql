create table if not exists public.montage_submissions (
  id uuid primary key,
  display_name text not null,
  message text not null default '',
  status text not null default 'uploading' check (status in ('uploading','ready')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);
create table if not exists public.montage_files (
  id uuid primary key,
  submission_id uuid not null references public.montage_submissions(id) on delete cascade,
  original_name text not null,
  mime_type text not null,
  media_kind text not null check (media_kind in ('image','video')),
  duration_seconds numeric,
  byte_size bigint not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists montage_files_submission_idx on public.montage_files(submission_id);
alter table public.montage_submissions enable row level security;
alter table public.montage_files enable row level security;

create table if not exists public.montage_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.montage_admins enable row level security;
