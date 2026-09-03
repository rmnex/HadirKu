// =========================================================
// HadirKu - Halaman Dosen (read-only, tanpa login)
// Diakses lewat dosen.html?course=<id_mata_kuliah>
// =========================================================

const mainEl = document.getElementById("main");
let courseInfo = null;
let sessionList = [];
let studentList = [];
let attendanceAll = [];
let currentAppSettings = { app_name: "HadirKu", logo_url: null };

function getCourseIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("course");
}

async function init() {
  const courseId = getCourseIdFromUrl();
  if (!courseId) {
    renderError(
      "Link tidak lengkap. Minta link presensi mata kuliah ini ke ketua kelas (harus ada ?course=... di belakang URL)."
    );
    return;
  }

  currentAppSettings = await loadAppSettings();

  const { data: course, error: courseError } = await supabaseClient
    .from("courses")
    .select("id, name, lecturer")
    .eq("id", courseId)
    .maybeSingle();

  if (courseError || !course) {
    renderError("Mata kuliah tidak ditemukan. Link mungkin sudah tidak berlaku, minta link baru ke ketua kelas.");
    return;
  }
  courseInfo = course;

  const { data: sessions } = await supabaseClient
    .from("sessions")
    .select("id, meeting_number, opened_at, status")
    .eq("course_id", courseId)
    .order("opened_at", { ascending: true });
  sessionList = sessions || [];

  const { data: students } = await supabaseClient
    .from("students")
    .select("id, name, nim")
    .eq("is_active", true);
  studentList = sortStudentsByNim(students || []);

  const sessionIds = sessionList.map((s) => s.id);
  if (sessionIds.length > 0) {
    const { data: attendance } = await supabaseClient
      .from("attendance")
      .select("student_id, session_id, attendance_mode, attended_at")
      .in("session_id", sessionIds);
    attendanceAll = attendance || [];
  } else {
    attendanceAll = [];
  }

  renderOverview();
}

function renderError(msg) {
  mainEl.innerHTML = `<div class="empty-state"><span class="icon">⚠️</span>${msg}</div>`;
}

// -------- Ringkasan: nama mata kuliah + daftar sesi + tombol rekap --------
function renderOverview() {
  const rows = sessionList
    .map((s) => {
      const hadir = attendanceAll.filter((a) => a.session_id === s.id).length;
      const total = studentList.length;
      const statusBadge = s.status === "open" ? `<span style="color:#16a34a;font-weight:600">🟢 Aktif</span>` : "";
      return `<tr class="clickable-row" onclick="renderSessionDetail('${s.id}')">
        <td>${formatTanggalWITA(s.opened_at)}</td>
        <td>P${s.meeting_number}</td>
        <td>${hadir}/${total} ${statusBadge}</td>
      </tr>`;
    })
    .join("");

  mainEl.innerHTML = `
    <div class="session-info" style="grid-template-columns:1fr">
      <div>
        <span>Mata Kuliah</span>
        <strong>${escapeHtml(courseInfo.name)}</strong>
      </div>
      ${
        courseInfo.lecturer
          ? `<div style="margin-top:8px"><span>Dosen Pengampu</span><strong>${escapeHtml(courseInfo.lecturer)}</strong></div>`
          : ""
      }
    </div>

    <h3 style="margin-top:18px">Riwayat Sesi</h3>
    ${
      sessionList.length === 0
        ? `<div class="empty-state" style="padding:20px"><span class="icon">🗓️</span>Belum ada sesi presensi untuk mata kuliah ini.</div>`
        : `<table class="data-table">
            <thead><tr><th>Tanggal</th><th>Pertemuan</th><th>Hadir</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`
    }

    <button id="showRekapBtn" class="btn-secondary" ${sessionList.length === 0 ? "disabled" : ""}>Lihat Rekap Keseluruhan</button>
    <div id="detailArea"></div>
  `;

  const rekapBtn = document.getElementById("showRekapBtn");
  if (rekapBtn) rekapBtn.addEventListener("click", renderRekap);
}

