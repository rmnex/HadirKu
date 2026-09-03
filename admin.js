// =========================================================
// HadirKu - Logika Halaman Admin (Ketua Kelas)
// =========================================================

const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const logoutBtn = document.getElementById("logoutBtn");

let activeSession = null;
let allStudents = [];
let allCourses = [];
let attendanceChannel = null;
let currentAppSettings = { app_name: "HadirKu", logo_url: null };
let currentRiwayatDetail = null; // { courseName, meetingNumber, date, rows }
let currentRekapData = null; // { sessions, students, attendanceRows }

// ---------------- AUTH ----------------
async function checkSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    showDashboard();
  } else {
    showLogin();
  }
}

function showLogin() {
  loginView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
  logoutBtn.classList.add("hidden");
}

async function showDashboard() {
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
  await loadSettingsPanel();
  await loadCourses();
  await loadStudents();
  await refreshSessionPanel();
  await loadRiwayat();
  await loadRekap();
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.classList.add("hidden");

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = "Login gagal: email atau password salah.";
    errEl.classList.remove("hidden");
    return;
  }
  showDashboard();
});

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  showLogin();
});

// ---------------- TABS ----------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// ---------------- MATA KULIAH ----------------
async function loadCourses() {
  const { data } = await supabaseClient.from("courses").select("*").order("name");
  allCourses = data || [];

  // Dropdown "Buka Sesi" cuma tampilkan mata kuliah yang masih aktif
  const select = document.getElementById("courseSelect");
  select.innerHTML = allCourses
    .filter((c) => c.is_active !== false)
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join("");

  const body = document.getElementById("coursesBody");
  body.innerHTML = allCourses
    .map((c) => {
      const isActive = c.is_active !== false;
      return `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.lecturer || "-")}</td>
      <td>${isActive ? "✅" : "❌"}</td>
      <td>
        <button class="small-btn" onclick="toggleCourse('${c.id}', ${isActive})">${isActive ? "Nonaktifkan" : "Aktifkan"}</button>
        <button class="small-btn" onclick="copyLecturerLink('${c.id}', '${escapeHtml(c.name).replace(/'/g, "\\'")}')">Link Dosen</button>
        <button class="small-btn danger" onclick="deleteCourse('${c.id}', '${escapeHtml(c.name).replace(/'/g, "\\'")}')">Hapus</button>
      </td>
    </tr>`;
    })
    .join("");
}

document.getElementById("addCourseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("newCourseName").value.trim();
  const lecturer = document.getElementById("newCourseLecturer").value.trim();
  if (!name) return;
  const { error } = await supabaseClient.from("courses").insert({ name, lecturer });
  if (!error) {
    document.getElementById("addCourseForm").reset();
    await loadCourses();
  } else {
    alert("Gagal menambah mata kuliah.");
  }
});

async function toggleCourse(id, currentActive) {
  await supabaseClient.from("courses").update({ is_active: !currentActive }).eq("id", id);
  await loadCourses();
}

function copyLecturerLink(courseId, courseName) {
  const link = `${window.location.origin}${window.location.pathname.replace(/admin\.html$/, "")}dosen.html?course=${courseId}`;

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(link)
      .then(() => alert(`Link untuk mata kuliah "${courseName}" sudah disalin:\n\n${link}\n\nKirim link ini ke dosen pengampu.`))
      .catch(() => prompt(`Salin link ini secara manual (Ctrl+C):`, link));
  } else {
    prompt(`Salin link ini secara manual (Ctrl+C):`, link);
  }
}

async function deleteCourse(id, name) {
  if (!confirm(`Hapus permanen mata kuliah "${name}"? Ini tidak bisa dibatalkan.`)) return;

  const { error } = await supabaseClient.from("courses").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      alert(
        `"${name}" tidak bisa dihapus karena sudah pernah dipakai untuk membuka sesi presensi (menghapusnya akan merusak data riwayat). Gunakan tombol "Nonaktifkan" saja supaya tidak muncul lagi di pilihan "Buka Sesi", tapi riwayat lamanya tetap aman.`
      );
    } else {
      alert("Gagal menghapus mata kuliah.");
      console.error(error);
    }
    return;
  }

  await loadCourses();
}

