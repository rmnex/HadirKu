-- =========================================================
-- MIGRASI: Nonaktifkan mata kuliah (bukan cuma hapus)
-- Jalankan di SQL Editor kalau aplikasi Anda sudah live.
-- Aman dijalankan berkali-kali.
-- =========================================================
alter table courses add column if not exists is_active boolean not null default true;