// -------- Detail satu sesi --------
function renderSessionDetail(sessionId) {
  const session = sessionList.find((s) => s.id === sessionId);
  if (!session) return;

  const attendanceMap = {};
  attendanceAll.filter((a) => a.session_id === sessionId).forEach((a) => (attendanceMap[a.student_id] = a));

  const rows = studentList
    .map((st, idx) => {
      const a = attendanceMap[st.id];
      return `<tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(st.nim || "-")}</td>
        <td>${escapeHtml(st.name)}</td>
        <td>${a ? "✅ Hadir" : "⏳ Belum"}</td>
        <td>${a ? (a.attendance_mode === "luring" ? "Luring" : "Daring") : "-"}</td>
        <td>${a ? formatJamWITA(a.attended_at) : "-"}</td>
      </tr>`;
    })
    .join("");

  const detailArea = document.getElementById("detailArea");
  detailArea.innerHTML = `
    <h4 style="margin-top:20px">Detail Pertemuan ${session.meeting_number} · ${formatTanggalWITA(session.opened_at)}</h4>
    <table class="data-table">
      <thead><tr><th>No</th><th>NIM</th><th>Nama</th><th>Status</th><th>Mode</th><th>Jam</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <button id="exportSessionPdfBtn" class="btn-secondary">📄 Export PDF</button>
  `;
  detailArea.scrollIntoView({ behavior: "smooth" });

  document.getElementById("exportSessionPdfBtn").addEventListener("click", async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const subtitle = `${courseInfo.name} · Pertemuan ${session.meeting_number} · ${formatTanggalWITA(session.opened_at)}`;
    const startY = await pdfAddHeader(doc, currentAppSettings, subtitle);

    const body = studentList.map((st, idx) => {
      const a = attendanceMap[st.id];
      return [
        String(idx + 1),
        st.nim || "-",
        st.name,
        a ? "Hadir" : "Belum",
        a ? (a.attendance_mode === "luring" ? "Luring" : "Daring") : "-",
        a ? formatJamWITA(a.attended_at) : "-",
      ];
    });

    doc.autoTable({
      startY,
      head: [["No", "NIM", "Nama", "Status", "Mode", "Jam"]],
      body,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 28 } },
    });

    pdfAddSignatureBlock(doc, doc.lastAutoTable.finalY, courseInfo.lecturer);
    doc.save(`presensi-${courseInfo.name}-P${session.meeting_number}.pdf`.replace(/\s+/g, "_"));
  });
}

// -------- Rekap keseluruhan mata kuliah ini --------
function renderRekap() {
  const detailArea = document.getElementById("detailArea");

  const rows = studentList
    .map((st) => {
      let total = 0;
      const cells = sessionList
        .map((s) => {
          const present = attendanceAll.some((a) => a.student_id === st.id && a.session_id === s.id);
          if (present) total++;
          return `<td>${present ? "✓" : "-"}</td>`;
        })
        .join("");
      const pct = sessionList.length ? ((total / sessionList.length) * 100).toFixed(1) : "0.0";
      return `<tr><td>${escapeHtml(st.nim || "-")}</td><td>${escapeHtml(st.name)}</td>${cells}<td>${total}</td><td>${pct}%</td></tr>`;
    })
    .join("");

  const head =
    "<th>NIM</th><th>Nama</th>" + sessionList.map((s) => `<th>P${s.meeting_number}</th>`).join("") + "<th>Total</th><th>%</th>";

  detailArea.innerHTML = `
    <h4 style="margin-top:20px">Rekap Kehadiran · ${escapeHtml(courseInfo.name)}</h4>
    <div class="table-scroll">
      <table class="data-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    </div>
    <button id="exportRekapPdfBtn" class="btn-secondary">📄 Export PDF</button>
  `;
  detailArea.scrollIntoView({ behavior: "smooth" });

  document.getElementById("exportRekapPdfBtn").addEventListener("click", async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: sessionList.length > 6 ? "landscape" : "portrait" });
    const startY = await pdfAddHeader(doc, currentAppSettings, `Rekap Kehadiran · ${courseInfo.name}`);

    const pdfHead = [["NIM", "Nama", ...sessionList.map((s) => `P${s.meeting_number}`), "Total", "%"]];
    const pdfBody = studentList.map((st) => {
      let total = 0;
      const cells = sessionList.map((s) => {
        const present = attendanceAll.some((a) => a.student_id === st.id && a.session_id === s.id);
        if (present) total++;
        return present ? "✓" : "-";
      });
      const pct = sessionList.length ? ((total / sessionList.length) * 100).toFixed(1) : "0.0";
      return [st.nim || "-", st.name, ...cells, String(total), `${pct}%`];
    });

    doc.autoTable({
      startY,
      head: pdfHead,
      body: pdfBody,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    pdfAddSignatureBlock(doc, doc.lastAutoTable.finalY, courseInfo.lecturer);
    doc.save(`rekap-${courseInfo.name}.pdf`.replace(/\s+/g, "_"));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
