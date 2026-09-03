# HADIR S2

Aplikasi absensi untuk 1 kelas (14 mahasiswa). Ketua kelas membuka sesi → mahasiswa memilih nama & mode (Luring/Daring) → tekan HADIR → tanggal/jam tercatat otomatis dari server (WITA).

## 1. Struktur Folder

```
hadir-s2/
├── index.html          # Halaman mahasiswa
├── admin.html           # Halaman ketua kelas (/admin)
├── style.css             # Semua styling
├── app.js                 # Logika halaman mahasiswa
├── admin.js               # Logika halaman admin
├── supabase-config.js     # URL & anon key Supabase (ISI SENDIRI)
├── manifest.json           # Konfigurasi PWA
├── service-worker.js        # Offline shell
├── schema.sql                # Skema database + RLS + data awal (jalankan di Supabase)
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## 2. Membuat Proyek Supabase

1. Buka https://supabase.com → **New Project**.
2. Setelah proyek aktif, buka **SQL Editor** → tempel seluruh isi `schema.sql` → **Run**.
   Ini akan membuat 4 tabel (`students`, `courses`, `sessions`, `attendance`), mengaktifkan RLS, mengaktifkan Realtime, dan mengisi 14 mahasiswa dummy + 4 mata kuliah contoh.

## 3. Mengisi Supabase URL & Anon Key

1. Di Supabase Dashboard → **Project Settings > API**.
2. Salin **Project URL** dan **anon public key**.
3. Buka `supabase-config.js`, ganti:
   ```js
   const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
   const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
   ```
   ⚠️ Jangan pernah memasukkan **Service Role Key** di sini — hanya anon key yang boleh ada di frontend.

## 4. Membuat Akun Admin (Ketua Kelas)

1. Di Supabase Dashboard → **Authentication > Users** → **Add User**.
2. Isi email dan password Anda sebagai ketua kelas.
3. Gunakan email & password ini untuk login di halaman `admin.html`.

Tidak perlu membuat akun untuk mahasiswa — mereka hanya memilih nama dari daftar dropdown.

## 5. Mengganti 14 Nama Mahasiswa

Dua cara:

- **Lewat aplikasi (disarankan):** Login admin → tab **Mahasiswa** → tombol "Nonaktifkan" untuk data dummy yang tidak dipakai, lalu tambahkan nama asli lewat form "Tambah".
- **Lewat SQL Editor:** jalankan misalnya:
  ```sql
  update students set name = 'Nama Asli Anda', nim = '2609XXXXX' where name = 'Mahasiswa 01';
  ```

## 6. Mengganti/Menambah Mata Kuliah

- **Lewat aplikasi:** Login admin → tab **Mata Kuliah** → form "Tambah", atau tombol "Hapus" untuk menghapus.
- **Lewat SQL Editor:**
  ```sql
  insert into courses (name, lecturer) values ('Sosiolinguistik Lanjut', null);
  ```

## 7. Menjalankan Aplikasi Secara Lokal

Karena aplikasi memakai `fetch` ke Supabase, sebaiknya dijalankan lewat server lokal sederhana (bukan dibuka langsung sebagai file):

```bash
cd hadir-s2
python3 -m http.server 8080
```

Lalu buka:
- Mahasiswa: `http://localhost:8080/index.html`
- Admin: `http://localhost:8080/admin.html`

## 8. Deploy ke GitHub Pages

1. Buat repository baru di GitHub, misalnya `hadir-s2`.
2. Upload seluruh isi folder `hadir-s2/` ke repository tersebut (root repo, bukan di dalam subfolder).
3. Di repo → **Settings > Pages** → Source: pilih branch `main`, folder `/ (root)` → **Save**.
4. Setelah beberapa menit, aplikasi bisa diakses di:
   `https://USERNAME.github.io/hadir-s2/index.html` (mahasiswa)
   `https://USERNAME.github.io/hadir-s2/admin.html` (admin)
5. Bagikan link `index.html` ke 14 mahasiswa, dan simpan link `admin.html` untuk diri Anda sendiri.

