// Inbox CS: sinkronisasi chat dari channel, kirim balasan, waktu respons, auto-reply, dan pengingat pesanan.
import crypto from 'node:crypto';
import { now, getSetting, setSetting } from '../db.js';
import { chatConnectors } from './connectors.js';
import { preview, ORDER_EVENTS } from './common.js';

export const creds = (ch) => JSON.parse(ch.credentials || '{}');
export const newWebhookToken = () => crypto.randomBytes(18).toString('base64url');

async function saveCreds(db, channel, c) {
  if (!c) return;
  channel.credentials = JSON.stringify(c);
  await db.run('UPDATE chat_channels SET credentials = ? WHERE id = ?', channel.credentials, channel.id);
}

// Dipakai konektor: percakapan + kapan terakhir pelanggan menulis (aturan 24 jam Meta).
export async function convForConnector(db, conv) {
  const last = await db.get("SELECT MAX(sent_at) AS t FROM chat_messages WHERE conversation_id = ? AND direction = 'in'", conv.id);
  return { ...conv, meta: JSON.parse(conv.meta || '{}'), last_in_at: last?.t || null };
}

export async function upsertConversation(db, channel, c) {
  const existing = await db.get('SELECT * FROM conversations WHERE channel_id = ? AND external_id = ?', channel.id, String(c.external_id));
  const stamp = now();
  if (!existing) {
    const [row] = await db.run(`
      INSERT INTO conversations (brand_id, channel_id, external_id, customer_name, customer_id, customer_avatar, customer_platform,
        last_message_at, last_preview, unread, can_reply, meta, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
    `, channel.brand_id, channel.id, String(c.external_id), c.customer_name || '', c.customer_id || null, c.customer_avatar || null,
    c.customer_platform || null, c.last_message_at || null, c.last_preview || '', Number(c.unread || 0), c.can_reply === false ? 0 : 1,
    JSON.stringify(c.meta || {}), stamp);
    return { row, isNew: true, remoteChanged: true };
  }
  const remoteChanged = !!c.last_message_at && (!existing.last_message_at || c.last_message_at > existing.last_message_at);
  const meta = { ...JSON.parse(existing.meta || '{}'), ...(c.meta || {}) };
  const [row] = await db.run(`
    UPDATE conversations SET customer_name = ?, customer_id = ?, customer_avatar = ?, customer_platform = ?,
      unread = ?, can_reply = ?, meta = ? WHERE id = ? RETURNING *
  `, c.customer_name || existing.customer_name, c.customer_id || existing.customer_id, c.customer_avatar || existing.customer_avatar,
  c.customer_platform || existing.customer_platform, c.unread !== undefined ? Math.max(Number(c.unread), 0) : existing.unread,
  c.can_reply === false ? 0 : existing.can_reply, JSON.stringify(meta), existing.id);
  return { row, isNew: false, remoteChanged };
}

// Simpan satu pesan (abaikan kalau sudah ada). Mengembalikan baris baru atau null.
// Waktu respons = jeda dari pesan pelanggan pertama yang belum dibalas sampai balasan staf pertama.
export async function ingestMessage(db, conv, m, { staffId = null, auto = false, countUnread = false } = {}) {
  const dup = await db.get('SELECT id FROM chat_messages WHERE conversation_id = ? AND external_id = ?', conv.id, String(m.external_id));
  if (dup) return null;
  const fresh = await db.get('SELECT * FROM conversations WHERE id = ?', conv.id);
  let responseSeconds = null;
  let waiting = fresh.waiting_since;
  let lastFrom = fresh.last_from;
  if (m.direction === 'in') {
    if (!waiting) waiting = m.sent_at;
    lastFrom = 'customer';
  } else if (!auto && m.type !== 'system') {
    if (waiting && m.sent_at >= waiting) responseSeconds = Math.max(0, Math.round((new Date(m.sent_at) - new Date(waiting)) / 1000));
    waiting = null;
    lastFrom = 'staff';
  }
  const [row] = await db.run(`
    INSERT INTO chat_messages (conversation_id, external_id, direction, sender, staff_id, type, text, media_url, meta, status, error, response_seconds, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
  `, conv.id, String(m.external_id), m.direction, m.sender || '', staffId, m.type || 'text', m.text || '', m.media_url || null,
  JSON.stringify(m.meta || {}), m.status || 'sent', m.error || null, responseSeconds, m.sent_at);
  const newer = !fresh.last_message_at || m.sent_at >= fresh.last_message_at;
  await db.run(`
    UPDATE conversations SET waiting_since = ?, last_from = ?, last_message_at = ?, last_preview = ?, unread = ?,
      status = CASE WHEN ? = 'in' THEN 'open' ELSE status END WHERE id = ?
  `, waiting, lastFrom, newer ? m.sent_at : fresh.last_message_at, newer ? preview(m) : fresh.last_preview,
  fresh.unread + (countUnread && m.direction === 'in' ? 1 : 0), m.direction, conv.id);
  return row;
}

