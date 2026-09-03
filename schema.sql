-- =========================================================
-- HadirKu — Skema Database Supabase
-- Jalankan seluruh file ini di Supabase Dashboard > SQL Editor
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- TABEL
-- ---------------------------------------------------------

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nim text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lecturer text,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete restrict,
  meeting_number int not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

-- Hanya boleh ada SATU sesi berstatus 'open' pada satu waktu
create unique index if not exists one_open_session_idx
  on sessions ((status))
  where status = 'open';

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  student_id uuid not null references students(id) on delete restrict,
  attendance_mode text not null check (attendance_mode in ('luring', 'daring')),
  attended_at timestamptz not null default now(), -- WAKTU SERVER, bukan waktu browser
  created_at timestamptz not null default now(),
  unique (session_id, student_id) -- mencegah absen ganda
);

-- Satu baris pengaturan tunggal: logo & nama aplikasi
create table if not exists app_settings (
  id int primary key default 1,
  app_name text not null default 'HadirKu',
  logo_url text,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

-- Tabel terpisah untuk PIN mahasiswa (mencegah "titip absen").
-- Sengaja dipisah dari tabel students & TIDAK diberi RLS policy sama sekali,
-- supaya tidak bisa diakses langsung lewat REST API oleh siapa pun (termasuk admin).
-- Satu-satunya jalan masuk adalah lewat function SECURITY DEFINER di bawah.
create table if not exists student_secrets (
  student_id uuid primary key references students(id) on delete cascade,
  pin_hash text,
  pin_attempts int not null default 0,
  pin_locked_until timestamptz
);
alter table student_secrets enable row level security;
-- Tidak ada policy apapun di sini = default DENY total untuk anon & authenticated.

-- ---------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------

alter table students enable row level security;
alter table courses enable row level security;
alter table sessions enable row level security;
alter table attendance enable row level security;
alter table app_settings enable row level security;

-- Hak akses dasar (RLS di bawah ini yang menentukan detail izinnya)
-- CATATAN: anon (mahasiswa) TIDAK diberi hak INSERT langsung ke tabel attendance.
-- Presensi hanya boleh masuk lewat function submit_attendance() (lihat bagian PIN di bawah)
-- supaya PIN wajib diverifikasi dulu — ini yang mencegah titip absen.
grant select on students, courses, sessions, attendance, app_settings to anon, authenticated;
grant insert, update, delete on students, courses, sessions, attendance, app_settings to authenticated;

-- STUDENTS: semua orang boleh membaca (untuk dropdown nama), hanya admin login yang boleh mengubah
create policy "students_select_public" on students
  for select using (true);
create policy "students_write_admin" on students
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- COURSES: semua boleh membaca, hanya admin yang boleh mengubah
create policy "courses_select_public" on courses
  for select using (true);
create policy "courses_write_admin" on courses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- SESSIONS: semua boleh membaca (untuk tahu sesi aktif), hanya admin boleh membuka/menutup
create policy "sessions_select_public" on sessions
  for select using (true);
create policy "sessions_write_admin" on sessions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ATTENDANCE: semua boleh membaca (cek status "sudah absen").
-- TIDAK ada policy INSERT untuk anon di sini secara sengaja — mahasiswa hanya
-- boleh menambah data presensi lewat function submit_attendance() (verifikasi PIN).
create policy "attendance_select_public" on attendance
  for select using (true);

create policy "attendance_update_admin" on attendance
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "attendance_delete_admin" on attendance
  for delete using (auth.role() = 'authenticated');

-- APP_SETTINGS: semua boleh membaca (untuk tampilkan logo), hanya admin boleh mengubah
create policy "settings_select_public" on app_settings
  for select using (true);
create policy "settings_write_admin" on app_settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------
-- STORAGE: bucket publik untuk logo aplikasi
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- FUNGSI PIN ANTI TITIP-ABSEN
-- ---------------------------------------------------------

-- Cek apakah mahasiswa sudah pernah membuat PIN (tanpa membocorkan hash-nya)
create or replace function check_student_pin(p_student_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from student_secrets
    where student_id = p_student_id and pin_hash is not null
  );
$$;
grant execute on function check_student_pin(uuid) to anon, authenticated;

-- Verifikasi PIN lalu catat presensi. Kali pertama dipanggil untuk seorang
-- mahasiswa, PIN yang dikirim otomatis disimpan sebagai PIN miliknya.
-- Percobaan PIN salah dibatasi 5x lalu terkunci 15 menit (anti brute-force).
create or replace function submit_attendance(
  p_session_id uuid,
  p_student_id uuid,
  p_mode text,
  p_pin text
)
returns table(id uuid, attended_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_attempts int;
  v_locked_until timestamptz;
  v_session_status text;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN harus 4 digit angka';
  end if;

  if p_mode not in ('luring', 'daring') then
    raise exception 'Mode presensi tidak valid';
  end if;

  select status into v_session_status from sessions where sessions.id = p_session_id;
  if v_session_status is distinct from 'open' then
    raise exception 'Sesi presensi tidak aktif';
  end if;

  insert into student_secrets (student_id) values (p_student_id)
    on conflict (student_id) do nothing;

  select pin_hash, pin_attempts, pin_locked_until
    into v_hash, v_attempts, v_locked_until
  from student_secrets
  where student_secrets.student_id = p_student_id
  for update;

  if v_hash is null then
    -- Pertama kali: simpan PIN yang dibuat mahasiswa
    update student_secrets
      set pin_hash = crypt(p_pin, gen_salt('bf')), pin_attempts = 0, pin_locked_until = null
      where student_secrets.student_id = p_student_id;
  else
    if v_locked_until is not null and v_locked_until > now() then
      raise exception 'PIN terkunci sementara karena terlalu sering salah. Coba lagi setelah %',
        to_char(v_locked_until at time zone 'Asia/Makassar', 'HH24:MI') || ' WITA';
    end if;

    if crypt(p_pin, v_hash) <> v_hash then
      update student_secrets
        set pin_attempts = pin_attempts + 1,
            pin_locked_until = case when pin_attempts + 1 >= 5
              then now() + interval '15 minutes' else pin_locked_until end
        where student_secrets.student_id = p_student_id;
      raise exception 'PIN salah';
    end if;

    update student_secrets set pin_attempts = 0, pin_locked_until = null
      where student_secrets.student_id = p_student_id;
  end if;

  return query
    insert into attendance (session_id, student_id, attendance_mode)
    values (p_session_id, p_student_id, p_mode)
    returning attendance.id, attendance.attended_at;
end;
$$;
grant execute on function submit_attendance(uuid, uuid, text, text) to anon, authenticated;

-- Reset PIN seorang mahasiswa (dipakai admin kalau mahasiswa lupa PIN-nya)
create or replace function reset_student_pin(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Hanya admin yang boleh mereset PIN';
  end if;
  update student_secrets
    set pin_hash = null, pin_attempts = 0, pin_locked_until = null
    where student_id = p_student_id;
end;
$$;
grant execute on function reset_student_pin(uuid) to authenticated;

-- ---------------------------------------------------------
-- REALTIME (agar dashboard admin & halaman mahasiswa update otomatis)
-- ---------------------------------------------------------
alter publication supabase_realtime add table sessions;
alter publication supabase_realtime add table attendance;

-- ---------------------------------------------------------
-- DATA AWAL: 14 MAHASISWA DUMMY
-- Ganti "Mahasiswa 01".."Mahasiswa 14" dengan nama asli kapan saja
-- lewat halaman Admin > tab Mahasiswa, atau edit langsung di sini.
-- ---------------------------------------------------------
insert into students (name, nim) values
  ('Hidayati Isro'' Imad Thoyibah', '2605078001'),
  ('Ana Maulida Samiallahu Duana', '2605078002'),
  ('Zahrah Aulia Nabila', '2605078003'),
  ('Ika Novita Mulia', '2605078004'),
  ('Roi Martin', '2605078005'),
  ('Jogarni Maria Marta', '2605078006'),
  ('Pidelys Lumban Gaol, S.Pd.', '2605078007'),
  ('Siti Nur Hidayah', '2605078008'),
  ('Baradilla Tamadara Muin', '2605078009'),
  ('Suhaimi', '2605078010'),
  ('Aurel Azzahra', '2605078011'),
  ('Deswita Rehani Kuncoro', '2605078012'),
  ('Risca Verisgayanti', '2605078013'),
  ('Pitri Almani', '2605078014');

-- ---------------------------------------------------------
-- DATA AWAL: MATA KULIAH CONTOH
-- ---------------------------------------------------------
insert into courses (name, lecturer) values
  ('Linguistik Lanjut', null),
  ('Pemerolehan Bahasa Kedua', null),
  ('Landasan Pendidikan', 'Prof. Dr. Azainil, M.Si.'),
  ('Folklore Kalimantan Timur', 'Nina Queena Hadi Puteri');
