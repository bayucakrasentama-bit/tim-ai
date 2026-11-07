# Motion Factory di TIM-AI — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User TIM-AI bikin request produksi (produk, target, CTA, link Drive footage). Mac mini menarik request itu, merender pakai pipeline Motion Factory, lalu melaporkan link folder Drive hasil.

**Architecture:**
- **TIM-AI (Vercel)** menyimpan profil produk dan antrean request di DB-nya, plus menyediakan dua kelompok endpoint:
  - endpoint user (pakai login dan brand scope);
  - endpoint agen (pakai token Bearer, tanpa login).
- **Mac mini** menjalankan `py/agent.py` (launchd). Tiap 30 detik agen ini poll TIM-AI, menyiapkan produk dinamis (config, footage via Drive API, index, stem), lalu memanggil `run_pipeline` yang sudah ada dengan konteks request: hitung per `request_id`, filter mode CTA, folder tujuan per request, dan callback `should_stop`.
- **Produksi lama Zestmag/Gurahfit** dijalankan oleh agen yang sama saat antrean kosong, dan berhenti dengan aman begitu ada request baru.

**Tech Stack:**
- TIM-AI: Node 22.13+, Express 5, `node:test`, `node:sqlite` (tes), Postgres (produksi), JS frontend tanpa framework.
- Mac: Python 3 (`.venv`), `unittest`, `google-api-python-client` + `google-auth-oauthlib`, Remotion yang sudah ada.

**Spec:** `docs/2026-11-07-motion-factory-di-tim-ai-design.md` (folder ini). Baca dulu sebelum mulai.

**Repo:**
- **TIM-AI:** `/Users/macmasaji/Documents/tim-ai`, sebut **[TA]**. Ini repo git. Bikin branch baru dari `main`, misalnya `feat/motion-factory`, dan commit per task.
- **Motion Factory:** `/Users/macmasaji/Documents/ai-tools/tiktok-motion-factory`, sebut **[MF]**. Ini **bukan repo git**.
  - Sebelum mengubah file `py/*`, backup dulu ke `data/backup_<tanggal>/` (pola `.bak_*` yang sudah ada).
  - Langkah "commit" di [MF] diganti "backup selesai + tes lulus".

## Global Constraints

- Semua teks UI dan pesan error dalam Bahasa Indonesia santai, sama seperti modul TIM-AI lain.
- Status request persis: `menunggu_profil`, `antre`, `menyiapkan`, `produksi`, `selesai`, `dijeda`, `dibatalkan`, `gagal`.
- CTA persis: `kerkun` (keranjang kuning), `awareness` (tanpa keranjang), `campur` (50:50). Ini memetakan ke `config/factory.json → modes`.
- Target: bilangan bulat 1–20.000.
- Link footage wajib berupa URL folder Google Drive (`https://drive.google.com/drive/folders/<id>` atau `.../drive/u/N/folders/<id>`).
- Menyetujui profil dan mengubah prioritas: hanya `canManage(req.user)`. Bikin request: semua anggota brand.
- Agen dianggap online kalau heartbeat terakhir < 120 detik.
- Folder hasil: `Drive Saya/Video Tiktok Affiliate/<Nama Produk> - <YYYY-MM-DD> (#<id request>)/`, di-share "anyone with link: reader".
- Perkiraan ruang: 18 GB per 1.000 video. Sebelum produksi, sisa kuota Drive harus ≥ `target_sisa × 0.018 + 10` GB. Kalau kurang: status `dijeda`, pesan `Drive kurang ±X GB`.
- Footage talent (`talent_sources`, Mas Bayu) hanya untuk `zestmag` dan `gurahfit`.
- `violations`, `sanitize`, `brand_lock`, `brand_errors`, dan `banned_hashtag_terms` berlaku untuk semua produk. Mode `awareness` dilarang menyebut keranjang/checkout.
- Data lama (`data/factory.db`, stem, kuota, dan folder Drive Zestmag/Gurahfit) tidak boleh berubah perilakunya. `./run.sh` manual tetap jalan.
- Mac tidak membuka port. Hanya agen yang memanggil TIM-AI.
- Token agen: env `FACTORY_AGENT_TOKEN` di Vercel dan `.env` [MF]. URL TIM-AI di `.env` [MF] sebagai `TIM_AI_URL`.

## Review Focus

