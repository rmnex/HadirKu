// =========================================================
// HadirKu - Utilitas PDF & Sorting Bersama
// Dipakai oleh admin.html (admin.js) dan dosen.html (dosen.js)
// =========================================================

// Urutkan mahasiswa berdasarkan NIM (naik). Yang belum punya NIM ditaruh di akhir, diurutkan nama.
function sortStudentsByNim(students) {
  return [...students].sort((a, b) => {
    const nimA = (a.nim || "").toString().trim();
    const nimB = (b.nim || "").toString().trim();
    if (!nimA && !nimB) return a.name.localeCompare(b.name, "id");
    if (!nimA) return 1;
    if (!nimB) return -1;
    return nimA.localeCompare(nimB, "id", { numeric: true });
  });
}

async function pdfImageUrlToDataUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Gagal memuat logo untuk PDF", e);
    return null;
  }
}

// Judul resmi kop surat dokumen presensi
const PDF_KOP_TITLE = "Daftar Presensi Mandiri Mahasiswa MPBSI 2026";

// Kop surat di bagian atas PDF: logo + nama aplikasi + judul resmi + subjudul + garis pemisah
async function pdfAddHeader(doc, appSettings, subtitle) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let textX = 14;

  if (appSettings && appSettings.logo_url) {
    const dataUrl = await pdfImageUrlToDataUrl(appSettings.logo_url);
    if (dataUrl) {
      try {
        doc.addImage(dataUrl, "PNG", 14, 8, 20, 20);
        textX = 40;
      } catch (e) {
        console.error("Gagal menambahkan logo ke PDF", e);
      }
    }
  }

  doc.setFont(undefined, "bold");
  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text((appSettings && appSettings.app_name) || "HadirKu", textX, 14.5);

  doc.setFont(undefined, "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(37, 99, 235);
  doc.text(PDF_KOP_TITLE, textX, 21.5);

  doc.setFont(undefined, "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(subtitle, textX, 27.5);

  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.7);
  doc.line(14, 34, pageWidth - 14, 34);
  doc.setTextColor(0);

  return 40;
}

// Blok tanggal cetak + tanda tangan dosen (dan ketua kelas) di bagian bawah PDF
function pdfAddSignatureBlock(doc, finalY, lecturerName) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const todayStr = new Date().toLocaleDateString("id-ID", {
    timeZone: "Asia/Makassar",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let y = finalY + 16;
  const blockHeight = 40;
  if (y + blockHeight > pageHeight - 10) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(`Samarinda, ${todayStr}`, pageWidth - 14, y, { align: "right" });

  y += 8;
  const leftX = 20;
  const rightX = pageWidth - 65;

  doc.text("Ketua Kelas,", leftX, y);
  doc.text("Dosen Pengampu,", rightX, y);

  const signatureY = y + 24;
  doc.setFontSize(10);
  doc.text("(________________________)", leftX, signatureY);
  doc.text(
    lecturerName ? `(${lecturerName})` : "(________________________)",
    rightX,
    signatureY
  );
}
