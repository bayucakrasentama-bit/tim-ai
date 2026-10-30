// Lapisan database tipis: SQLite bawaan Node untuk jalan lokal,
// Postgres (Neon) kalau DATABASE_URL di-set (dipakai di Vercel).
// Semua query ditulis pakai placeholder "?" dan dipanggil secara async.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TABLES = (idType) => [
  `CREATE TABLE IF NOT EXISTS accounts (
    id ${idType},
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    credentials TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id ${idType},
    caption TEXT NOT NULL DEFAULT '',
    captions TEXT NOT NULL DEFAULT '{}',
    title TEXT NOT NULL DEFAULT '',
    media_type TEXT NOT NULL DEFAULT 'text',
    media_path TEXT,
    media_name TEXT,
    media_url TEXT,
    scheduled_at TEXT,
    started_at TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS post_targets (
    id ${idType},
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    remote_id TEXT,
    remote_url TEXT,
    error TEXT,
    published_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_sessions (
    state TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    result TEXT,
    error TEXT,
    created_at TEXT NOT NULL
  )`,
  // ---- Tim & brand ----
  `CREATE TABLE IF NOT EXISTS brands (
    id ${idType},
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#7c6cf0',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id ${idType},
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS brand_members (
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (brand_id, user_id)
  )`,
  // ---- Planner: ide -> draft -> siap -> terjadwal -> tayang ----
  `CREATE TABLE IF NOT EXISTS content_items (
    id ${idType},
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ide',
    pillar TEXT NOT NULL DEFAULT '',
    format TEXT NOT NULL DEFAULT '',
    platforms TEXT NOT NULL DEFAULT '[]',
    hook TEXT NOT NULL DEFAULT '',
    script TEXT NOT NULL DEFAULT '',
    caption TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    planned_at TEXT,
    assignee_id INTEGER,
    post_id INTEGER,
    position INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // ---- Analitik: satu baris per konten yang tayang (dari API, input manual, atau screenshot) ----
  `CREATE TABLE IF NOT EXISTS metrics (
    id ${idType},
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    content_id INTEGER,
    post_target_id INTEGER UNIQUE,
    platform TEXT NOT NULL,
    account_id INTEGER,
    title TEXT NOT NULL DEFAULT '',
    url TEXT,
    posted_at TEXT,
    views INTEGER, reach INTEGER, likes INTEGER, comments INTEGER, shares INTEGER, saves INTEGER,
    profile_visits INTEGER, link_clicks INTEGER, follows INTEGER, leads INTEGER, sales INTEGER, revenue INTEGER,
    source TEXT NOT NULL DEFAULT 'manual',
    sync_error TEXT,
    synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // Lampiran aset di kartu planner (hasil Studio / desain): dibawa ke Buat Post.
  `CREATE TABLE IF NOT EXISTS content_assets (
    id ${idType},
    content_id INTEGER NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    path TEXT,
    url TEXT,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  // ---- Scraper TikTok: link video (sendiri / pesaing / referensi) + angka terbarunya ----
  `CREATE TABLE IF NOT EXISTS tiktok_videos (
    id ${idType},
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    video_id TEXT,
    label TEXT NOT NULL DEFAULT 'referensi',
    source TEXT NOT NULL DEFAULT 'tikwm',
    username TEXT, caption TEXT, posted_at TEXT, duration INTEGER, music TEXT,
    views INTEGER, likes INTEGER, comments INTEGER, shares INTEGER, saves INTEGER,
    thumbnail_url TEXT, video_url TEXT,
    notes TEXT NOT NULL DEFAULT '',
    error TEXT,
    updated_at TEXT,
    created_at TEXT NOT NULL
  )`,
  // ---- Launch Lab: riset -> brand & angle -> copy -> visual -> landing page ----
  `CREATE TABLE IF NOT EXISTS launch_projects (
    id ${idType},
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    niche TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL DEFAULT 'riset',
    data TEXT NOT NULL DEFAULT '{}',
    slug TEXT UNIQUE,
    published INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // ---- Tim CS: tiket komplain/retur, template balasan, impor laporan Desty ----
  `CREATE TABLE IF NOT EXISTS cs_tickets (
    id ${idType},
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    customer TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'lainnya',
    shop TEXT NOT NULL DEFAULT '',
    order_id TEXT NOT NULL DEFAULT '',
    product TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'pertanyaan',
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'baru',
    summary TEXT NOT NULL DEFAULT '',
    resolution TEXT NOT NULL DEFAULT '',
    assignee_id INTEGER,
    due_at TEXT,
    resolved_at TEXT,
    content_id INTEGER,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cs_templates (
    id ${idType},
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'umum',
    body TEXT NOT NULL,
    uses INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cs_staff_daily (
    id ${idType},
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    staff TEXT NOT NULL,
    shops TEXT NOT NULL DEFAULT '',
    sessions INTEGER, sessions_replied INTEGER, customers INTEGER, customers_replied INTEGER,
    replied_1m INTEGER, replied_5m INTEGER, replied_10m INTEGER, replied_30m INTEGER, replied_60m INTEGER,
    avg_first_response REAL,
    imported_at TEXT NOT NULL,
    UNIQUE (brand_id, day, staff)
  )`,
  `CREATE TABLE IF NOT EXISTS cs_store_daily (
    id ${idType},
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    shop TEXT NOT NULL,
    marketplace TEXT NOT NULL DEFAULT '',
    customers INTEGER, customers_replied INTEGER, customers_replied_staff INTEGER,
    sessions INTEGER, sessions_replied INTEGER,
    rate_1h REAL, rate_24h REAL, unanswered_rate REAL,
    avg_first_response REAL,
    converted INTEGER,
    imported_at TEXT NOT NULL,
    UNIQUE (brand_id, day, shop)
  )`,
  // ---- Inbox CS omnichannel: channel toko/akun, percakapan, pesan, auto-reply, pengingat pesanan ----
  `CREATE TABLE IF NOT EXISTS chat_channels (
    id ${idType},
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    credentials TEXT NOT NULL DEFAULT '{}',
    webhook_token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aktif',
    error TEXT,
    synced_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id ${idType},
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    customer_name TEXT NOT NULL DEFAULT '',
    customer_id TEXT,
    customer_avatar TEXT,
    customer_platform TEXT,
    last_message_at TEXT,
    last_preview TEXT NOT NULL DEFAULT '',
    last_from TEXT,
    unread INTEGER NOT NULL DEFAULT 0,
    waiting_since TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    assignee_id INTEGER,
    tags TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    can_reply INTEGER NOT NULL DEFAULT 1,
    meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    UNIQUE (channel_id, external_id)
  )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id ${idType},
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    sender TEXT NOT NULL DEFAULT '',
    staff_id INTEGER,
    type TEXT NOT NULL DEFAULT 'text',
    text TEXT NOT NULL DEFAULT '',
    media_url TEXT,
    meta TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'sent',
    error TEXT,
    response_seconds INTEGER,
    sent_at TEXT NOT NULL,
    UNIQUE (conversation_id, external_id)
  )`,
  `CREATE TABLE IF NOT EXISTS auto_rules (
    id ${idType},
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    keywords TEXT NOT NULL DEFAULT '',
    reply TEXT NOT NULL,
    channel_ids TEXT NOT NULL DEFAULT '[]',
    hours TEXT NOT NULL DEFAULT '{}',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS order_reminders (
    id ${idType},
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    template TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    UNIQUE (brand_id, event)
  )`,
  `CREATE TABLE IF NOT EXISTS chat_orders (
    id ${idType},
    channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    buyer_id TEXT,
    buyer_name TEXT,
    status TEXT NOT NULL,
    raw_status TEXT,
    total TEXT,
    items TEXT NOT NULL DEFAULT '[]',
    reminded TEXT NOT NULL DEFAULT '[]',
    ordered_at TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE (channel_id, external_id)
  )`,
  // ---- Tim ADV & Tim MP: akun iklan dari banyak brand + angka harian per kampanye ----
`CREATE TABLE IF NOT EXISTS ad_accounts (
id ${idType},
brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
team TEXT NOT NULL,
platform TEXT NOT NULL,
name TEXT NOT NULL,
external_id TEXT NOT NULL DEFAULT '',
credentials TEXT NOT NULL DEFAULT '{}',
error TEXT,
synced_at TEXT,
created_by TEXT NOT NULL DEFAULT '',
created_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS ad_daily (
id ${idType},
account_id INTEGER NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
day TEXT NOT NULL,
campaign TEXT NOT NULL DEFAULT '',
spend DOUBLE PRECISION, impressions BIGINT, clicks BIGINT, conversions BIGINT, revenue DOUBLE PRECISION,
source TEXT NOT NULL DEFAULT 'manual',
updated_at TEXT NOT NULL,
UNIQUE (account_id, day, campaign)
)`,
// ---- Tim KOL & Tim Affiliate: roster mitra + hasil per konten/periode ----
`CREATE TABLE IF NOT EXISTS partners (
id ${idType},
brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
team TEXT NOT NULL,
name TEXT NOT NULL,
handle TEXT NOT NULL DEFAULT '',
platform TEXT NOT NULL DEFAULT 'tiktok',
tier TEXT NOT NULL DEFAULT '',
followers BIGINT,
rate DOUBLE PRECISION,
contact TEXT NOT NULL DEFAULT '',
status TEXT NOT NULL DEFAULT 'prospek',
notes TEXT NOT NULL DEFAULT '',
created_by TEXT NOT NULL DEFAULT '',
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS partner_posts (
id ${idType},
partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
day TEXT NOT NULL,
title TEXT NOT NULL DEFAULT '',
url TEXT NOT NULL DEFAULT '',
fee DOUBLE PRECISION, views BIGINT, likes BIGINT, comments BIGINT, shares BIGINT, saves BIGINT,
clicks BIGINT, orders BIGINT, revenue DOUBLE PRECISION, commission DOUBLE PRECISION,
source TEXT NOT NULL DEFAULT 'manual',
updated_at TEXT NOT NULL
)`,
// ---- Riset kreator (cache profil TikTok), campaign & jadwal KOL, sesi livestream affiliate ----
`CREATE TABLE IF NOT EXISTS creator_cache (
username TEXT PRIMARY KEY,
data TEXT NOT NULL,
fetched_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS kol_campaigns (
id ${idType},
brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
name TEXT NOT NULL,
objective TEXT NOT NULL DEFAULT '',
budget DOUBLE PRECISION,
start_day TEXT,
end_day TEXT,
target_views BIGINT,
target_orders BIGINT,
brief TEXT NOT NULL DEFAULT '',
status TEXT NOT NULL DEFAULT 'rencana',
created_by TEXT NOT NULL DEFAULT '',
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS kol_deliverables (
id ${idType},
campaign_id INTEGER NOT NULL REFERENCES kol_campaigns(id) ON DELETE CASCADE,
partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
type TEXT NOT NULL DEFAULT 'video',
fee DOUBLE PRECISION,
due_day TEXT,
status TEXT NOT NULL DEFAULT 'brief',
url TEXT NOT NULL DEFAULT '',
post_id INTEGER,
notes TEXT NOT NULL DEFAULT '',
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS live_sessions (
id ${idType},
partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
day TEXT NOT NULL,
duration_min INTEGER, views BIGINT, peak_viewers BIGINT, orders BIGINT,
revenue DOUBLE PRECISION, commission DOUBLE PRECISION,
products TEXT NOT NULL DEFAULT '',
notes TEXT NOT NULL DEFAULT '',
created_at TEXT NOT NULL
)`,
// ---- AI Router: job gambar/video yang diproses async di provider (fal.ai / Replicate) ----
`CREATE TABLE IF NOT EXISTS ai_jobs (
id ${idType},
brand_id INTEGER,
kind TEXT NOT NULL,
provider TEXT NOT NULL,
model TEXT NOT NULL,
prompt TEXT NOT NULL DEFAULT '',
status TEXT NOT NULL DEFAULT 'queued',
poll TEXT NOT NULL DEFAULT '{}',
result_url TEXT,
error TEXT,
created_by TEXT NOT NULL DEFAULT '',
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
)`,
// ---- Planner: komentar, log revisi & approval per kartu ----
`CREATE TABLE IF NOT EXISTS content_comments (
id ${idType},
content_id INTEGER NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
author TEXT NOT NULL DEFAULT '',
kind TEXT NOT NULL DEFAULT 'comment',
body TEXT NOT NULL DEFAULT '',
created_at TEXT NOT NULL
)`,
// ---- Tim ADV: kanban testing materi iklan (organik → testing → winning → fatigue) ----
`CREATE TABLE IF NOT EXISTS ad_creatives (
id ${idType},
brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
title TEXT NOT NULL,
stage TEXT NOT NULL DEFAULT 'antrean',
platform TEXT NOT NULL DEFAULT 'meta',
source_metric_id INTEGER,
source_url TEXT NOT NULL DEFAULT '',
media_url TEXT NOT NULL DEFAULT '',
spark_code TEXT NOT NULL DEFAULT '',
angle TEXT NOT NULL DEFAULT '',
audience TEXT NOT NULL DEFAULT '',
daily_budget DOUBLE PRECISION, spend DOUBLE PRECISION, revenue DOUBLE PRECISION, results BIGINT,
notes TEXT NOT NULL DEFAULT '',
position INTEGER NOT NULL DEFAULT 0,
created_by TEXT NOT NULL DEFAULT '',
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
)`,
// ---- Tim KOL & Affiliate: pengiriman sampel (resi & kurir) ----
`CREATE TABLE IF NOT EXISTS sample_shipments (
id ${idType},
partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
product TEXT NOT NULL DEFAULT '',
courier TEXT NOT NULL DEFAULT '',
resi TEXT NOT NULL DEFAULT '',
sent_at TEXT,
status TEXT NOT NULL DEFAULT 'disiapkan',
hpp DOUBLE PRECISION,
notes TEXT NOT NULL DEFAULT '',
created_by TEXT NOT NULL DEFAULT '',
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
)`,
// ---- Tim MP: event campaign marketplace & audit toko harian ----
`CREATE TABLE IF NOT EXISTS mp_events (
id ${idType},
brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
title TEXT NOT NULL,
start_day TEXT NOT NULL,
end_day TEXT NOT NULL,
type TEXT NOT NULL DEFAULT 'campaign',
notes TEXT NOT NULL DEFAULT '',
created_by TEXT NOT NULL DEFAULT '',
created_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS store_audits (
id ${idType},
brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
day TEXT NOT NULL,
shop TEXT NOT NULL DEFAULT '',
items TEXT NOT NULL DEFAULT '{}',
notes TEXT NOT NULL DEFAULT '',
created_by TEXT NOT NULL DEFAULT '',
updated_at TEXT NOT NULL,
UNIQUE (brand_id, day, shop)
)`,
// ---- LP Builder (Studio Visual): halaman blok yang bisa diedit, diunduh (HTML/JSON), dan diterbitkan di /p/<alamat> ----
`CREATE TABLE IF NOT EXISTS lp_pages (
id ${idType},
brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
name TEXT NOT NULL,
data TEXT NOT NULL DEFAULT '{}',
html TEXT,
slug TEXT UNIQUE,
published INTEGER NOT NULL DEFAULT 0,
created_by TEXT NOT NULL DEFAULT '',
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
)`,
// ---- Integrasi cepat: link/QR sekali pakai untuk menyambungkan akun lewat login resmi platform ----
`CREATE TABLE IF NOT EXISTS connect_links (
token TEXT PRIMARY KEY,
brand_id INTEGER NOT NULL,
platform TEXT NOT NULL,
created_by TEXT NOT NULL DEFAULT '',
result TEXT,
expires_at TEXT NOT NULL,
created_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`,
];

// Kolom yang ditambahkan setelah versi pertama (database lama di-upgrade otomatis).
const ADDED_COLUMNS = [
  ['posts', 'media_url'], ['posts', 'started_at'],
  ['accounts', 'brand_id', 'INTEGER'], ['posts', 'brand_id', 'INTEGER'],
  ['posts', 'content_id', 'INTEGER'], ['posts', 'created_by', 'TEXT'],
  ['users', 'team', 'TEXT'], ['users', 'email', 'TEXT'], ['posts', 'asset_id', 'INTEGER'],
  ['metrics', 'external_id', 'TEXT'],
['partners', 'stats'], ['partners', 'stats_at'],
['partner_posts', 'tracked', 'INTEGER'], ['partner_posts', 'refreshed_at'], ['partner_posts', 'thumbnail'], ['partner_posts', 'duration', 'INTEGER'],
['partner_posts', 'posted_at'], ['partner_posts', 'product'], ['partner_posts', 'error'],
['content_items', 'ref_link'], ['content_items', 'approved_by'], ['content_items', 'approved_at'], ['posts', 'notified', 'INTEGER'],
];

export async function openDb(target) {
  if (typeof target === 'string' && /^postgres(ql)?:\/\//.test(target)) {
    const { default: pg } = await import('pg');
    // sslmode=require di pg sekarang sama dengan verify-full; tulis eksplisit supaya tidak ada peringatan.
    const url = target.replace(/([?&]sslmode=)(require|prefer|verify-ca)\b/, '$1verify-full');
    const pool = new pg.Pool({ connectionString: url, max: 3 });
    return pgDb((text, params) => pool.query(text, params), () => pool.end());
  }
  return sqliteDb(target);
}

async function sqliteDb(file) {
  const { DatabaseSync } = await import('node:sqlite');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON;');
  for (const sql of TABLES('INTEGER PRIMARY KEY AUTOINCREMENT')) raw.exec(sql);
  for (const [table, col, type = 'TEXT'] of ADDED_COLUMNS) {
    const cols = raw.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(col)) raw.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
  return {
    kind: 'sqlite',
    all: async (sql, ...args) => raw.prepare(sql).all(...args),
    get: async (sql, ...args) => raw.prepare(sql).get(...args),
    run: async (sql, ...args) => (/\bRETURNING\b/i.test(sql) ? raw.prepare(sql).all(...args) : (raw.prepare(sql).run(...args), [])),
    close: async () => raw.close(),
  };
}

// `query` cukup fungsi (text, params) => { rows }, jadi bisa pg.Pool maupun PGlite (buat tes).
export async function pgDb(query, close = async () => {}) {
  const toPg = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };
  const q = async (sql, args) => (await query(toPg(sql), args)).rows;
  // Cold start cepat: migrasi (±70 query) hanya dijalankan kalau skema berubah. Versi = hash daftar tabel & kolom.
  const schemaHash = crypto.createHash('sha1').update(JSON.stringify([TABLES('SERIAL PRIMARY KEY'), ADDED_COLUMNS])).digest('hex');
  let current = null;
  try {
    current = (await query("SELECT value FROM settings WHERE key = 'schema_version'", [])).rows?.[0]?.value ?? null;
  } catch {
    current = null; // database baru: tabel settings belum ada
  }
  // Di Vercel beberapa instance bisa nyala bersamaan dan sama-sama membuat tabel;
  // Postgres lalu bisa menolak salah satunya (duplikat). Cukup dicoba ulang.
  if (current !== schemaHash) for (let attempt = 1; ; attempt++) {
    try {
      for (const sql of TABLES('SERIAL PRIMARY KEY')) await query(sql, []);
      for (const [table, col, type = 'TEXT'] of ADDED_COLUMNS) {
        await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`, []);
      }
      break;
    } catch (err) {
      if (attempt >= 5 || !['23505', '42P07', '42701'].includes(err.code)) throw err;
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }
  if (current !== schemaHash) {
    await query("INSERT INTO settings (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [schemaHash]);
  }
  return {
    kind: 'pg',
    all: (sql, ...args) => q(sql, args),
    get: async (sql, ...args) => (await q(sql, args))[0],
    run: (sql, ...args) => q(sql, args),
    close,
  };
}

export const now = () => new Date().toISOString();

// Database lama (sebelum ada brand): bikin "Brand Utama" lalu pindahkan akun & post ke sana.
export async function ensureDefaultBrand(db) {
  let brand = await db.get('SELECT * FROM brands ORDER BY id LIMIT 1');
  if (!brand) {
    // Di Vercel beberapa instance bisa nyala barengan; kunci di tabel settings memastikan cuma satu yang bikin brand.
    let won = true;
    try {
      await db.run("INSERT INTO settings (key, value) VALUES ('default_brand_lock', ?)", now());
    } catch {
      won = false;
    }
    if (won) [brand] = await db.run('INSERT INTO brands (name, created_at) VALUES (?, ?) RETURNING *', 'Brand Utama', now());
    for (let i = 0; !brand && i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      brand = await db.get('SELECT * FROM brands ORDER BY id LIMIT 1');
    }
    if (!brand) throw new Error('Gagal menyiapkan brand default');
  }
  await db.run('UPDATE accounts SET brand_id = ? WHERE brand_id IS NULL', brand.id);
  await db.run('UPDATE posts SET brand_id = ? WHERE brand_id IS NULL', brand.id);
  return brand;
}

export async function getSetting(db, key) {
  return (await db.get('SELECT value FROM settings WHERE key = ?', key))?.value ?? null;
}
export async function setSetting(db, key, value) {
  await db.run('DELETE FROM settings WHERE key = ?', key);
  await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', key, value);
}
