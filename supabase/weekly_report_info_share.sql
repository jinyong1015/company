-- 주간업무 보고 · 정보공유 및 대외일정
-- Supabase SQL Editor에서 실행
-- 저장 형태: 주간 ISSUE / 승인서류 / 측정현황과 동일
--   period_key당 1행 · issues jsonb · upsert 덮어쓰기 · 빈 내용이면 행 삭제

create table if not exists public.weekly_report_info_share (
  period_key text primary key,
  issues jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.weekly_report_info_share enable row level security;

drop policy if exists "weekly_report_info_share_select" on public.weekly_report_info_share;
drop policy if exists "weekly_report_info_share_insert" on public.weekly_report_info_share;
drop policy if exists "weekly_report_info_share_update" on public.weekly_report_info_share;
drop policy if exists "weekly_report_info_share_delete" on public.weekly_report_info_share;

create policy "weekly_report_info_share_select"
  on public.weekly_report_info_share
  for select
  to anon, authenticated
  using (true);

create policy "weekly_report_info_share_insert"
  on public.weekly_report_info_share
  for insert
  to anon, authenticated
  with check (true);

create policy "weekly_report_info_share_update"
  on public.weekly_report_info_share
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "weekly_report_info_share_delete"
  on public.weekly_report_info_share
  for delete
  to anon, authenticated
  using (true);

comment on table public.weekly_report_info_share is '주간업무 보고 정보공유 및 대외일정 (period_key당 1행, issues jsonb — weekly_report_issues와 동일 형태)';
