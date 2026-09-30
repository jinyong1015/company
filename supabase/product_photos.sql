-- 품번 사진 메타데이터 + Storage 버킷
-- Supabase SQL Editor에서 실행

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.product_photos (
  id uuid primary key default gen_random_uuid(),
  product_key text not null,
  file_path text not null,
  file_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_photos_product_key_unique unique (product_key)
);

create index if not exists product_photos_product_key_idx
  on public.product_photos (product_key);

alter table public.product_photos enable row level security;

drop policy if exists "product_photos_select" on public.product_photos;
drop policy if exists "product_photos_insert" on public.product_photos;
drop policy if exists "product_photos_update" on public.product_photos;
drop policy if exists "product_photos_delete" on public.product_photos;

create policy "product_photos_select"
  on public.product_photos
  for select
  to anon, authenticated
  using (true);

create policy "product_photos_insert"
  on public.product_photos
  for insert
  to anon, authenticated
  with check (true);

create policy "product_photos_update"
  on public.product_photos
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "product_photos_delete"
  on public.product_photos
  for delete
  to anon, authenticated
  using (true);

comment on table public.product_photos is '품번당 제품 사진 1장 메타 (파일은 Storage product-photos)';

-- Storage bucket (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-photos',
  'product-photos',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_photos_storage_select" on storage.objects;
drop policy if exists "product_photos_storage_insert" on storage.objects;
drop policy if exists "product_photos_storage_update" on storage.objects;
drop policy if exists "product_photos_storage_delete" on storage.objects;

create policy "product_photos_storage_select"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'product-photos');

create policy "product_photos_storage_insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'product-photos');

create policy "product_photos_storage_update"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'product-photos')
  with check (bucket_id = 'product-photos');

create policy "product_photos_storage_delete"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'product-photos');