// ---------------- MAHASISWA ----------------
async function loadStudents() {
  const { data } = await supabaseClient.from("students").select("*").order("name");
  allStudents = data || [];

  const body = document.getElementById("studentsBody");
  body.innerHTML = allStudents
    .map(
      (s) => `
    <tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.nim || "-")}</td>
      <td>${s.is_active ? "✅" : "❌"}</td>
      <td>
        <button class="small-btn" onclick="toggleStudent('${s.id}', ${s.is_active})">${s.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
        <button class="small-btn" onclick="resetStudentPin('${s.id}', '${escapeHtml(s.name).replace(/'/g, "\\'")}')">Reset PIN</button>
        <button class="small-btn danger" onclick="deleteStudent('${s.id}', '${escapeHtml(s.name).replace(/'/g, "\\'")}')">Hapus</button>
      </td>
    </tr>`
    )
    .join("");
}

document.getElementById("addStudentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("newStudentName").value.trim();
  const nim = document.getElementById("newStudentNim").value.trim();
  if (!name) return;
  const { error } = await supabaseClient.from("students").insert({ name, nim, is_active: true });
  if (!error) {
    document.getElementById("addStudentForm").reset();
    await loadStudents();
  } else {
    alert("Gagal menambah mahasiswa.");
  }
});

async function toggleStudent(id, currentActive) {
  await supabaseClient.from("students").update({ is_active: !currentActive }).eq("id", id);
  await loadStudents();
}

async function resetStudentPin(id, name) {
  if (!confirm(`Reset PIN untuk ${name}? Mahasiswa akan diminta membuat PIN baru saat absen berikutnya.`)) return;
  const { error } = await supabaseClient.rpc("reset_student_pin", { p_student_id: id });
  if (error) {
    alert("Gagal mereset PIN.");
    console.error(error);
  } else {
    alert(`PIN untuk ${name} sudah direset.`);
  }
}

async function deleteStudent(id, name) {
  if (!confirm(`Hapus permanen ${name}? Ini tidak bisa dibatalkan.`)) return;

  const { error } = await supabaseClient.from("students").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      alert(
        `${name} tidak bisa dihapus karena sudah punya riwayat presensi tersimpan (menghapusnya akan merusak data riwayat). Gunakan tombol "Nonaktifkan" saja supaya namanya tidak muncul lagi di form presensi, tapi riwayat lamanya tetap aman.`
      );
    } else {
      alert("Gagal menghapus mahasiswa.");
      console.error(error);
    }
    return;
  }

  await loadStudents();
}

// ---------------- SESI ----------------
document.getElementById("openSessionBtn").addEventListener("click", async () => {
  const courseId = document.getElementById("courseSelect").value;
  const meetingNumber = parseInt(document.getElementById("meetingNumber").value, 10) || 1;
  if (!courseId) {
    alert("Pilih mata kuliah terlebih dahulu.");
    return;
  }

  const { error } = await supabaseClient.from("sessions").insert({
    course_id: courseId,
    meeting_number: meetingNumber,
    status: "open",
  });

  if (error) {
    alert("Gagal membuka sesi. Pastikan tidak ada sesi lain yang masih aktif.");
    console.error(error);
    return;
  }
  await refreshSessionPanel();
});

document.getElementById("closeSessionBtn").addEventListener("click", async () => {
  if (!activeSession) return;
  if (!confirm("Tutup sesi presensi ini?")) return;
  await supabaseClient
    .from("sessions")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", activeSession.id);
  await refreshSessionPanel();
  await loadRiwayat();
  await loadRekap();
});

async function refreshSessionPanel() {
  const { data } = await supabaseClient
    .from("sessions")
    .select("id, meeting_number, opened_at, status, course_id, courses(name)")
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  activeSession = data || null;

  const noSessionEl = document.getElementById("noActiveSession");
  const activePanelEl = document.getElementById("activeSessionPanel");

  if (!activeSession) {
    noSessionEl.classList.remove("hidden");
    activePanelEl.classList.add("hidden");
    unsubscribeAttendance();
    // set nomor pertemuan default = jumlah sesi mata kuliah terpilih + 1
    return;
  }

  noSessionEl.classList.add("hidden");
  activePanelEl.classList.remove("hidden");

  document.getElementById("infoCourse").textContent = activeSession.courses ? activeSession.courses.name : "-";
  document.getElementById("infoMeeting").textContent = activeSession.meeting_number;
  document.getElementById("infoDate").textContent = formatTanggalWITA(activeSession.opened_at);
  document.getElementById("infoStart").textContent = formatJamWITA(activeSession.opened_at);

  await refreshAttendanceTable();
  subscribeAttendance();
}