> Opsional: tambahkan file kosong bernama `.nojekyll` di root repo agar GitHub Pages tidak memproses folder `icons/` secara aneh (biasanya tidak wajib, tapi aman untuk ditambahkan).

## 9. Alur Kerja Harian

1. Ketua kelas buka `admin.html` → login.
2. Pilih mata kuliah + nomor pertemuan → **BUKA ABSENSI**.
3. Bagikan link `index.html` ke grup kelas (bisa dikirim sekali di awal semester, mahasiswa cukup buka ulang link yang sama tiap sesi).
4. Mahasiswa membuka link, memilih nama, memilih Luring/Daring, tekan **SAYA HADIR**.
5. Dashboard admin ter-update otomatis (Realtime Supabase) tanpa refresh.
6. Setelah kuliah selesai, ketua kelas tekan **TUTUP ABSENSI**.
7. Data otomatis masuk ke tab **Riwayat** dan **Rekap**.

## 10. Pengecekan Alur (Sudah Diverifikasi Secara Logika Kode)

Alur berikut sudah ditangani oleh kode di atas:

| Langkah | Ditangani oleh |
|---|---|
| Admin login | `admin.js` → `supabaseClient.auth.signInWithPassword` |
| Admin buka sesi | `admin.js` → insert ke `sessions`, dicegah dobel oleh `one_open_session_idx` |
| Mahasiswa melihat sesi | `app.js` → query `sessions where status='open'` + subscribe realtime |
| Mahasiswa absen | `app.js` → insert ke `attendance`, `attended_at` diisi otomatis oleh `default now()` di database (bukan browser) |
| Absen ganda dicegah | constraint `unique(session_id, student_id)` + pesan error khusus kode `23505` |
| Admin melihat mahasiswa hadir | `admin.js` → `refreshAttendanceTable()` + Realtime channel per sesi |
| Admin tutup sesi | `admin.js` → update `sessions.status = 'closed'` |
| Data masuk riwayat | tab **Riwayat** menghitung ulang dari tabel `sessions` + `attendance` |
| Rekap kehadiran | tab **Rekap** membangun matriks mahasiswa × sesi dari data yang sama |

**Yang perlu Anda coba sendiri setelah setup Supabase** (karena memerlukan kredensial nyata yang tidak dimiliki AI):
1. Login admin dengan akun yang dibuat di langkah 4.
2. Buka satu sesi, lalu buka `index.html` di tab/HP lain dan coba absen.
3. Coba absen dua kali dengan nama yang sama → harus muncul pesan "Anda sudah melakukan absensi".
4. Tutup sesi, cek apakah muncul di tab Riwayat dan Rekap.

Jika ada langkah yang errornya tidak sesuai (misalnya pesan RLS "permission denied"), kemungkinan besar `schema.sql` belum dijalankan penuh atau `supabase-config.js` belum diisi dengan benar.

## Update: Nama HadirKu, Hindari Kata "Absensi", PDF Resmi

**Ganti nama aplikasi / logo tanpa redeploy file (paling cepat):**
Kalau aplikasi Anda sudah live, cara tercepat ganti nama & logo adalah lewat UI: Login admin → tab **Pengaturan** → ubah nama & upload logo → Simpan. Tidak perlu upload ulang file apa pun.

**Kalau ingin source code-nya juga konsisten pakai "HadirKu" (untuk redeploy berikutnya):**
Semua teks "HADIR S2" di file sudah diganti jadi "HadirKu", dan semua kata "Absensi/absensi" pada teks yang tampil ke pengguna sudah diganti jadi "Presensi/presensi" (tombol, judul, pesan error, dst).

**PENTING — kalau aplikasi Anda sudah live:** pesan error dari sistem PIN ("Mode absensi tidak valid", dst) tersimpan di dalam *function* Supabase, bukan cuma di file. Supaya pesan itu ikut berubah, jalankan `migration_wording.sql` sekali di SQL Editor (aman, hanya menimpa ulang function `submit_attendance`, tidak menghapus data apa pun).

