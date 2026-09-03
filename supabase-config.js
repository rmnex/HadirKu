// =========================================================
// KONFIGURASI SUPABASE
// Ganti dua nilai di bawah ini dengan milik proyek Supabase Anda.
// Ambil dari: Supabase Dashboard > Project Settings > API
// =========================================================
const SUPABASE_URL = "https://jiqsuguyyitjfzexxkxm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcXN1Z3V5eWl0amZ6ZXh4a3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NTAxMjgsImV4cCI6MjEwNDAyNjEyOH0.zCyEYGwChos1_nyD0n_tvU3oCeSqTDQdoUz8ePjS7SU";

// Jangan pernah memasukkan Service Role Key di file ini atau file manapun
// yang dikirim ke browser/GitHub Pages. Anon key AMAN untuk publik
// karena akses data diatur oleh Row Level Security (RLS) di Supabase.

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Zona waktu yang dipakai untuk menampilkan semua tanggal/jam
const APP_TIMEZONE = "Asia/Makassar";

function formatTanggalWITA(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString("id-ID", {
    timeZone: APP_TIMEZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatJamWITA(isoString) {
  const d = new Date(isoString);
  return (
    d.toLocaleTimeString("id-ID", {
      timeZone: APP_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
    }) + " WITA"
  );
}

function formatTanggalJamWITA(isoString) {
  return `${formatTanggalWITA(isoString)}, ${formatJamWITA(isoString)}`;
}

// -------- Branding (logo & nama aplikasi) --------
// Dipakai di index.html dan admin.html supaya logo tampil konsisten.
async function loadAppSettings() {
  const { data } = await supabaseClient.from("app_settings").select("app_name, logo_url").eq("id", 1).maybeSingle();
  return data || { app_name: "HadirKu", logo_url: null };
}

async function applyBrandingToHeader() {
  const titleEl = document.getElementById("brandTitle");
  if (!titleEl) return;
  const settings = await loadAppSettings();
  if (settings.logo_url) {
    titleEl.innerHTML = `<img src="${settings.logo_url}" alt="${settings.app_name}" class="brand-logo" />`;
  } else {
    titleEl.textContent = settings.app_name || "HadirKu";
  }
}