1. **Link footage belum di-share ke bayucakrasentama@gmail.com, atau bukan folder** → request `gagal` dengan pesan "Folder belum di-share ke bayucakrasentama@gmail.com" (Task 6, Task 8).
2. **Mac mati atau restart di tengah request** → setelah hidup lagi, agen melanjutkan request yang sama (status `produksi`/`menyiapkan` milik agen ini) tanpa mengulang video `delivered`, dan tanpa klaim request kedua (Task 3, Task 8).
3. **User menekan Jeda atau Batalkan saat render batch jalan** → batch aktif selesai, lalu loop berhenti. Video yang sudah ter-upload tetap ada (Task 7, Task 8).
4. **Footage tanpa shot produk** → request `gagal` dengan pesan "Footage nggak ada shot produk (botol/kemasan)". Footage tanpa shot orang tetap jalan, dengan pesan catatan (Task 8).
5. **Request kedua untuk produk yang sama** → nggak mengulang combo request pertama (`combo UNIQUE` per produk tetap), dan target dihitung per request, bukan total produk (Task 7).

---

## Kontrak HTTP (dipakai Task 2–4 dan Task 8)

Endpoint agen memakai header `Authorization: Bearer <FACTORY_AGENT_TOKEN>`. Didaftarkan **sebelum** middleware login di `src/app.js`. Token kosong atau salah → 401.

| Method & path | Body | Response |
|---|---|---|
| `POST /api/factory/agent/heartbeat` | `{state:'idle'|'producing'|'legacy', job_id:number|null, drive_free_gb:number|null, legacy:{[pid]:{done,quota}}|null}` | `{ok:true, commands:[{job_id, action:'pause'|'cancel'}]}` |
| `POST /api/factory/agent/claim` | `{}` | `{job: AgentJob|null}` |
| `POST /api/factory/agent/jobs/:id/progress` | `{status?:'menyiapkan'|'produksi'|'dijeda', done?:number, failed?:number, drive_url?:string, message?:string, eta_at?:string}` | `{ok:true, action:'continue'|'pause'|'cancel'}` |
| `POST /api/factory/agent/jobs/:id/fail` | `{message:string}` | `{ok:true}` |
| `POST /api/factory/agent/jobs/:id/done` | `{done:number, drive_url:string}` | `{ok:true}` |
| `GET /api/factory/agent/peek` | – | `{waiting:boolean}` |

`AgentJob = {id, brand_id, target, cta, footage_url, done, drive_url, product:{id, slug, name, profile}}`. `profile` adalah objek dari Task 1.

`claim` mengembalikan job milik agen yang statusnya `menyiapkan`/`produksi` kalau ada (resume). Kalau nggak ada, ambil `antre` dengan urutan `priority DESC, id ASC` dan set statusnya ke `menyiapkan` secara atomik (`UPDATE ... WHERE id=? AND status='antre'`).

---

### Task 1: Skema DB + model profil produk [TA]

**Files:**
- Modify: `src/db.js` (array `TABLES`, tambah dua tabel)
- Create: `src/factory/profile.js`
- Create: `test/factory-profile.test.js`

**Interfaces:**
- Produces:
  - tabel `factory_products(id PK, brand_id INTEGER NOT NULL, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', profile TEXT NOT NULL, product_image TEXT, label_image TEXT, created_by TEXT, approved_by TEXT, approved_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`
  - tabel `factory_jobs(id PK, brand_id INTEGER NOT NULL, product_id INTEGER NOT NULL, target INTEGER NOT NULL, cta TEXT NOT NULL, footage_url TEXT NOT NULL, status TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, drive_url TEXT, message TEXT, eta_at TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, started_at TEXT, finished_at TEXT)`
  - `slugify(name: string): string`: huruf kecil, `[a-z0-9]` saja, contoh `"Madu Olymax"` → `"olymax"` (buang kata awal `madu`), maks 24 karakter.
  - `validateProfile(p: object): string[]`: daftar error, kosong kalau valid.
  - `PROFILE_FIELDS`: daftar field wajib, yaitu field `config/products/zestmag.json` (`name, short, tts_name, file_prefix, official_claim, brand_lock, tts_lexicon, other_brands, label_regex, facts, audience, angles, hook_styles, cta_variants, badge_texts, compliance, palette, safe_hashtags`) + `story: {category, daily_pain_points, physical_features, safe_benefits, usage_moments}`.
  - `parseFolderId(url: string): string|null`.

- [ ] **Step 1: Tulis tes gagal** di `test/factory-profile.test.js` (`node:test` + `assert/strict`):
  - `slugify('Madu Olymax') === 'olymax'`, `slugify('Pro Lambung 250ml') === 'prolambung250ml'`
  - `parseFolderId('https://drive.google.com/drive/folders/1AbC_d-9?usp=sharing') === '1AbC_d-9'`, `parseFolderId('https://drive.google.com/drive/u/0/folders/XYZ') === 'XYZ'`, `parseFolderId('https://drive.google.com/file/d/XYZ/view') === null`
  - `validateProfile({})` berisi error `official_claim wajib diisi`
  - `validateProfile(fixture zestmag + story)` → `[]`. Fixture: salin `config/products/zestmag.json` [MF] + entri `madu_zestmag` dari `products.json` [MF] ke `test/fixtures/zestmag-profile.json`.
  - `validateProfile` menolak `story.daily_pain_points` dengan kurang dari 3 item.
  - Tes `openDb(':memory:')` membuat kedua tabel. Cek pakai `SELECT * FROM factory_jobs LIMIT 0` dan `SELECT * FROM factory_products LIMIT 0`, keduanya tanpa error.
