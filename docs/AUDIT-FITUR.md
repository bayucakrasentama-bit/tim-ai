# Audit Fitur per Tim — tim-ai (2026-11-08)

## Hasil audit
- 28 layar (view) di nav — **semua terdaftar, ter-render, dan terpakai; tidak ada view yatim**.
- Arsitektur modul: `suite.js` render dasar (planner/studio/analytics/ai/team); modul lanjutan
  **wrap** (panggil render dasar lalu menambah): ai-hub (ai), planner-views (planner),
  studio-ai (studio), google (team), medsos (kalender/compose/riwayat/akun), ops (approve/revisi),
  growth (tab BEP ROAS/ROAS gabungan), divisions (tab divisi), partner-tools (tab KOL/Affiliate),
  team-ai (panel Master BCS), store (data bersama per brand).
- **Satu-satunya kode mati yang ditemukan**: render Dashboard lama di `suite.js` (ditimpa bento.js)
  beserta markup `#view-dashboard` lama di `index.html` — SUDAH DIHAPUS (commit ini).

## Peta fitur per tim
| Tim | Layar (permalink) | Isi |
|---|---|---|
| Semua | `/today` `/dashboard` `/reports` `/freetools` `/aikeys` `/integrasi` `/tim` | Hari Ini, Dashboard bento eksekutif, Laporan & Master BCS, Free Tools, AI & API Keys (BYOK + Playground/Arena/Gambar/Video/Suara), Integrasi Cepat, Tim & Brand |
| Konten | `/planner` `/studio` `/motion` `/ai` | Planner (tabel/pillar/kanban, approve & revisi), Studio Visual (+ LP Builder, Prompt Builder, tab Hook·Script·Caption AI), Video Motion, AI Studio |
| Digital | `/launch` `/agents-digital` | Launch Lab (ide→riset→konsep→hook/script→iklan→LP, impor ke LP Builder), Agen Produk & Brand (blueprint, eBook, LP storytelling, audit konversi LP) |
| Medsos | `/kalender` `/compose` `/riwayat` `/analitik` `/tiktok` `/akun` | Kalender bulan/minggu/hari + antrean drag, Buat Post multi-akun + preview HP, Riwayat + retry, Analitik + push ke ADV, Scraper TikTok, Akun Sosmed |
| ADV | `/adv` `/agents-adv` | Iklan ADV (Ringkasan & Master BCS, Kanban Testing, Kalkulator BEP ROAS, ROAS Gabungan, Bank Strategi, Akun iklan, Data harian), Agen Meta Ads |
| MP / Live | `/mp` | Iklan Marketplace (+ Live Command Center untuk Tim Live) |
| KOL | `/kol` | Pipeline KOL, Campaign, Jadwal, Sampel & Resi, Analisa Konten, Riset Kreator (ala KingKOL) |
| Affiliate | `/affiliate` | Roster kreator, Riset & Banding Kreator, produk/video/livestream (ala Kalodata) |
| CS / Sales | `/inbox` `/tiket` `/closer` | Inbox omnichannel (Shopee/TikTok/Tokopedia/Lazada/WA/IG), Tiket & Template, CS AI Closing multi-agent |
| Founder / Keuangan | `/founder` | Kantor AI (Conductor, Kantor Virtual, Keuangan, Laporan Pagi, Struktur Tim) |

## Overlap & aturan ke depan (supaya tidak ada fitur terbengkalai)
1. **Generator konten AI** ada di 4 alur: AI Studio (`/ai`), tab Hook·Script·Caption (`/studio`),
   Launch Lab (`/launch`), Agen Produk (`/agents-digital`). Semua lewat satu router AI
   (`/api/ai/chat` → ai-router BYOK). Kontekstual & terhubung ke alurnya masing-masing — BUKAN double.
   **Aturan: generator mandiri baru hanya boleh di AI Studio; yang lain hanya untuk konteks alurnya.**
2. **LP**: satu builder saja (`lp-builder.js`, terbit di `/p/<slug>`). Launch Lab menyiapkan draft
   lalu diimpor ke LP Builder; Agen hanya copy + audit. **Aturan: jangan bikin editor LP kedua.**
3. **Master BCS**: memang tampil per tim (adv/mp/kol/affiliate + laporan) — by design, satu sumber data.
4. **CS**: tab "Pasang di Inbox" di CS AI BELUM tersambung ke auto-reply Inbox (butir 5 FITUR-BARU.md)
   — ini satu-satunya sambungan yang direkomendasikan untuk dirapikan.

## Permalink (app/SaaS)
- Workspace tim: `/konten` `/medsos` `/digital` `/adv` `/mp` `/live` `/kol` `/affiliate` `/cs`
  `/sales` `/keuangan` `/founder` `/semua` (mis. `/cs` → Inbox, `/konten` → Planner).
- Setiap layar punya URL stabil (`/planner`, `/inbox`, `/tiket` untuk Tiket & Template, dst.).
  URL selalu mengikuti layar aktif, tombol back/forward browser berfungsi, judul tab ikut layar.
- Berlaku juga untuk huruf kapital (`/Konten`). SPA fallback: `vercel.json` (prod) + `src/app.js` (lokal).
- File kunci: `public/router.js` (tabel rute), `public/app.js` (show + popstate + boot).