// ---- Kirim balasan ----
export async function sendReply(db, convId, { text = '', image = null, imageUrl = null, user = null, auto = false, sender = null, meta = {} }) {
  const conv = await db.get('SELECT * FROM conversations WHERE id = ?', convId);
  const channel = await db.get('SELECT * FROM chat_channels WHERE id = ?', conv.channel_id);
  const connector = chatConnectors[channel.platform];
  const base = { direction: 'out', sender: sender || (auto ? 'Auto-reply' : user?.username || ''), type: image ? 'image' : 'text', text, media_url: imageUrl, meta };
  try {
    if (!text.trim() && !image) throw new Error('Pesan kosong');
    if (!conv.can_reply) throw new Error('Platform tidak mengizinkan membalas percakapan ini');
    const r = await connector.sendMessage(creds(channel), await convForConnector(db, conv), { text, image, imageUrl });
    await saveCreds(db, channel, r.credentials);
    return await ingestMessage(db, conv, { ...base, external_id: r.external_id, sent_at: r.sent_at || now() }, { staffId: user?.id ?? null, auto });
  } catch (err) {
    const [row] = await db.run(`
      INSERT INTO chat_messages (conversation_id, external_id, direction, sender, staff_id, type, text, media_url, status, error, sent_at)
      VALUES (?, ?, 'out', ?, ?, ?, ?, ?, 'failed', ?, ?) RETURNING *
    `, conv.id, `failed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, base.sender, user?.id ?? null, base.type, text, imageUrl, String(err.message || err), now());
    return row;
  }
}

export async function markRead(db, conv) {
  await db.run('UPDATE conversations SET unread = 0 WHERE id = ?', conv.id);
  const channel = await db.get('SELECT * FROM chat_channels WHERE id = ?', conv.channel_id);
  const last = await db.get("SELECT external_id FROM chat_messages WHERE conversation_id = ? AND direction = 'in' ORDER BY sent_at DESC LIMIT 1", conv.id);
  try {
    const r = await chatConnectors[channel.platform].markRead(creds(channel), await convForConnector(db, conv), last?.external_id);
    await saveCreds(db, channel, r?.credentials);
  } catch {
    // tandai dibaca di platform cuma bonus
  }
}

// ---- Auto-reply ----
// welcome: pesan pertama pelanggan · keyword: kata kunci (dipisah koma) · away: di luar jam kerja (maks 1x per 12 jam per chat).
function outsideHours(hours, at = new Date()) {
  const h = { days: [1, 2, 3, 4, 5, 6], start: '08:00', end: '17:00', ...hours };
  const local = new Date(at.getTime() + 7 * 3600_000); // WIB
  const day = local.getUTCDay() || 7;
  const mins = local.getUTCHours() * 60 + local.getUTCMinutes();
  const toMin = (s) => { const [a, b] = String(s).split(':').map(Number); return a * 60 + (b || 0); };
  return !h.days.includes(day) || mins < toMin(h.start) || mins >= toMin(h.end);
}

export async function runAutoReply(db, conv, inbound) {
  const rules = (await db.all('SELECT * FROM auto_rules WHERE brand_id = ? AND active = 1 ORDER BY id', conv.brand_id))
    .filter((r) => { const ids = JSON.parse(r.channel_ids || '[]'); return !ids.length || ids.includes(conv.channel_id); });
  if (!rules.length) return null;
  const text = String(inbound.text || '').toLowerCase();
  const inCount = Number((await db.get("SELECT COUNT(*) AS n FROM chat_messages WHERE conversation_id = ? AND direction = 'in'", conv.id)).n);
  const pick = rules.find((r) => r.kind === 'keyword' && r.keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean).some((k) => text.includes(k)))
    || (inCount === 1 && rules.find((r) => r.kind === 'welcome'))
    || rules.find((r) => r.kind === 'away' && outsideHours(JSON.parse(r.hours || '{}'), new Date(inbound.sent_at)));
  if (!pick) return null;
  const meta = { rule_id: pick.id };
  if (pick.kind === 'away') {
    const recent = await db.get('SELECT id FROM chat_messages WHERE conversation_id = ? AND meta = ? AND sent_at > ?', conv.id, JSON.stringify(meta), new Date(Date.now() - 12 * 3600_000).toISOString());
    if (recent) return null;
  }
  return sendReply(db, conv.id, { text: fillTemplate(pick.reply, { nama: conv.customer_name }), auto: true, meta });
}

export const fillTemplate = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));

// Pesan pelanggan baru (dari sinkronisasi / webhook / simulasi): simpan + jalankan auto-reply kalau masih baru.
export async function receiveInbound(db, channel, convNorm, msgNorm) {
  const { row: conv } = await upsertConversation(db, channel, { ...convNorm, unread: undefined });
  const saved = await ingestMessage(db, conv, { ...msgNorm, direction: 'in' }, { countUnread: true });
  if (saved && Date.now() - new Date(saved.sent_at).getTime() < 15 * 60_000) await runAutoReply(db, conv, saved).catch(() => {});
  return { conv, message: saved };
}

// ---- Sinkronisasi dari API platform ----
export async function syncChannel(db, channel, { maxConversations = 20 } = {}) {
  const connector = chatConnectors[channel.platform];
  const firstSync = !channel.synced_at;
  let c = creds(channel);
  let fetched = 0;
  try {
    const list = await connector.listConversations(c);
    if (list.credentials) { c = list.credentials; await saveCreds(db, channel, c); }
    for (const conv of (list.conversations || []).slice(0, maxConversations)) {
      const { row, remoteChanged } = await upsertConversation(db, channel, conv);
      if (!remoteChanged) continue;
      const msgs = await connector.listMessages(c, await convForConnector(db, row));
      if (msgs.credentials) { c = msgs.credentials; await saveCreds(db, channel, c); }
      for (const m of msgs.messages || []) {
        const saved = await ingestMessage(db, row, m);
        if (saved) fetched++;
        // Auto-reply hanya untuk pesan yang baru masuk (bukan riwayat lama saat pertama disambungkan).
        if (saved && m.direction === 'in' && !firstSync && Date.now() - new Date(m.sent_at).getTime() < 15 * 60_000) await runAutoReply(db, row, saved).catch(() => {});
      }
      if (conv.unread !== undefined) await db.run('UPDATE conversations SET unread = ? WHERE id = ?', Number(conv.unread), row.id);
    }
    await db.run("UPDATE chat_channels SET synced_at = ?, error = NULL, status = 'aktif' WHERE id = ?", now(), channel.id);
  } catch (err) {
    await db.run("UPDATE chat_channels SET error = ?, synced_at = ?, status = 'error' WHERE id = ?", String(err.message || err), now(), channel.id);
    return { fetched, error: String(err.message || err) };
  }
  return { fetched };
}

// Cron: semua channel aktif, paling sering tiap 50 detik per channel.
export async function syncAll(db) {
  const before = new Date(Date.now() - 50_000).toISOString();
  const rows = await db.all("SELECT * FROM chat_channels WHERE platform NOT IN ('simulasi', 'whatsapp') AND (synced_at IS NULL OR synced_at < ?)", before);
  for (const ch of rows) await syncChannel(db, ch);
  await runReminders(db).catch(() => {});
  return rows.length;
}

// ---- Pengingat pesanan otomatis ----
export const DEFAULT_REMINDERS = {
  unpaid: 'Halo Kak {nama}, pesanan {order_id} ({produk}) belum dibayar ya. Yuk selesaikan pembayarannya supaya bisa segera kami kirim 🙏',
  paid: 'Terima kasih Kak {nama}! Pesanan {order_id} sudah kami terima dan sedang disiapkan.',
  shipped: 'Kak {nama}, pesanan {order_id} sudah dalam perjalanan 🚚. Ditunggu ya!',
  delivered: 'Pesanan {order_id} sudah sampai, Kak {nama}. Semoga suka! Kalau ada kendala, kabari kami di sini ya.',
  completed: 'Terima kasih sudah belanja, Kak {nama} 🙏 Boleh bantu kasih ulasan bintang 5? Sangat berarti buat kami.',
  cancelled: 'Kak {nama}, pesanan {order_id} dibatalkan. Kalau ada yang bisa kami bantu, balas chat ini ya.',
  failed: 'Kak {nama}, pengiriman pesanan {order_id} gagal. Mohon cek alamat/nomor HP, kami bantu kirim ulang.',
};

export async function processOrder(db, channel, o) {
  const existing = await db.get('SELECT * FROM chat_orders WHERE channel_id = ? AND external_id = ?', channel.id, String(o.external_id));
  const stamp = now();
  let row;
  if (!existing) {
    [row] = await db.run(`
      INSERT INTO chat_orders (channel_id, external_id, buyer_id, buyer_name, status, raw_status, total, items, ordered_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
    `, channel.id, String(o.external_id), o.buyer_id || null, o.buyer_name || null, o.status, o.raw_status || null, o.total || '', JSON.stringify(o.items || []), o.ordered_at || stamp, stamp);
  } else {
    [row] = await db.run('UPDATE chat_orders SET status = ?, raw_status = ?, total = ?, items = ?, updated_at = ? WHERE id = ? RETURNING *',
      o.status, o.raw_status || null, o.total || existing.total, JSON.stringify(o.items || JSON.parse(existing.items)), stamp, existing.id);
    if (existing.status === o.status) return null;
  }
  const reminded = JSON.parse(row.reminded || '[]');
  if (reminded.includes(o.status)) return null;
  const rule = await db.get('SELECT * FROM order_reminders WHERE brand_id = ? AND event = ? AND active = 1', channel.brand_id, o.status);
  if (!rule) return null;
  const conv = await db.get('SELECT * FROM conversations WHERE channel_id = ? AND customer_id = ? ORDER BY last_message_at DESC LIMIT 1', channel.id, String(o.buyer_id || ''));
  if (!conv) return null; // belum pernah chat: platform tidak mengizinkan membuka chat baru lewat semua API
  const items = JSON.parse(row.items || '[]');
  const msg = await sendReply(db, conv.id, {
    text: fillTemplate(rule.template, { nama: conv.customer_name || o.buyer_name || '', order_id: o.external_id, produk: items.map((i) => i.name).join(', '), total: row.total }),
    auto: true, sender: 'Pengingat otomatis',
  });
  await db.run('UPDATE chat_orders SET reminded = ? WHERE id = ?', JSON.stringify([...reminded, o.status]), row.id);
  return msg;
}

export async function runReminders(db) {
  const last = Number(await getSetting(db, 'reminders_checked_at')) || 0;
  if (Date.now() - last < 10 * 60_000) return 0;
  await setSetting(db, 'reminders_checked_at', String(Date.now()));
  const brands = (await db.all('SELECT DISTINCT brand_id FROM order_reminders WHERE active = 1')).map((r) => r.brand_id);
  let sent = 0;
  for (const brandId of brands) {
    const channels = await db.all("SELECT * FROM chat_channels WHERE brand_id = ? AND platform IN ('shopee', 'tiktokshop', 'lazada')", brandId);
    for (const ch of channels) {
      try {
        const r = await chatConnectors[ch.platform].listOrders(creds(ch), { since: last || Date.now() - 86400_000 });
        await saveCreds(db, ch, r.credentials);
        for (const o of r.orders || []) if (await processOrder(db, ch, o)) sent++;
      } catch {
        // gagal ambil pesanan: dicoba lagi di siklus berikutnya
      }
    }
  }
  return sent;
}

export { ORDER_EVENTS };