async function refreshAttendanceTable() {
  if (!activeSession) return;
  const { data: attendanceRows } = await supabaseClient
    .from("attendance")
    .select("student_id, attendance_mode, attended_at")
    .eq("session_id", activeSession.id);

  const attendanceMap = {};
  (attendanceRows || []).forEach((a) => (attendanceMap[a.student_id] = a));

  const activeStudents = allStudents.filter((s) => s.is_active);
  let hadir = 0,
    luring = 0,
    daring = 0;

  const rows = activeStudents
    .map((s, idx) => {
      const a = attendanceMap[s.id];
      if (a) {
        hadir++;
        if (a.attendance_mode === "luring") luring++;
        else daring++;
        return `<tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(s.name)}</td>
          <td class="status-open-cell">✅ Hadir</td>
          <td>${a.attendance_mode === "luring" ? "Luring" : "Daring"}</td>
          <td>${formatJamWITA(a.attended_at)}</td>
        </tr>`;
      }
      return `<tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(s.name)}</td>
        <td class="status-pending-cell">⏳ Belum</td>
        <td>-</td>
        <td>-</td>
      </tr>`;
    })
    .join("");

  document.querySelector("#attendanceTable tbody").innerHTML = rows;
  document.getElementById("sumTotal").textContent = activeStudents.length;
  document.getElementById("sumHadir").textContent = hadir;
  document.getElementById("sumLuring").textContent = luring;
  document.getElementById("sumDaring").textContent = daring;
  document.getElementById("sumBelum").textContent = activeStudents.length - hadir;
}

function subscribeAttendance() {
  unsubscribeAttendance();
  attendanceChannel = supabaseClient
    .channel("public:attendance:" + activeSession.id)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "attendance", filter: `session_id=eq.${activeSession.id}` },
      () => refreshAttendanceTable()
    )
    .subscribe();
}

function unsubscribeAttendance() {
  if (attendanceChannel) {
    supabaseClient.removeChannel(attendanceChannel);
    attendanceChannel = null;
  }
}

// ---------------- RIWAYAT ----------------
async function loadRiwayat() {
  const { data: sessions } = await supabaseClient
    .from("sessions")
    .select("id, meeting_number, opened_at, status, course_id, courses(name)")
    .order("opened_at", { ascending: false });

  const body = document.getElementById("riwayatBody");
  const rows = await Promise.all(
    (sessions || []).map(async (s) => {
      const { count } = await supabaseClient
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("session_id", s.id);
      const totalAktif = allStudents.filter((st) => st.is_active).length;
      return `<tr class="clickable-row" onclick="showRiwayatDetail('${s.id}')">
        <td>${formatTanggalWITA(s.opened_at)}</td>
        <td>${s.courses ? escapeHtml(s.courses.name) : "-"}</td>
        <td>${s.meeting_number}</td>
        <td>${count || 0}/${totalAktif}</td>
      </tr>`;
    })
  );
  body.innerHTML = rows.join("");
}

// sortStudentsByNim() sekarang ada di pdf-utils.js (dipakai bareng admin.js & dosen.js)

async function showRiwayatDetail(sessionId) {
  const { data: sessionRow } = await supabaseClient
    .from("sessions")
    .select("id, meeting_number, opened_at, course_id, courses(name, lecturer)")
    .eq("id", sessionId)
    .single();

  const { data: attendanceRows } = await supabaseClient
    .from("attendance")
    .select("student_id, attendance_mode, attended_at")
    .eq("session_id", sessionId);

  const attendanceMap = {};
  (attendanceRows || []).forEach((a) => (attendanceMap[a.student_id] = a));

  const activeStudents = sortStudentsByNim(allStudents.filter((s) => s.is_active));
  const rows = activeStudents
    .map((s, idx) => {
      const a = attendanceMap[s.id];
      return `<tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(s.nim || "-")}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${a ? "✅ Hadir" : "⏳ Belum"}</td>
        <td>${a ? (a.attendance_mode === "luring" ? "Luring" : "Daring") : "-"}</td>
        <td>${a ? formatJamWITA(a.attended_at) : "-"}</td>
      </tr>`;
    })
    .join("");

  document.getElementById("riwayatDetailBody").innerHTML = rows;
  document.getElementById("riwayatDetail").classList.remove("hidden");
  document.getElementById("riwayatDetail").scrollIntoView({ behavior: "smooth" });

  // Simpan versi data mentah (bukan HTML) untuk dipakai saat export PDF
  currentRiwayatDetail = {
    courseName: sessionRow && sessionRow.courses ? sessionRow.courses.name : "-",
    lecturerName: sessionRow && sessionRow.courses ? sessionRow.courses.lecturer : null,
    meetingNumber: sessionRow ? sessionRow.meeting_number : "-",
    date: sessionRow ? formatTanggalWITA(sessionRow.opened_at) : "-",
    rows: activeStudents.map((s, idx) => {
      const a = attendanceMap[s.id];
      return [
        String(idx + 1),
        s.nim || "-",
        s.name,
        a ? "Hadir" : "Belum",
        a ? (a.attendance_mode === "luring" ? "Luring" : "Daring") : "-",
        a ? formatJamWITA(a.attended_at) : "-",
      ];
    }),
  };
}