- [ ] **Step 2:** `node --test test/factory-profile.test.js` → FAIL (modul nggak ada).
- [ ] **Step 3:** Implement tabel di `TABLES` dan fungsi di `src/factory/profile.js`.
- [ ] **Step 4:** `node --test test/factory-profile.test.js` → PASS. Tambahkan juga `"test": "node --disable-warning=ExperimentalWarning --test test/*.test.js"` (sudah ada) dan pastikan `npm test` lulus.
- [ ] **Step 5:** Commit `feat(factory): skema dan profil produk Motion Factory`.

### Task 2: Endpoint user: profil produk + AI draft [TA]

**Files:**
- Create: `src/factory/routes.js` (`factoryRoutes(app, db, scope)`)
- Modify: `src/app.js` (panggil `factoryRoutes(app, db, scope)` setelah `founderRoutes`)
- Test: `test/factory-routes.test.js`

**Interfaces:**
- Consumes: Task 1 (`slugify`, `validateProfile`, tabel).
- Produces:
  - `GET /api/factory/products` → `{products:[{id, slug, name, status, profile, product_image, label_image, approved_by, approved_at}]}` (brand aktif).
  - `POST /api/factory/products` `{name, category, official_claim, notes?, palette?, product_image?, label_image?}` → `{product}`. Status `draft`, profile awal berisi field yang diisi user. 409 kalau slug sudah dipakai.
  - `POST /api/factory/products/:id/draft` → `{product}`. Isi profile lewat `askClaude({schema, system, content})` dari `src/ai.js`. `official_claim` dari user **tidak boleh** diubah AI (ditimpa ulang setelah respons). `brand_lock` minimal memuat varian ejaan nama produk. `compliance.banned_phrases` minimal memuat daftar terlarang global dari spec bagian 3 README [MF] (nama penyakit, klaim medis, promo palsu).
  - `PUT /api/factory/products/:id` `{profile, product_image?, label_image?}` → `{product}`. Kalau produk sudah `approved` dan diedit, status balik ke `draft`.
  - `POST /api/factory/products/:id/approve` → hanya `canManage`. Menolak (400) kalau `validateProfile` ada error, `product_image` kosong, atau `label_image` kosong. Set `approved`, lalu ubah semua job produk ini yang `menunggu_profil` jadi `antre`.
  - Upload gambar: reuse multer `upload` dan `storage` yang sudah dipakai `/api/content/:id/assets`. Endpoint `POST /api/factory/upload` (field `file`) → `{url}`. Kirim `upload, storage` lewat argumen ke-4: `factoryRoutes(app, db, scope, { upload, storage })`.

- [ ] **Step 1: Tulis tes gagal.** Helper `startApp()` di `test/helpers.js` menyalakan `createApp({db: await openDb(':memory:'), connectors: {}, storage: localStorage(tmpdir)})` di port acak (tanpa password, jadi user = owner). Tes:
  - `POST /api/factory/products {name:'Madu Olymax', category:'x', official_claim:'membantu memelihara daya tahan tubuh'}` → 200, `product.slug === 'olymax'`, `status === 'draft'`
  - POST nama yang sama → 409
  - `approve` saat profile belum lengkap → 400 dengan `error` berisi nama field
  - `PUT` dengan fixture lengkap + `product_image` + `label_image` lalu `approve` → `status === 'approved'`
  - `PUT` lagi setelah approved → `status === 'draft'`
  - `draft` dengan `askClaude` di-mock: ekspor `setAskForTests(fn)` dari `routes.js` (default `askClaude`). Mock mengembalikan `official_claim:'menyembuhkan'` → hasil tetap memakai klaim user.
- [ ] **Step 2:** `node --test test/factory-routes.test.js` → FAIL.
- [ ] **Step 3:** Implement endpoint di `src/factory/routes.js` dan daftarkan di `src/app.js`.
- [ ] **Step 4:** Tes → PASS. `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(factory): endpoint profil produk + AI draft`.

### Task 3: Endpoint user: request produksi + antrean [TA]

**Files:**
- Modify: `src/factory/routes.js`
- Test: `test/factory-routes.test.js` (tambah tes)

