-- =========================================================
-- MIGRASI: PIN Anti Titip-Absen
-- Jalankan file ini di SQL Editor JIKA sebelumnya Anda sudah pernah
-- menjalankan schema.sql versi lama (tanpa proteksi PIN).
-- Jika ini instalasi baru, cukup jalankan schema.sql saja — lewati file ini.
-- =========================================================

-- 1) Tabel rahasia untuk PIN (terpisah, tanpa RLS policy = tidak bisa diakses langsung)
create table if not exists student_secrets (
  student_id uuid primary key references students(id) on delete cascade,
  pin_hash text,
  pin_attempts int not null default 0,
  pin_locked_until timestamptz
);
alter table student_secrets enable row level security;

-- 2) Cabut hak insert langsung mahasiswa (anon) ke attendance — mulai sekarang
--    absensi WAJIB lewat function submit_attendance() yang memverifikasi PIN.
drop policy if exists "attendance_insert_if_session_open" on attendance;
revoke insert on attendance from anon;

-- 3) Function-function PIN
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
    raise exception 'Mode absensi tidak valid';
  end if;

  select status into v_session_status from sessions where sessions.id = p_session_id;
  if v_session_status is distinct from 'open' then
    raise exception 'Sesi absensi tidak aktif';
  end if;

  insert into student_secrets (student_id) values (p_student_id)
    on conflict (student_id) do nothing;

  select pin_hash, pin_attempts, pin_locked_until
    into v_hash, v_attempts, v_locked_until
  from student_secrets
  where student_secrets.student_id = p_student_id
  for update;

  if v_hash is null then
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
