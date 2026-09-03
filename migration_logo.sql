-- =========================================================
-- MIGRASI: Logo Aplikasi & Storage
-- Jalankan file ini di SQL Editor JIKA sebelumnya Anda sudah pernah
-- menjalankan schema.sql versi lama (tanpa tabel app_settings).
-- Jika ini instalasi baru, cukup jalankan schema.sql saja — lewati file ini.
-- =========================================================

create table if not exists app_settings (
  id int primary key default 1,
  app_name text not null default 'HADIR S2',
  logo_url text,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

alter table app_settings enable row level security;

create policy "settings_select_public" on app_settings
  for select using (true);
create policy "settings_write_admin" on app_settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public)
  values ('logo', 'logo', true)
  on conflict (id) do nothing;

create policy "logo_public_read" on storage.objects
  for select using (bucket_id = 'logo');
create policy "logo_admin_write" on storage.objects
  for insert with check (bucket_id = 'logo' and auth.role() = 'authenticated');
create policy "logo_admin_update" on storage.objects
  for update using (bucket_id = 'logo' and auth.role() = 'authenticated');
create policy "logo_admin_delete" on storage.objects
  for delete using (bucket_id = 'logo' and auth.role() = 'authenticated');