**Interfaces:**
- Consumes: Task 1–2.
- Produces:
  - `GET /api/factory/jobs` → `{jobs:[{...factory_jobs, product_name, queue_position|null}], agent:{online:boolean, state, job_id, seen_at, drive_free_gb, legacy}}`
  - `POST /api/factory/jobs {product_id, target, cta, footage_url}` → `{job}`. Status `antre` kalau produk `approved`, `menunggu_profil` kalau belum. Validasi sesuai Global Constraints (400 + pesan).
  - `POST /api/factory/jobs/:id/pause` → hanya dari `antre`/`menyiapkan`/`produksi` → `dijeda` (agen diberi tahu lewat `commands`/`action`).
  - `POST /api/factory/jobs/:id/resume` → `dijeda` → `antre`.
  - `POST /api/factory/jobs/:id/cancel` → status apa pun selain `selesai` → `dibatalkan`.
  - `POST /api/factory/jobs/:id/retry` → `gagal` → `antre`, `message = null`.
  - `POST /api/factory/jobs/:id/priority {priority:number}` → hanya `canManage`.
  - `agentState(db): Promise<{online, state, job_id, seen_at, drive_free_gb, legacy}>` dari `getSetting(db,'factory:agent')`, diekspor untuk Task 4.

- [ ] **Step 1: Tulis tes gagal:**
  - target `0` / `20001` / `'abc'` → 400
  - `footage_url:'https://drive.google.com/file/d/X/view'` → 400 `Link harus folder Google Drive`
  - `cta:'promo'` → 400
  - produk draft → job `menunggu_profil`; setelah approve, job jadi `antre`
  - `queue_position`: dua job antre, job kedua `priority` 5 → `queue_position` 1
  - pause → resume → `antre`; cancel `selesai` → 400
  - `agent.online === false` kalau belum ada heartbeat
- [ ] **Step 2:** Tes → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tes → PASS.
- [ ] **Step 5:** Commit `feat(factory): request produksi dan antrean`.

### Task 4: Endpoint agen + notifikasi [TA]

**Files:**
- Create: `src/factory/agent-routes.js` (`factoryAgentRoutes(app, db, { token })`)
- Modify: `src/app.js` (daftarkan **sebelum** `app.use('/api', ... currentUser ...)`, token dari `process.env.FACTORY_AGENT_TOKEN`, diteruskan lewat argumen `createApp({ ..., factoryToken })` dan `bootstrap`)
- Modify: `src/notify.js` (`NOTIFY_EVENTS.factory_done = 'Motion Factory selesai/gagal'`)
- Test: `test/factory-agent.test.js`

**Interfaces:**
- Consumes: kontrak HTTP di atas, Task 3 (`agentState`).
- Produces: semua endpoint di tabel kontrak.
  - `done` → status `selesai`, `finished_at`, lalu `notify(db, brand_id, 'factory_done', '✅ Motion Factory: <produk> <done> video selesai\n<drive_url>')`.
  - `fail` → status `gagal` + `message`, lalu notify `'❌ Motion Factory: <produk> gagal — <message>'`.
  - `progress` mengembalikan `action:'pause'` kalau status di DB `dijeda`, `'cancel'` kalau `dibatalkan`, selain itu `'continue'`. Field `done` hanya boleh naik (pakai `MAX(done, ?)`).
  - `heartbeat` menyimpan `{...body, seen_at: now()}` di setting `factory:agent`. `commands` berisi job `dijeda`/`dibatalkan` yang sedang `job_id` agen.
  - `GET /api/factory/agent/peek` → `{waiting:boolean}` (ada job `antre`). Dipakai agen buat menghentikan produksi lama.

- [ ] **Step 1: Tulis tes gagal:**
  - tanpa header → 401; token salah → 401; `FACTORY_AGENT_TOKEN` kosong → semua 401
  - `claim` saat antrean kosong → `{job:null}`
  - dua job antre (B priority 5) → claim pertama dapat B dengan status `menyiapkan`, dan `job.product.profile` berupa objek
  - claim kedua saat B masih `menyiapkan` → dapat B lagi (resume), bukan A
  - `progress {done:10}` lalu `{done:5}` → `done` tetap 10
  - user pause B → `progress` mengembalikan `action:'pause'`; heartbeat `{job_id:B}` → `commands` berisi `{job_id:B, action:'pause'}`
  - `done {done:3, drive_url}` → job `selesai`; `notify` dipanggil sekali. Mock lewat `setNotifyForTests` di `agent-routes.js`.
  - `GET /api/factory/jobs` setelah heartbeat → `agent.online === true`
  - `peek` saat ada job `antre` → `{waiting:true}`; saat kosong → `{waiting:false}`
- [ ] **Step 2:** Tes → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tes → PASS, `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(factory): endpoint agen Mac mini`.

### Task 5: Menu "Motion Factory" di frontend [TA]

