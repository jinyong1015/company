-- VINA 전용 공유 비밀번호
-- 비밀번호 평문은 이 파일에 저장하지 않는다. 배포 환경에서 해시 행을 별도로 초기화한다.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.vina_auth (
  id int primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.vina_auth enable row level security;

drop policy if exists "vina_auth_deny_all" on public.vina_auth;

create policy "vina_auth_deny_all"
  on public.vina_auth
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.verify_vina_password(p_password text)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as '
  select case
    when p_password is null or length(trim(p_password)) = 0 then false
    else exists (
      select 1
      from public.vina_auth
      where id = 1
        and password_hash = extensions.crypt(p_password, password_hash)
    )
  end;
';

revoke all on function public.verify_vina_password(text) from public;
revoke all on function public.verify_vina_password(text) from authenticated;
grant execute on function public.verify_vina_password(text) to anon;

comment on table public.vina_auth is
  'VINA 전용 공유 비밀번호 해시 — 기존 관리자/실무자 인증과 분리';
