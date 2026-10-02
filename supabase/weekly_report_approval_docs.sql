-- 주간업무 보고 · 승인서류 제출현황
-- Supabase SQL Editor에서 실행
-- 저장 형태: 주간 ISSUE(weekly_report_issues)와 동일
--   period_key당 1행 · issues jsonb · upsert 덮어쓰기 · 빈 내용이면 행 삭제

create table if not exists public.weekly_report_approval_docs (
  period_key text primary key,
  issues jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 이미 items 컬럼으로 만든 경우 → issues로 맞춤
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'weekly_report_approval_docs'
      and column_name = 'items'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'weekly_report_approval_docs'
      and column_name = 'issues'
  ) then
    alter table public.weekly_report_approval_docs rename column items to issues;
  end if;
end $$;

alter table public.weekly_report_approval_docs enable row level security;

drop policy if exists "weekly_report_approval_docs_select" on public.weekly_report_approval_docs;
drop policy if exists "weekly_report_approval_docs_insert" on public.weekly_report_approval_docs;
drop policy if exists "weekly_report_approval_docs_update" on public.weekly_report_approval_docs;
drop policy if exists "weekly_report_approval_docs_delete" on public.weekly_report_approval_docs;

create policy "weekly_report_approval_docs_select"
  on public.weekly_report_approval_docs
  for select
  to anon, authenticated
  using (true);

create policy "weekly_report_approval_docs_insert"
  on public.weekly_report_approval_docs
  for insert
  to anon, authenticated
  with check (true);

create policy "weekly_report_approval_docs_update"
  on public.weekly_report_approval_docs
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "weekly_report_approval_docs_delete"
  on public.weekly_report_approval_docs
  for delete
  to anon, authenticated
  using (true);

comment on table public.weekly_report_approval_docs is '주간업무 보고 승인서류 제출현황 (period_key당 1행, issues jsonb — weekly_report_issues와 동일 형태)';
