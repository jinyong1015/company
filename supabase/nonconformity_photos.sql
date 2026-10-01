-- 고객사 부적합 사진 메타 + Storage 버킷
-- Supabase SQL Editor에서 실행
-- 경로: nonconformity/{품번}/photos/{uuid}.jpg  (bucket: nonconformity-images)
-- ※ Supabase Storage는 한글 경로를 Invalid key로 거절하므로 ASCII 경로 사용
--   (논리 구조 부적합/{품번}/부적합사진 과 동일 계층)-- 저장 기준: 주간 ISSUE와 동일 — period_key(주차 YYYY-MM-Wn / custom:start:end) 단위로 묶음

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.nonconformity_photos (
  id uuid primary key default gen_random_uuid(),
  period_key text not null,
  nonconformity_id text not null,
  item_code text not null,
  storage_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  is_thumbnail boolean not null default false,
  created_at timestamptz not null default now()
);

-- 이미 테이블을 만든 경우 period_key 컬럼 추가
alter table public.nonconformity_photos
  add column if not exists period_key text;

-- 기존 NULL period_key가 있으면 빈 키로 채운 뒤 NOT NULL 적용(가능하면)
update public.nonconformity_photos
set period_key = coalesce(nullif(trim(period_key), ''), 'legacy')
where period_key is null or trim(period_key) = '';

do $$
begin
  alter table public.nonconformity_photos
    alter column period_key set not null;
exception
  when others then
    raise notice 'period_key NOT NULL 적용 생략: %', SQLERRM;
end $$;

create index if not exists nonconformity_photos_nc_id_idx
  on public.nonconformity_photos (nonconformity_id);

create index if not exists nonconformity_photos_item_code_idx
  on public.nonconformity_photos (item_code);

create index if not exists nonconformity_photos_period_key_idx
  on public.nonconformity_photos (period_key);

create index if not exists nonconformity_photos_period_nc_idx
  on public.nonconformity_photos (period_key, nonconformity_id);

alter table public.nonconformity_photos enable row level security;

drop policy if exists "nonconformity_photos_select" on public.nonconformity_photos;
drop policy if exists "nonconformity_photos_insert" on public.nonconformity_photos;
drop policy if exists "nonconformity_photos_update" on public.nonconformity_photos;
drop policy if exists "nonconformity_photos_delete" on public.nonconformity_photos;

create policy "nonconformity_photos_select"
  on public.nonconformity_photos
  for select
  to anon, authenticated
  using (true);

create policy "nonconformity_photos_insert"
  on public.nonconformity_photos
  for insert
  to anon, authenticated
  with check (true);

create policy "nonconformity_photos_update"
  on public.nonconformity_photos
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "nonconformity_photos_delete"
  on public.nonconformity_photos
  for delete
  to anon, authenticated
  using (true);

comment on table public.nonconformity_photos is '고객사 부적합 사진 — period_key(주간 ISSUE와 동일) + nonconformity_id로 연결';

-- Storage bucket (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nonconformity-images',
  'nonconformity-images',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "nonconformity_images_storage_select" on storage.objects;
drop policy if exists "nonconformity_images_storage_insert" on storage.objects;
drop policy if exists "nonconformity_images_storage_update" on storage.objects;
drop policy if exists "nonconformity_images_storage_delete" on storage.objects;

create policy "nonconformity_images_storage_select"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'nonconformity-images');

create policy "nonconformity_images_storage_insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'nonconformity-images');

create policy "nonconformity_images_storage_update"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'nonconformity-images')
  with check (bucket_id = 'nonconformity-images');

create policy "nonconformity_images_storage_delete"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'nonconformity-images');