// ---------------- REKAP ----------------
async function loadRekap() {
  const { data: sessions } = await supabaseClient
    .from("sessions")
    .select("id, meeting_number, opened_at")
    .order("opened_at", { ascending: true });

  const { data: attendanceRows } = await supabaseClient
    .from("attendance")
    .select("student_id, session_id");

  const activeStudents = sortStudentsByNim(allStudents.filter((s) => s.is_active));
  const sessionList = sessions || [];

  currentRekapData = {
    sessions: sessionList,
    students: activeStudents,
    attendanceRows: attendanceRows || [],
  };

  // Header
  const head = document.getElementById("rekapHead");
  head.innerHTML =
    "<th>NIM</th><th>Nama</th>" +
    sessionList.map((s) => `<th>P${s.meeting_number}</th>`).join("") +
    "<th>Total</th><th>%</th>";

  // Body
  const body = document.getElementById("rekapBody");
  body.innerHTML = activeStudents
    .map((student) => {
      let total = 0;
      const cells = sessionList
        .map((s) => {
          const present = (attendanceRows || []).some(
            (a) => a.student_id === student.id && a.session_id === s.id
          );
          if (present) total++;
          return `<td>${present ? "✓" : "-"}</td>`;
        })
        .join("");
      const pct = sessionList.length ? ((total / sessionList.length) * 100).toFixed(1) : "0.0";
      return `<tr><td>${escapeHtml(student.nim || "-")}</td><td>${escapeHtml(student.name)}</td>${cells}<td>${total}</td><td>${pct}%</td></tr>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------------- PENGATURAN: LOGO & NAMA APLIKASI ----------------
async function loadSettingsPanel() {
  currentAppSettings = await loadAppSettings();
  await applyBrandingToHeader();

  document.getElementById("appNameInput").value = currentAppSettings.app_name || "";

  const imgEl = document.getElementById("logoPreviewImg");
  const emptyEl = document.getElementById("logoPreviewEmpty");
  if (currentAppSettings.logo_url) {
    imgEl.src = currentAppSettings.logo_url;
    imgEl.classList.remove("hidden");
    emptyEl.classList.add("hidden");
  } else {
    imgEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
  }
}

document.getElementById("uploadLogoBtn").addEventListener("click", async () => {
  const fileInput = document.getElementById("logoFileInput");
  const statusEl = document.getElementById("logoStatus");
  statusEl.classList.add("hidden");

  const file = fileInput.files[0];
  if (!file) {
    statusEl.textContent = "Pilih file gambar terlebih dahulu.";
    statusEl.classList.remove("hidden");
    return;
  }
  if (file.size > 1024 * 1024) {
    statusEl.textContent = "Ukuran file maksimal 1 MB.";
    statusEl.classList.remove("hidden");
    return;
  }

  const ext = file.name.split(".").pop();
  const path = `logo-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabaseClient.storage.from("logo").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (uploadError) {
    statusEl.textContent = "Gagal mengunggah logo. Pastikan bucket 'logo' sudah dibuat (lihat schema.sql).";
    statusEl.classList.remove("hidden");
    console.error(uploadError);
    return;
  }

  const { data: publicUrlData } = supabaseClient.storage.from("logo").getPublicUrl(path);
  const logoUrl = publicUrlData.publicUrl;

  const { error: updateError } = await supabaseClient
    .from("app_settings")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (updateError) {
    statusEl.textContent = "Logo terunggah tapi gagal disimpan ke pengaturan.";
    statusEl.classList.remove("hidden");
    console.error(updateError);
    return;
  }

  fileInput.value = "";
  await loadSettingsPanel();
});

document.getElementById("removeLogoBtn").addEventListener("click", async () => {
  if (!confirm("Hapus logo yang sedang dipakai?")) return;
  await supabaseClient.from("app_settings").update({ logo_url: null }).eq("id", 1);
  await loadSettingsPanel();
});

document.getElementById("saveAppNameBtn").addEventListener("click", async () => {
  const name = document.getElementById("appNameInput").value.trim();
  if (!name) return;
  await supabaseClient.from("app_settings").update({ app_name: name }).eq("id", 1);
  await loadSettingsPanel();
});

// ---------------- ZONA BERBAHAYA: RESET RIWAYAT ----------------
document.getElementById("resetHistoryBtn").addEventListener("click", async () => {
  const confirmed = confirm(
    "Yakin hapus SEMUA sesi & riwayat presensi? Data mahasiswa, mata kuliah, dan PIN tidak akan terhapus, tapi seluruh Riwayat dan Rekap akan kosong lagi. Tindakan ini TIDAK BISA DIBATALKAN."
  );
  if (!confirmed) return;

  const typed = prompt('Ketik "HAPUS" (huruf besar) untuk konfirmasi terakhir:');
  if (typed !== "HAPUS") {
    alert("Dibatalkan — teks konfirmasi tidak cocok.");
    return;
  }

  const btn = document.getElementById("resetHistoryBtn");
  btn.disabled = true;
  btn.textContent = "Menghapus…";

  // Hapus semua baris sesi. Attendance ikut terhapus otomatis (ON DELETE CASCADE).
  const { error } = await supabaseClient
    .from("sessions")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  btn.disabled = false;
  btn.textContent = "Reset Riwayat Sesi & Presensi";

  if (error) {
    alert("Gagal mereset riwayat.");
    console.error(error);
    return;
  }

  alert("Riwayat sesi & presensi berhasil dikosongkan.");
  await refreshSessionPanel();
  await loadRiwayat();
  await loadRekap();
  currentRiwayatDetail = null;
  document.getElementById("riwayatDetail").classList.add("hidden");
});

// ---------------- EXPORT PDF ----------------
// imageUrlToDataUrl, addPdfHeader, addPdfSignatureBlock, sortStudentsByNim
// sekarang ada di pdf-utils.js (dipakai bareng admin.js & dosen.js)

document.getElementById("exportRiwayatPdfBtn").addEventListener("click", async () => {
  if (!currentRiwayatDetail) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const subtitle = `${currentRiwayatDetail.courseName} · Pertemuan ${currentRiwayatDetail.meetingNumber} · ${currentRiwayatDetail.date}`;
  const startY = await pdfAddHeader(doc, currentAppSettings, subtitle);

  doc.autoTable({
    startY,
    head: [["No", "NIM", "Nama", "Status", "Mode", "Jam"]],
    body: currentRiwayatDetail.rows,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 28 } },
  });

  pdfAddSignatureBlock(doc, doc.lastAutoTable.finalY, currentRiwayatDetail.lecturerName);

  doc.save(`presensi-${currentRiwayatDetail.courseName}-P${currentRiwayatDetail.meetingNumber}.pdf`.replace(/\s+/g, "_"));
});