**Files:**
- Create: `public/factory.js`, `public/factory.css`
- Modify: `public/index.html`:
  - tombol `<button data-view="factory" data-team="konten">Motion Factory</button>` setelah tombol `motion`;
  - `<section id="view-factory" class="view"></section>`;
  - `<link factory.css>`;
  - `<script src="factory.js">` sebelum `shell.js`.
- Modify: `public/app.js` (`ICONS.factory`, ikon pabrik/tumpukan film, gaya garis yang sama)
- Modify: `build.mjs` kalau daftar file publik di-bundle eksplisit. Cek dulu.

**Interfaces:**
- Consumes: endpoint Task 2–3, `window.siarin` (`api, esc, toast, openModal, closeModal, state, viewHooks`), pola `public/agents.js`.
- Produces: `S.viewHooks.factory = async () => {...}`

Isi layar (pakai kelas CSS dan token warna yang ada):
1. **Kartu status Mac:**
   - 🟢 Online: "Mac mini online — sedang <state>";
   - ⚪ Offline: "Mac mini offline — produksi nunggu Mac nyala";
   - kalau `legacy` ada, tampilkan juga "Produksi lama: Zestmag 3.120/10.000 · Gurahfit …".
2. **Form "Request produksi baru":**
   - Produk (select dari `/api/factory/products` + opsi "+ Produk baru");
   - Target (number, 1–20.000);
   - CTA (3 radio: Keranjang kuning / Tanpa keranjang / Campur);
   - Link folder Drive footage (wajib), dengan hint "Share folder ke bayucakrasentama@gmail.com dulu".
   - Di bawah form ada perkiraan durasi `target × 23 dtk` dan ruang `target × 18 MB`.
3. **Modal profil produk:**
   - isian awal (nama, kategori, klaim label, upload foto produk + foto label, catatan);
   - tombol "Susun pakai AI" (`/draft`);
   - editor field `story.*`, `angles`, `cta_variants`, `badge_texts`, dan `compliance.banned_phrases` sebagai textarea satu item per baris;
   - tombol "Setujui profil" yang cuma muncul untuk owner/admin.
4. **Tabel request:**
   - kolom: produk, target, CTA, status (pill), progres bar `done/target`, ETA, link Drive (kalau ada), pesan;
   - aksi Jeda/Lanjut/Batalkan/Coba lagi sesuai status, dan ▲ prioritas untuk owner/admin;
   - refresh otomatis tiap 15 detik selama view terbuka.

- [ ] **Step 1:** Implement `public/factory.js` + CSS + wiring.
- [ ] **Step 2:** Verifikasi manual: `npm start` (tanpa `APP_PASSWORD`) → buka http://localhost:4321 → menu Motion Factory muncul di grup Tim Konten.
  - Bikin produk "Madu Olymax", Susun pakai AI (butuh `ANTHROPIC_API_KEY`; tanpa key, isi manual), lalu Setujui.
  - Bikin request 5 video → muncul `antre`.
  - Jeda → Lanjut → Batalkan berfungsi.
  - Tampilan lebar 375px nggak ada scroll horizontal.
- [ ] **Step 3:** Commit `feat(factory): menu Motion Factory`.

### Task 6: Klien Drive API [MF]

**Files:**
- Create: `py/drive_api.py`
- Create: `tests/test_drive_api.py`
- Modify: `requirements.txt` (+ `google-api-python-client==2.*` dan `google-auth-oauthlib==1.*`; pakai versi terbaru yang dirilis ≥ 2 minggu lalu, pin persis)
- Create: `docs/SETUP-GOOGLE-OAUTH.md` (panduan owner)

**Interfaces:**
- Produces:
  - `class DriveError(Exception)` dengan `.user_message: str`
  - `parse_folder_id(url: str) -> str | None` (aturan sama dengan Task 1)
  - `service()`: OAuth desktop. File client `config/google_oauth_client.json`, token `data/google_token.json`, scope `https://www.googleapis.com/auth/drive`. Login pertama lewat `InstalledAppFlow.run_local_server(port=0)`.
  - `check_folder(folder_id: str) -> str`: nama folder. Kalau 404/403 → `DriveError("Folder belum di-share ke bayucakrasentama@gmail.com")`. Kalau bukan folder → `DriveError("Link itu bukan folder")`.
  - `download_videos(folder_id: str, dest: Path, on_progress: Callable[[int,int],None] | None = None) -> int`: rekursif, hanya `mimeType` `video/*`, skip kalau file lokal sudah ada dengan ukuran sama. Mengembalikan jumlah file video.
  - `free_gb() -> float | None`: `about.get(fields='storageQuota')`. `limit` kosong (unlimited) → `None`.
  - `ensure_result_folder(name: str) -> tuple[str, str]`: buat atau ambil folder `name` di dalam folder `Video Tiktok Affiliate` (dicari by name di root "Drive Saya"; dibuat kalau belum ada), share `anyone/reader`, lalu kembalikan `(folder_id, webViewLink)`.

