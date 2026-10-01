-- 주간업무 보고 · 고객사 부적합 현황
-- Supabase SQL Editor에서 실행
-- 저장 기준: 주간 ISSUE와 동일 — period_key당 1행 (주차 YYYY-MM-Wn / custom:start:end), items jsonb

create table if not exists public.weekly_report_customer_nc (
  period_key text primary key,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.weekly_report_customer_nc enable row level security;

drop policy if exists "weekly_report_customer_nc_select" on public.weekly_report_customer_nc;
drop policy if exists "weekly_report_customer_nc_insert" on public.weekly_report_customer_nc;
drop policy if exists "weekly_report_customer_nc_update" on public.weekly_report_customer_nc;
drop policy if exists "weekly_report_customer_nc_delete" on public.weekly_report_customer_nc;

create policy "weekly_report_customer_nc_select"
  on public.weekly_report_customer_nc
  for select
  to anon, authenticated
  using (true);

create policy "weekly_report_customer_nc_insert"
  on public.weekly_report_customer_nc
  for insert
  to anon, authenticated
  with check (true);

create policy "weekly_report_customer_nc_update"
  on public.weekly_report_customer_nc
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "weekly_report_customer_nc_delete"
  on public.weekly_report_customer_nc
  for delete
  to anon, authenticated
  using (true);

comment on table public.weekly_report_customer_nc is '주간업무 보고 고객사 부적합 현황 (period_key당 1행)';
