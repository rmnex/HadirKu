// =========================================================
// HADIR S2 - Logika Halaman Mahasiswa
// =========================================================

const mainEl = document.getElementById("main");
let selectedMode = null;
let currentSession = null;
let currentStudentId = localStorage.getItem("hadir_s2_student_id") || "";
let studentsCache = []; // {id, name} - dipakai ulang untuk PIN & konfirmasi

async function init() {
  await loadActiveSession();
  subscribeRealtime();
}

// -------- Ambil sesi yang sedang aktif (status = 'open') --------
async function loadActiveSession() {
  const { data, error } = await supabaseClient
    .from("sessions")
    .select("id, meeting_number, opened_at, status, course_id, courses(name)")
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    renderError("Gagal memuat sesi. Periksa koneksi internet Anda.");
    console.error(error);
    return;
  }

  if (!data) {
    currentSession = null;
    renderNoSession();
    return;
  }

  currentSession = data;

  // Cek apakah mahasiswa (device ini) sudah pernah absen di sesi ini
  const existing = await checkExistingAttendance(data.id);
  if (existing) {
    renderConfirmation(existing, data);
  } else {
    renderForm(data);
  }
}

async function checkExistingAttendance(sessionId) {
  if (!currentStudentId) return null;
  const { data } = await supabaseClient
    .from("attendance")
    .select("id, attendance_mode, attended_at, students(name)")
    .eq("session_id", sessionId)
    .eq("student_id", currentStudentId)
    .maybeSingle();
  return data || null;
}

// -------- Render: tidak ada sesi aktif --------
function renderNoSession() {
  mainEl.innerHTML = `
    <div class="empty-state">
      <span class="icon">⏳</span>
      <strong>Tidak ada absensi yang sedang dibuka.</strong><br/>
      Silakan tunggu ketua kelas membuka sesi.
    </div>
  `;
}

function renderError(msg) {
  mainEl.innerHTML = `<div class="empty-state"><span class="icon">⚠️</span>${msg}</div>`;
}

// -------- Render: form absensi --------
async function renderForm(session) {
  const { data: students } = await supabaseClient
    .from("students")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  studentsCache = students || [];

  const tanggal = formatTanggalWITA(session.opened_at);
  const jam = formatJamWITA(session.opened_at);
  const courseName = session.courses ? session.courses.name : "-";

  mainEl.innerHTML = `
    <div class="status-banner status-open">🟢 ABSENSI DIBUKA</div>
    <div class="session-info">
      <div><span>Mata Kuliah</span><strong>${escapeHtml(courseName)}</strong></div>
      <div><span>Pertemuan</span><strong>${session.meeting_number}</strong></div>
      <div><span>Tanggal</span><strong>${tanggal}</strong></div>
      <div><span>Jam Mulai</span><strong>${jam}</strong></div>
    </div>

    <label>Pilih Nama Anda
      <select id="studentSelect">
        <option value="">-- Pilih nama mahasiswa --</option>
        ${studentsCache
          .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
          .join("")}
      </select>
    </label>

    <div id="pinSection" class="hidden"></div>

    <label>Cara Mengikuti Kuliah</label>
    <div class="mode-options">
      <div class="mode-option" data-mode="luring">
        <span class="emoji">🏫</span>Luring
      </div>
      <div class="mode-option" data-mode="daring">
        <span class="emoji">🏠</span>Daring
      </div>
    </div>

    <button id="hadirBtn" class="btn-primary" disabled>SAYA HADIR</button>
    <p id="formError" class="error-text hidden"></p>
  `;

  document.querySelectorAll(".mode-option").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".mode-option").forEach((x) => x.classList.remove("selected"));
      el.classList.add("selected");
      selectedMode = el.dataset.mode;
      validateForm();
    });
  });

  document.getElementById("studentSelect").addEventListener("change", onStudentSelected);
  document.getElementById("hadirBtn").addEventListener("click", submitAttendance);
}

// -------- Saat mahasiswa memilih nama: tampilkan bagian PIN yang sesuai --------
let pinAlreadySet = false;

async function onStudentSelected() {
  const studentId = document.getElementById("studentSelect").value;
  const pinSection = document.getElementById("pinSection");

  if (!studentId) {
    pinSection.classList.add("hidden");
    pinSection.innerHTML = "";
    validateForm();
    return;
  }

  const { data: hasPinSet } = await supabaseClient.rpc("check_student_pin", {
    p_student_id: studentId,
  });
  pinAlreadySet = !!hasPinSet;

  if (pinAlreadySet) {
    pinSection.innerHTML = `
      <label>Masukkan PIN Anda
        <input type="password" id="pinInput" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off" />
      </label>
    `;
  } else {
    pinSection.innerHTML = `
      <label>Buat PIN 4 Digit
        <input type="password" id="pinInput" inputmode="numeric" maxlength="4" placeholder="Contoh: 1234" autocomplete="off" />
      </label>
      <label>Ulangi PIN
        <input type="password" id="pinConfirmInput" inputmode="numeric" maxlength="4" placeholder="Ulangi PIN" autocomplete="off" />
      </label>
      <p style="font-size:12.5px;color:#6b7280;margin-top:-10px;margin-bottom:14px;">
        PIN ini hanya diminta sekali. Ingat baik-baik dan jangan beri tahu siapa pun — PIN inilah yang menjaga agar tidak ada yang bisa absen atas nama Anda.
      </p>
    `;
  }

  pinSection.classList.remove("hidden");
  document.getElementById("pinInput").addEventListener("input", validateForm);
  const confirmEl = document.getElementById("pinConfirmInput");
  if (confirmEl) confirmEl.addEventListener("input", validateForm);

  validateForm();
}