- [ ] **Step 1: Tulis tes gagal** (`unittest`, Google service di-mock dengan `unittest.mock`):
  - `parse_folder_id`: 3 kasus seperti Task 1
  - `check_folder` dengan mock `HttpError` 404 → `DriveError.user_message` persis seperti di atas
  - `download_videos`: mock list 2 video + 1 jpg + 1 subfolder berisi 1 video → 3 file dilaporkan; jalan kedua dengan file yang sudah ada → nggak memanggil download lagi
  - `ensure_result_folder` dipanggil dua kali dengan nama sama → `files().create` untuk folder hasil hanya dipanggil sekali
- [ ] **Step 2:** `.venv/bin/python -m unittest tests/test_drive_api.py` → FAIL.
- [ ] **Step 3:** Implement. Setelah itu `.venv/bin/pip install -r requirements.txt`.
- [ ] **Step 4:** Tes → PASS.
- [ ] **Step 5:** Tulis `docs/SETUP-GOOGLE-OAUTH.md`:
  1. Bikin project di console.cloud.google.com.
  2. Aktifkan Google Drive API.
  3. Isi OAuth consent screen: External, isi nama app, lalu **Publish app** (In production, supaya token nggak kedaluwarsa tiap 7 hari).
  4. Bikin Credentials → OAuth client ID → Desktop app → download JSON → simpan sebagai `config/google_oauth_client.json`.
  5. Jalankan `./run.sh drive-login`, login sebagai bayucakrasentama@gmail.com, dan lanjutkan meski muncul peringatan "belum diverifikasi".

  Tambahkan juga `drive-login` di `run.sh` → `$PY -c "import sys; sys.path.insert(0,'py'); import drive_api; drive_api.service(); print('OK')"`.

### Task 7: Produk dinamis + konteks request di pipeline [MF]

**Files:**
- Modify: `py/common.py`:
  - `PRODUCTS` juga memuat `config/dynamic_products.json`;
  - migrasi `videos.request_id INTEGER`;
  - `counts_for_request`.
- Modify: `py/stems.py` (`assemble_story(pid, n, modes=None, request_id=None)`, `assemble(pid, n, modes=None, request_id=None)`)
- Modify: `py/deliver.py` (tujuan video dengan `request_id` → folder request)
- Modify: `py/planner.py` (talent hanya untuk zestmag/gurahfit)
- Modify: `py/index_footage.py` (`main(only_product: str | None = None)`)
- Modify: `py/factory.py` (`run_pipeline(..., ctx: RequestCtx | None = None, should_stop=None)`)
- Create: `py/product_profiles.py`
- Create: `tests/test_request_pipeline.py`

**Interfaces:**
- Consumes: profil dari Task 1 (bentuk JSON sama).
- Produces:
  - `product_profiles.install(slug: str, profile: dict, footage_dir: Path, quota: int) -> None`:
    - tulis `config/products/<slug>.json` (semua field kecuali `story`);
    - upsert entri `products.json` dengan `product_id = slug` + isi `story`;
    - upsert `config/dynamic_products.json[slug] = {"config": "config/products/<slug>.json", "quota": quota, "footage": [{"path": str(footage_dir), "role": "auto"}], "dynamic": true}`.

    Fungsi ini idempoten, dan **tidak pernah** menulis ke `config/factory.json`. Karena `PRODUCTS` dibaca saat import, sediakan `common.reload_products() -> None` yang mengisi ulang dict `PRODUCTS` di tempat.
  - `common.MODES_FOR_CTA = {"kerkun": ["kerkun"], "awareness": ["awareness"], "campur": ["kerkun", "awareness"]}`
  - `@dataclass RequestCtx: request_id: int; pid: str; target: int; modes: list[str]; dest_dir: Path`
  - `common.counts_for_request(request_id: int) -> dict[str, int]` (status → jumlah)
  - `run_pipeline(pids, targets, skip_stems=False, ctx=None, should_stop: Callable[[], bool] | None = None) -> str`:
    - mengembalikan `"done" | "stopped" | "exhausted" | "failed"`. Pemanggil lama yang mengecek `True/False` diubah: `"done"` = True.
    - Dengan `ctx`: target dan ETA dihitung dari `counts_for_request`, `stems.assemble(ctx.pid, batch, modes=ctx.modes, request_id=ctx.request_id)`, dan video yang dibuat menyimpan `request_id`.
    - `should_stop()` dicek tiap putaran loop. Kalau True: jangan mulai batch render baru; tunggu `render_proc` selesai, `deliver.finalize()`, `deliver.sync()` sekali, lalu return `"stopped"`.
  - `deliver.dest_dir_for`: kalau `row["request_id"]`, tujuan = `ctx.dest_dir` (path lokal Drive for desktop dari folder hasil; disimpan di tabel `kv` sebagai `request_dest:<id>`).
  - Planner: segmen talent (`seg.get("talent")`) hanya boleh dipilih kalau `pid in ("zestmag", "gurahfit")`.

