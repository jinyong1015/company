-- 주간보고 스냅샷 (확정본)
-- Supabase SQL Editor에서 실행

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.weekly_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_key text not null,
  title text not null,
  note text not null default '',
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists weekly_report_snapshots_period_created_idx
  on public.weekly_report_snapshots (period_key, created_at desc);

alter table public.weekly_report_snapshots enable row level security;

drop policy if exists "weekly_report_snapshots_select" on public.weekly_report_snapshots;
drop policy if exists "weekly_report_snapshots_insert" on public.weekly_report_snapshots;
drop policy if exists "weekly_report_snapshots_delete" on public.weekly_report_snapshots;

create policy "weekly_report_snapshots_select"
  on public.weekly_report_snapshots
  for select
  to anon, authenticated
  using (true);

create policy "weekly_report_snapshots_insert"
  on public.weekly_report_snapshots
  for insert
  to anon, authenticated
  with check (true);

create policy "weekly_report_snapshots_delete"
  on public.weekly_report_snapshots
  for delete
  to anon, authenticated
  using (true);

comment on table public.weekly_report_snapshots is '주간업무 보고 확정 스냅샷';
