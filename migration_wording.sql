-- =========================================================
-- MIGRASI: Update wording (hindari kata "Absensi", ganti "Presensi")
-- Jalankan file ini di SQL Editor kalau aplikasi Anda SUDAH LIVE
-- dan sudah pernah menjalankan schema.sql/migration_pin.sql sebelumnya.
-- Ini hanya menimpa ULANG fungsi submit_attendance() dengan pesan
-- error yang sudah diperbarui — tidak mengubah data yang ada.
-- =========================================================

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

-- Opsional: kalau mau nama aplikasi di header langsung ikut berubah tanpa
-- perlu buka tab Pengaturan, jalankan baris ini juga (boleh dilewati kalau
-- Anda mau atur sendiri dari Admin > Pengaturan):
-- update app_settings set app_name = 'HadirKu' where id = 1;
