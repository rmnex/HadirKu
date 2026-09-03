-- =========================================================
-- UPDATE: Ganti 14 mahasiswa dummy dengan nama & NIM asli
-- Jalankan di Supabase SQL Editor.
-- Aman dijalankan berkali-kali (memakai nama dummy sebagai kunci pencarian).
-- Kalau nama dummy "Mahasiswa 01".."Mahasiswa 14" sudah pernah Anda ubah
-- sebelumnya lewat tab Mahasiswa, UPDATE ini tidak akan menemukan barisnya —
-- dalam kasus itu edit manual saja lewat Admin > tab Mahasiswa.
-- =========================================================

update students set name = 'Hidayati Isro'' Imad Thoyibah', nim = '2605078001' where name = 'Mahasiswa 01';
update students set name = 'Ana Maulida Samiallahu Duana',       nim = '2605078002' where name = 'Mahasiswa 02';
update students set name = 'Zahrah Aulia Nabila',                nim = '2605078003' where name = 'Mahasiswa 03';
update students set name = 'Ika Novita Mulia',                   nim = '2605078004' where name = 'Mahasiswa 04';
update students set name = 'Roi Martin',                         nim = '2605078005' where name = 'Mahasiswa 05';
update students set name = 'Jogarni Maria Marta',                nim = '2605078006' where name = 'Mahasiswa 06';
update students set name = 'Pidelys Lumban Gaol, S.Pd.',         nim = '2605078007' where name = 'Mahasiswa 07';
update students set name = 'Siti Nur Hidayah',                   nim = '2605078008' where name = 'Mahasiswa 08';
update students set name = 'Baradilla Tamadara Muin',            nim = '2605078009' where name = 'Mahasiswa 09';
update students set name = 'Suhaimi',                            nim = '2605078010' where name = 'Mahasiswa 10';
update students set name = 'Aurel Azzahra',                      nim = '2605078011' where name = 'Mahasiswa 11';
update students set name = 'Deswita Rehani Kuncoro',             nim = '2605078012' where name = 'Mahasiswa 12';
update students set name = 'Risca Verisgayanti',                 nim = '2605078013' where name = 'Mahasiswa 13';
update students set name = 'Pitri Almani',                       nim = '2605078014' where name = 'Mahasiswa 14';

-- Cek hasilnya (harus terurut NIM, seperti tampilan Riwayat/Rekap di aplikasi)
select name, nim from students order by nim;
