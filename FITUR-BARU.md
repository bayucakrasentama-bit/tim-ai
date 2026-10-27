# Fitur baru TIM-AI — Agen AI per tim, CS AI Closing, Kantor AI

Hasil riset 3 halaman (paket 16 asisten ChatGPT bisnis, Komchat AI, C-Founder) diterjemahkan jadi fitur yang menempel ke tim yang sudah ada, plus satu tim baru.

| Tim | Menu baru | Isi | Terinspirasi dari |
|---|---|---|---|
| Tim Konten | **Brand Lab** | Strategi Logo, Tagline & Slogan, Brand Identity Kit | asisten branding |
| Tim Digital | **Agen Produk Digital** | Product Builder, eBook Creator, LP Storytelling, Audit Konversi LP | asisten produk digital & LP |
| Tim ADV | **Agen Meta Ads** | Kreatif: Hook & Headline, Iklan Emosional, Big Concept · Performa: Automated Rules, Lead Gen & CPL, Retargeting, Scaling, Performance Analyzer · **Kalkulator tanpa AI**: rencana scaling budget 3–7 hari & vonis SCALE/HOLD/OPTIMIZE/KILL | asisten Meta Ads |
| Tim CS | **CS AI Closing** | Multi agent (1 nomor WA = 1 agent, maks. 5 produk), product knowledge + foto/video/testimoni yang dikirim di chat, tarif ongkir per ekspedisi & zona + cek ongkir, promo terstruktur (diskon %, potongan, bundling, gratis ongkir), simulator chat sampai closing, total order dihitung ulang sistem, struk/receipt WhatsApp, Data Order AI + export CSV, follow-up otomatis, Broadcast WA, prompt siap pasang di Inbox | Komchat AI |
| **Tim Founder (baru)** | **Kantor AI** | Conductor (perintah bahasa biasa → agen + kartu Planner + jadwal), Laporan Pagi lintas tim → WhatsApp/Telegram, Struktur Tim (peta tim, menu & agen) | C-Founder |

## File yang berubah

- `public/agents.js` — **baru**, semua logika fitur di atas (pola sama dengan modul lain: `window.siarin`, `viewHooks`).
- `public/cs-closer.js` — **baru**, CS AI Closing (dipisah dari agents.js; Kantor AI membaca datanya lewat `window.timCs`).
- `public/agents.css` — **baru**, gaya tambahan memakai token warna yang ada.
- `public/index.html` — 5 tombol menu + grup "Tim Founder", 5 `<section>` kosong, `<link agents.css>`, `<script agents.js>` + `<script cs-closer.js>` (sebelum `shell.js`).
- `public/app.js` — ikon 5 menu baru, `founder` di `TEAM_LABEL` & `TEAM_HOME`.
- `dev/mock-server.mjs` — server uji lokal dengan `/api` palsu (jangan di-deploy).

Salinan asli `index.html` & `app.js` dari produksi ada di `original/` untuk dibandingkan.

## Backend: tidak wajib, tapi disarankan

Semua AI memakai endpoint yang sudah ada (`/api/ai/status`, `/api/ai/chat`, `/api/content`, `/api/reports/team/:team`). Yang belum punya endpoint disimpan **per brand di browser** (seperti `divisions.js`):

1. Pengaturan CS AI (agent, ongkir, promo), Data Order AI, daftar broadcast, riwayat agen, jadwal → pindahkan ke tabel per brand supaya bisa dilihat lintas perangkat.
2. Tim Founder → backend perlu menerima nilai tim `founder` saat menambah anggota (sekarang owner/`semua` sudah melihat menunya).
3. Laporan pagi otomatis tanpa membuka aplikasi → cron (mis. Vercel Cron) yang menyusun laporan dan mengirim lewat kanal `/api/notify` yang sudah ada.
4. Broadcast massal tanpa klik satu per satu → kirim CSV/daftar ke gateway WhatsApp lewat backend.
5. CS AI langsung membalas WhatsApp → sambungkan prompt dari tab "Pasang di Inbox" ke aturan balas otomatis Inbox.

## Coba lokal

```bash
node dev/mock-server.mjs
```

Buka http://localhost:5178 — jawaban AI di mode ini palsu (mock).