document.getElementById("exportRekapPdfBtn").addEventListener("click", async () => {
  if (!currentRekapData) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: currentRekapData.sessions.length > 6 ? "landscape" : "portrait" });

  const startY = await pdfAddHeader(doc, currentAppSettings, "Rekap Kehadiran · Seluruh sesi · diurutkan berdasarkan NIM");

  const head = [["NIM", "Nama", ...currentRekapData.sessions.map((s) => `P${s.meeting_number}`), "Total", "%"]];
  const body = currentRekapData.students.map((student) => {
    let total = 0;
    const cells = currentRekapData.sessions.map((s) => {
      const present = currentRekapData.attendanceRows.some(
        (a) => a.student_id === student.id && a.session_id === s.id
      );
      if (present) total++;
      return present ? "✓" : "-";
    });
    const pct = currentRekapData.sessions.length
      ? ((total / currentRekapData.sessions.length) * 100).toFixed(1)
      : "0.0";
    return [student.nim || "-", student.name, ...cells, String(total), `${pct}%`];
  });

  doc.autoTable({
    startY,
    head,
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
  });

  // Rekap bisa mencakup beberapa mata kuliah/dosen berbeda, jadi kolom
  // tanda tangan dosen dikosongkan untuk diisi manual.
  pdfAddSignatureBlock(doc, doc.lastAutoTable.finalY, null);

  doc.save("rekap-kehadiran.pdf");
});

checkSession();
