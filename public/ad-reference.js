export function buildAdReferenceBrief(values = {}, outputFormat = '') {
  const source = String(values.sourceUrl || '').trim();
  const evidence = String(values.reference || '').trim();
  return [
    'Tugas: reverse-engineer materi iklan referensi untuk membuat konsep baru yang relevan bagi brief produk.',
    `URL referensi (metadata saja): ${source || 'tidak diberikan'}`,
    evidence ? `BUKTI REFERENSI YANG DIBERIKAN USER:\n${evidence}` : 'BELUM ADA BAHAN REFERENSI. URL saja tidak cukup; jangan menyimpulkan pola kreatif. Tandai DATA GAP dan tetap boleh buat konsep generik dari brief produk.',
    `Produk/penawaran: ${values.product || 'belum diisi'}`,
    `Target audiens: ${values.audience || 'belum diisi'}`,
    `Offer/bukti yang benar-benar tersedia: ${values.offer || 'belum diisi'}`,
    `Format yang diinginkan: ${values.format || 'Reels 30 detik'}`,
    '',
    'Aturan analisis:',
    '- JANGAN mengaku membuka atau menonton URL; analisis hanya bukti/caption/transkrip/deskripsi yang ditempel user.',
    '- Pisahkan OBSERVASI dari HIPOTESIS. Status aktif di Ads Library bukan bukti iklan menang; jangan mengarang ROAS, spend, conversion, atau alasan performa.',
    '- Petakan hook, masalah, demonstrasi/bukti, mekanisme manfaat, offer, CTA, format, pacing, dan elemen visual yang disebut eksplisit.',
    '- Ambil prinsip/struktur saja; jangan menyalin kalimat, identitas, visual khas, atau klaim kompetitor. Buat konsep baru untuk produk user.',
    '- Klaim harus sesuai bukti yang diberikan; beri label DATA GAP jika tidak ada data pendukung.',
    '',
    `Format output wajib diikuti:\n${outputFormat || 'Gunakan laporan berstruktur dengan observasi, hipotesis, konsep original, klaim/data gap, dan tes A/B.'}`,
  ].join('\n');
}