- [ ] **Step 0:** Backup `py/*.py`, `config/factory.json`, `products.json`, dan `data/factory.db` ke `data/backup_20261107/`.
- [ ] **Step 1: Tulis tes gagal.** `tests/test_request_pipeline.py` memakai DB SQLite sementara (set `CONFIG["paths"]["db"]` lewat env `MF_DB_PATH` yang dibaca `common.py`; tambahkan dukungan env ini) dan folder `config` sementara:
  - `install('olymax', fixture, Path('/tmp/x'), 0)` dua kali → `dynamic_products.json` punya 1 entri; `factory.json` byte-identik sebelum dan sesudah
  - `reload_products()` → `'olymax' in PRODUCTS` dan `PRODUCTS['olymax']['story']['daily_pain_points']` terisi
  - `MODES_FOR_CTA['campur'] == ['kerkun','awareness']`; `assemble_story('olymax', 10, modes=['awareness'])` dengan stem fixture → semua video baru `mode == 'awareness'` dan `request_id` sesuai
  - dua request untuk `olymax` → kolom `combo` nggak ada yang kembar di antara keduanya
  - `counts_for_request(1)` hanya menghitung video `request_id=1`
  - planner dengan `pid='olymax'` dan index berisi segmen talent + produk → nggak ada segmen talent di plan; dengan `pid='zestmag'` → talent boleh
  - `run_pipeline` dengan `should_stop` yang langsung True dan semua langkah berat di-mock (`index_footage.main`, `prepare_stems`, `subprocess.Popen`) → return `"stopped"` tanpa memulai render
- [ ] **Step 2:** `.venv/bin/python -m unittest tests/test_request_pipeline.py` → FAIL.
- [ ] **Step 3:** Implement sesuai Interfaces.
- [ ] **Step 4:** Tes → PASS.
- [ ] **Step 5: Regresi produksi lama:**
  - `./run.sh status` menampilkan angka Zestmag/Gurahfit sama seperti sebelum perubahan (bandingkan output sebelum Step 0);
  - `./run.sh preview 25` tetap menghasilkan 6 still frame.

### Task 8: Agen Mac mini [MF]

**Files:**
- Create: `py/agent.py`
- Create: `scripts/com.timai.motionfactory.plist` (launchd, `KeepAlive` true, jalankan `caffeinate -dimsu .venv/bin/python py/agent.py`, log ke `data/logs/agent.log`)
- Modify: `run.sh` (`agent` → jalankan agen di foreground; `agent-install` → salin plist ke `~/Library/LaunchAgents/` lalu `launchctl load`)
- Modify: `py/factory.py` (`acquire_lock() -> file` dipisah dari `main()` supaya dipakai bersama)
- Test: `tests/test_agent.py`

**Interfaces:**
- Consumes: kontrak HTTP, Task 6 (`drive_api.*`), Task 7 (`install`, `reload_products`, `RequestCtx`, `run_pipeline`, `counts_for_request`, `MODES_FOR_CTA`, `index_footage.main(only_product)`).
- Produces:
  - `class TimAi(base_url: str, token: str)` dengan method `heartbeat(**body) -> dict`, `claim() -> dict | None`, `progress(job_id, **body) -> str` (action), `fail(job_id, message) -> None`, `done(job_id, done, drive_url) -> None`. Pakai `urllib.request`, timeout 20 dtk. Error jaringan dicatat ke log lalu dicoba lagi di putaran berikutnya, jangan crash.
  - `prepare_job(job: dict, api: TimAi) -> RequestCtx`, berurutan:
    1. `drive_api.check_folder`;
    2. `download_videos` ke `data/footage/<slug>/` (lapor `progress(status='menyiapkan', message='Download footage 12/40')`);
    3. `install`;
    4. `reload_products`;
    5. `index_footage.main(only_product=slug)`;
    6. kalau index produk itu nggak punya segmen peran `product` → `DriveError("Footage nggak ada shot produk (botol/kemasan)")`; kalau nggak ada segmen `person` → kirim `message` catatan;
    7. `stems.generate_story(slug)` per persona, lalu `stems.voice_all(slug)`;
    8. cek ruang: `free_gb() < (target - done) * 0.018 + 10` → lapor `progress(status='dijeda', message='Drive kurang ±X GB')` dan raise `Paused`;
    9. `ensure_result_folder(f"{name} - {YYYY-MM-DD} ({'#'}{id})")` → `progress(drive_url=link)`, lalu tunggu path lokal folder itu muncul di `DRIVE_DIR` (maks 10 menit, cek tiap 15 dtk) dan simpan `kv request_dest:<id>`.

    Untuk `zestmag`/`gurahfit` (slug lama): lewati langkah 1–7 dan pakai stem/footage yang sudah ada.
  - `loop_once(api, state) -> None`: satu putaran.
    - Heartbeat dulu.
    - Kalau ada job (`claim`) → `prepare_job` lalu `run_pipeline([slug], {slug: target}, ctx=..., should_stop=lambda: <progress action != 'continue', dicek paling sering tiap 30 dtk>)`. Hasil `"done"` → `done(...)`; `"stopped"` → nggak lapor apa-apa (status sudah diatur user); `"exhausted"`/`"failed"` → `fail(...)` dengan pesan dari log.
    - Kalau antrean kosong → jalankan produksi lama `run_pipeline(['zestmag','gurahfit'], quota)` dengan `should_stop=lambda: api.peek()` (method `TimAi.peek() -> bool`, dicek paling sering tiap 30 dtk). Heartbeat `state='legacy'`.
  - `main()`: `acquire_lock()`, lalu loop `loop_once` tiap 30 dtk. Semua exception di dalam satu job → `api.fail(job_id, e.user_message or str(e))`, loop tetap hidup.

