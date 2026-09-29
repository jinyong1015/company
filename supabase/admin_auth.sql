-- 관리자 비밀번호 (초기: 0535863500)
-- Supabase: pgcrypto는 extensions 스키마에 있음

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_auth (
  id int primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_auth enable row level security;

drop policy if exists "admin_auth_deny_all" on public.admin_auth;

create policy "admin_auth_deny_all"
  on public.admin_auth
  for all
  to anon, authenticated
  using (false)
  with check (false);

insert into public.admin_auth (id, password_hash)
values (1, extensions.crypt('0535863500', extensions.gen_salt('bf')))
on conflict (id) do update
set password_hash = excluded.password_hash,
    updated_at = now();

create or replace function public.verify_admin_password(p_password text)
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
      from public.admin_auth
      where id = 1
        and password_hash = extensions.crypt(p_password, password_hash)
    )
  end;
';

revoke all on function public.verify_admin_password(text) from public;
grant execute on function public.verify_admin_password(text) to anon, authenticated;

create or replace function public.change_admin_password(p_current text, p_new text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as '
begin
  if not public.verify_admin_password(p_current) then
    return false;
  end if;
  if p_new is null or length(trim(p_new)) < 4 then
    return false;
  end if;
  update public.admin_auth
  set password_hash = extensions.crypt(p_new, extensions.gen_salt(''bf'')),
      updated_at = now()
  where id = 1;
  return found;
end;
';

revoke all on function public.change_admin_password(text, text) from public;
grant execute on function public.change_admin_password(text, text) to anon, authenticated;