function isValidPin(pin) {
  return /^[0-9]{4}$/.test(pin || "");
}

function validateForm() {
  const studentId = document.getElementById("studentSelect").value;
  const pinInput = document.getElementById("pinInput");
  const confirmInput = document.getElementById("pinConfirmInput");
  const btn = document.getElementById("hadirBtn");

  if (!studentId || !selectedMode || !pinInput) {
    btn.disabled = true;
    return;
  }

  const pin = pinInput.value.trim();
  let pinOk = isValidPin(pin);

  if (!pinAlreadySet) {
    const confirmPin = confirmInput ? confirmInput.value.trim() : "";
    pinOk = pinOk && isValidPin(confirmPin) && pin === confirmPin;
  }

  btn.disabled = !pinOk;
}

// -------- Submit absensi (verifikasi PIN lewat function di database) --------
async function submitAttendance() {
  const studentId = document.getElementById("studentSelect").value;
  const pinInput = document.getElementById("pinInput");
  const confirmInput = document.getElementById("pinConfirmInput");
  const btn = document.getElementById("hadirBtn");
  const errEl = document.getElementById("formError");
  errEl.classList.add("hidden");

  if (!studentId || !selectedMode || !currentSession || !pinInput) return;

  const pin = pinInput.value.trim();
  if (!pinAlreadySet && pin !== (confirmInput ? confirmInput.value.trim() : "")) {
    errEl.textContent = "PIN dan ulangi PIN tidak sama.";
    errEl.classList.remove("hidden");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Menyimpan…";

  const { data, error } = await supabaseClient.rpc("submit_attendance", {
    p_session_id: currentSession.id,
    p_student_id: studentId,
    p_mode: selectedMode,
    p_pin: pin,
  });

  if (error) {
    if (error.code === "23505") {
      // Duplicate - sudah pernah absen (mis. dari perangkat lain)
      const existing = await checkExistingAttendance(currentSession.id);
      localStorage.setItem("hadir_s2_student_id", studentId);
      currentStudentId = studentId;
      if (existing) {
        renderConfirmation(existing, currentSession, true);
        return;
      }
    }

    // Pesan error dari function (PIN salah / terkunci / sesi tidak aktif)
    errEl.textContent = error.message || "Gagal menyimpan absensi. Silakan coba lagi.";
    errEl.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "SAYA HADIR";

    // Kosongkan input PIN saja supaya bisa dicoba ulang, nama tetap terpilih
    pinInput.value = "";
    if (confirmInput) confirmInput.value = "";
    console.error(error);
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  localStorage.setItem("hadir_s2_student_id", studentId);
  currentStudentId = studentId;

  const studentName = (studentsCache.find((s) => s.id === studentId) || {}).name || "-";
  renderConfirmation(
    { attendance_mode: selectedMode, attended_at: row.attended_at, students: { name: studentName } },
    currentSession,
    false
  );
}

// -------- Render: konfirmasi berhasil / sudah absen --------
function renderConfirmation(attendance, session, alreadyDone) {
  const courseName = session.courses ? session.courses.name : "-";
  const modeLabel = attendance.attendance_mode === "daring" ? "🏠 Daring" : "🏫 Luring";
  const studentName = attendance.students ? attendance.students.name : "-";

  if (alreadyDone) {
    mainEl.innerHTML = `
      <div class="confirmation">
        <div class="big-check">⚠️</div>
        <h2 style="color:#d97706">Sudah Absen</h2>
        <p style="color:#6b7280;margin-top:-10px">Anda sudah melakukan absensi pada sesi ini.</p>
        <div class="confirmation-details">
          <div><span>Tercatat</span><span>${formatTanggalJamWITA(attendance.attended_at)}</span></div>
        </div>
      </div>
    `;
    return;
  }

  mainEl.innerHTML = `
    <div class="confirmation">
      <div class="big-check">✅</div>
      <h2>ABSENSI BERHASIL</h2>
      <div class="confirmation-details">
        <div><span>Nama</span><span>${escapeHtml(studentName)}</span></div>
        <div><span>Mata Kuliah</span><span>${escapeHtml(courseName)}</span></div>
        <div><span>Pertemuan</span><span>${session.meeting_number}</span></div>
        <div><span>Tanggal</span><span>${formatTanggalWITA(attendance.attended_at)}</span></div>
        <div><span>Jam</span><span>${formatJamWITA(attendance.attended_at)}</span></div>
        <div><span>Mode</span><span>${modeLabel}</span></div>
      </div>
    </div>
  `;
}

// -------- Realtime: pantau perubahan status sesi --------
function subscribeRealtime() {
  supabaseClient
    .channel("public:sessions")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sessions" },
      () => loadActiveSession()
    )
    .subscribe();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Register service worker untuk mode PWA/offline shell
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

init();