- [ ] **Step 1: Tulis tes gagal** (`tests/test_agent.py`, `TimAi`, `drive_api`, `run_pipeline` di-mock):
  - claim mengembalikan job Olymax, `run_pipeline` → `"done"` → `done()` dipanggil dengan `drive_url` dari `ensure_result_folder`
  - `check_folder` raise `DriveError` → `fail(job_id, "Folder belum di-share ke bayucakrasentama@gmail.com")`, dan `run_pipeline` nggak dipanggil
  - index tanpa segmen `product` → `fail` dengan "Footage nggak ada shot produk (botol/kemasan)"
  - `free_gb` 5 dan sisa target 2.000 → `progress(status='dijeda', message='Drive kurang ±41 GB')` (2.000×0,018+10−5 = 41), tanpa `fail`
  - `progress` mengembalikan `'pause'` → `should_stop()` jadi True
  - `claim` None dan `peek` False → `run_pipeline(['zestmag','gurahfit'], ...)` dipanggil; `peek` True → `should_stop()` True
  - `TimAi.heartbeat` saat `URLError` → nggak raise
- [ ] **Step 2:** `.venv/bin/python -m unittest tests/test_agent.py` → FAIL.
- [ ] **Step 3:** Implement `py/agent.py`, plist, dan `run.sh`.
- [ ] **Step 4:** Tes → PASS. Semua tes: `.venv/bin/python -m unittest discover tests` → PASS.

### Task 9: Uji ujung ke ujung [TA + MF]

- [ ] **Step 1:** Di TIM-AI lokal (`npm start`, set `FACTORY_AGENT_TOKEN=dev-token`) dan `.env` [MF] (`TIM_AI_URL=http://localhost:4321`, `FACTORY_AGENT_TOKEN=dev-token`):
  - jalankan `./run.sh drive-login`, lalu `./run.sh agent`;
  - status Mac di TIM-AI jadi 🟢 dalam < 60 dtk.
- [ ] **Step 2:** Request **Zestmag, 3 video, CTA kerkun**, link footage folder Zestmag yang sudah ada:
  - produksi lama di-pause setelah batch aktif;
  - request jalan dan muncul folder `Madu Zestmag - 2026-…(#1)` di Drive dengan 3 MP4 + `_manifest.csv`;
  - link di TIM-AI bisa dibuka di jendela incognito;
  - setelah itu produksi lama lanjut (`state='legacy'`).
- [ ] **Step 3:** Request **produk baru (mis. Olymax), 5 video, CTA awareness** dengan folder footage uji yang di-share ke akun:
  - profil disusun AI lalu disetujui;
  - 5 video jadi, dan caption/VO nggak menyebut keranjang/checkout (cek `_manifest.csv`);
  - `violations()` kosong untuk semua script (`./run.sh status` nggak ada `failed_*` karena klaim).
- [ ] **Step 4:** Link footage yang **tidak** di-share → status `gagal` dengan pesan share, plus notifikasi terkirim (kalau kanal notifikasi brand aktif).
- [ ] **Step 5:** Matikan agen (Ctrl+C) di tengah request → jalankan lagi → request lanjut dan `done` nggak turun.
- [ ] **Step 6:** Deploy TIM-AI:
  - set `FACTORY_AGENT_TOKEN` (string acak 32+ karakter) di Vercel, push branch, buka PR;
  - ganti `TIM_AI_URL` [MF] ke URL produksi;
  - `./run.sh agent-install`.