**PDF sekarang:**
- Ada **kop surat** di atas (logo + nama aplikasi + judul dokumen + garis pemisah).
- Tabel diurutkan berdasarkan **NIM** (menaik), dengan kolom NIM ditampilkan. Mahasiswa tanpa NIM otomatis ditaruh di baris paling akhir.
- Di bagian bawah ada **tanggal cetak** dan kolom **tanda tangan Dosen Pengampu** — untuk PDF Riwayat (per sesi), nama dosen otomatis terisi dari data mata kuliah kalau sudah diisi di tab Mata Kuliah. Untuk PDF Rekap (gabungan semua sesi, bisa beda mata kuliah/dosen), kolom tanda tangan dosen dikosongkan untuk diisi manual.
- Supaya nama dosen otomatis muncul di tanda tangan, isi kolom "Dosen" saat menambah mata kuliah di tab **Mata Kuliah**.

## Anti Titip-Absen: PIN 4 Digit (Fitur Baru)

Selain memilih nama, mahasiswa sekarang wajib memasukkan **PIN 4 digit**:

- **Pertama kali** seorang mahasiswa absen, dia membuat PIN sendiri (diminta 2x untuk konfirmasi). PIN ini tersimpan terenkripsi (hash) di tabel terpisah `student_secrets` yang **tidak bisa dibaca lewat REST API sama sekali** — hanya bisa diverifikasi lewat function database `submit_attendance()`.
- **Absen berikutnya**, mahasiswa wajib memasukkan PIN yang sama itu. Salah PIN 5x berturut-turut akan mengunci selama 15 menit (anti brute-force).
- Karena hanya mahasiswa yang tahu PIN-nya sendiri, orang lain tidak bisa memilih namanya dan langsung menekan hadir — titip absen jadi tidak mudah dilakukan.
- Kalau mahasiswa lupa PIN: admin login → tab **Mahasiswa** → tombol **Reset PIN** di baris namanya. Mahasiswa akan diminta membuat PIN baru saat absen berikutnya.
- Jika Anda sudah pernah menjalankan `schema.sql` versi lama, jalankan `migration_pin.sql` sekali di SQL Editor. Instalasi baru cukup jalankan `schema.sql` (sudah termasuk).

**Catatan jujur:** PIN ini menghalangi titip absen "iseng" (pilih nama teman lalu tekan hadir), tapi tidak bisa 100% mencegah kalau mahasiswa itu sendiri yang membagikan PIN-nya ke orang lain secara sukarela — itu di luar jangkauan sistem manapun, sama seperti titip kartu ujian.

## Logo Aplikasi & Export PDF (Fitur Baru)

**Upload logo:**
- Login admin → tab **Pengaturan** → pilih gambar (PNG/JPG, maks 1 MB) → **Unggah Logo**.
- Logo otomatis tampil di header halaman mahasiswa (`index.html`) dan admin (`admin.html`), serta ikut muncul di kop file PDF yang di-export.
- Nama aplikasi di header juga bisa diganti di tab yang sama.
- Jika Anda sudah pernah menjalankan `schema.sql` versi lama sebelum fitur ini ada, jalankan `migration_logo.sql` sekali di SQL Editor untuk menambahkan tabel `app_settings` dan storage bucket `logo`. Instalasi baru cukup jalankan `schema.sql` (sudah termasuk).

**Export PDF:**
- Tab **Riwayat** → klik salah satu sesi → tombol **Export PDF** di bagian bawah detail sesi → menghasilkan PDF daftar hadir untuk 1 pertemuan.
- Tab **Rekap** → tombol **Export PDF** di bawah tabel → menghasilkan PDF matriks kehadiran seluruh mahasiswa untuk semua sesi.
- Kedua PDF memakai logo & nama aplikasi dari tab Pengaturan sebagai kop halaman.

## Fitur yang Sengaja Belum Dibuat (Versi 1)

QR Code, GPS, face recognition, selfie, PIN mahasiswa, fingerprint, foto, pembayaran, chat, sistem nilai, jadwal kuliah kompleks, integrasi sistem akademik kampus — semua ini bisa ditambahkan di versi berikutnya jika diperlukan.
