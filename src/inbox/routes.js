// API Inbox CS (ala Desty Chat): channel, percakapan, balasan, auto-reply, pengingat pesanan, webhook.
import crypto from 'node:crypto';
import multer from 'multer';
import { now, getSetting, setSetting } from '../db.js';
import { brandsFor } from '../team.js';
import { chatConnectors, chatPlatformInfo } from './connectors.js';
import { ORDER_EVENTS } from './common.js';
import {
  creds, newWebhookToken, syncChannel, sendReply, markRead, receiveInbound, processOrder, DEFAULT_REMINDERS, upsertConversation, ingestMessage,
} from './service.js';
import { askClaude, AiError, brandBlock } from '../ai.js';

const str = (v, max = 4000) => String(v ?? '').trim().slice(0, max);
const RULE_KINDS = ['welcome', 'keyword', 'away'];
const origin = (req) => `${req.protocol}://${req.get('host')}`;

const publicChannel = (ch) => {
  const c = creds(ch);
  const fields = chatConnectors[ch.platform]?.fields || [];
  const visible = Object.fromEntries(fields.filter((f) => !f.secret && c[f.key]).map((f) => [f.key, c[f.key]]));
  return {
    id: ch.id, platform: ch.platform, name: ch.name, status: ch.status, error: ch.error, synced_at: ch.synced_at, created_at: ch.created_at,
    details: visible, connected: ch.platform === 'simulasi' || !!(c.accessToken || c.refreshToken), shop_name: c.shopName || c.account || null,
    webhook_token: ch.webhook_token,
  };
};

const convRow = (c, channels, people) => ({
  ...c, tags: JSON.parse(c.tags || '[]'), meta: JSON.parse(c.meta || '{}'), can_reply: !!c.can_reply,
  channel: channels[c.channel_id] || null, assignee: people.get(c.assignee_id) || null,
});

export function inboxRoutes(app, db, scope, { storage, ownerUsername = 'admin' }) {
  const names = async () => new Map([[0, ownerUsername], ...(await db.all('SELECT id, username FROM users')).map((u) => [u.id, u.username])]);
  const channelMap = async (brandId) => Object.fromEntries((await db.all('SELECT * FROM chat_channels WHERE brand_id = ?', brandId)).map((ch) => [ch.id, { id: ch.id, platform: ch.platform, name: ch.name }]));
  const getConv = (req) => db.get('SELECT * FROM conversations WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
  const getChannel = (req) => db.get('SELECT * FROM chat_channels WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);

  app.get('/api/inbox/platforms', (req, res) => res.json({ platforms: chatPlatformInfo(), orderEvents: ORDER_EVENTS }));

  // ---- Channel (toko / akun) ----
  app.get('/api/inbox/channels', scope, async (req, res) => {
    res.json((await db.all('SELECT * FROM chat_channels WHERE brand_id = ? ORDER BY platform, name', req.brand.id)).map(publicChannel));
  });
  app.post('/api/inbox/channels', scope, async (req, res) => {
    const platform = req.body?.platform;
    const conn = chatConnectors[platform];
    if (!conn) return res.status(400).json({ error: 'Platform tidak dikenal' });
    const name = str(req.body?.name, 120) || conn.label;
    const c = {};
    for (const f of conn.fields) if (req.body?.credentials?.[f.key]) c[f.key] = str(req.body.credentials[f.key], 2000);
    const missing = conn.fields.filter((f) => !f.optional && !c[f.key]);
    if (missing.length && platform !== 'simulasi') return res.status(400).json({ error: `Belum diisi: ${missing.map((f) => f.label).join(', ')}` });
    const [row] = await db.run(
      'INSERT INTO chat_channels (brand_id, platform, name, credentials, webhook_token, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
      req.brand.id, platform, name, JSON.stringify(c), newWebhookToken(), conn.oauth ? 'belum terhubung' : 'aktif', now(),
    );
    res.status(201).json(publicChannel(row));
  });
  app.patch('/api/inbox/channels/:id', scope, async (req, res) => {
    const ch = await getChannel(req);
    if (!ch) return res.status(404).json({ error: 'Channel tidak ditemukan' });
    const c = creds(ch);
    for (const f of chatConnectors[ch.platform].fields) if (req.body?.credentials?.[f.key]) c[f.key] = str(req.body.credentials[f.key], 2000);
    const name = req.body?.name !== undefined ? str(req.body.name, 120) || ch.name : ch.name;
    const [row] = await db.run('UPDATE chat_channels SET name = ?, credentials = ? WHERE id = ? RETURNING *', name, JSON.stringify(c), ch.id);
    res.json(publicChannel(row));
  });
  app.delete('/api/inbox/channels/:id', scope, async (req, res) => {
    await db.run('DELETE FROM chat_channels WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    res.status(204).end();
  });
  app.post('/api/inbox/channels/:id/sync', scope, async (req, res) => {
    const ch = await getChannel(req);
    if (!ch) return res.status(404).json({ error: 'Channel tidak ditemukan' });
    res.json(await syncChannel(db, ch));
  });

  // OAuth toko: Shopee / TikTok Shop / Lazada.
  app.post('/api/inbox/channels/:id/connect', scope, async (req, res) => {
    const ch = await getChannel(req);
    if (!ch) return res.status(404).json({ error: 'Channel tidak ditemukan' });
    const conn = chatConnectors[ch.platform];
    if (!conn.oauth) return res.status(400).json({ error: 'Channel ini tidak pakai tombol Hubungkan (isi token langsung)' });
    const state = crypto.randomBytes(16).toString('hex');
    await setSetting(db, `inbox_oauth:${state}`, JSON.stringify({ channelId: ch.id, at: Date.now() }));
    try {
      res.json({ authUrl: conn.oauth.start(creds(ch), `${origin(req)}/api/inbox/oauth/${ch.platform}/callback?state=${state}`, state) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.get('/api/inbox/oauth/:platform/callback', async (req, res) => {
    const state = String(req.query.state || '');
    const saved = state ? JSON.parse((await getSetting(db, `inbox_oauth:${state}`)) || 'null') : null;
    const back = (msg, ok) => res.redirect(`/?inbox_oauth=${ok ? 'ok' : 'error'}&msg=${encodeURIComponent(msg)}`);
    if (!saved || Date.now() - saved.at > 30 * 60_000) return back('Sesi menghubungkan sudah kedaluwarsa, ulangi dari Pengaturan Inbox', false);
    const ch = await db.get('SELECT * FROM chat_channels WHERE id = ?', saved.channelId);
    if (!ch || !(await brandsFor(db, req.user)).some((b) => b.id === ch.brand_id)) return back('Channel tidak ditemukan', false);
    try {
      const next = await chatConnectors[ch.platform].oauth.finish(creds(ch), req.query);
      await db.run("UPDATE chat_channels SET credentials = ?, status = 'aktif', error = NULL WHERE id = ?", JSON.stringify(next), ch.id);
      await setSetting(db, `inbox_oauth:${state}`, '');
      syncChannel(db, { ...ch, credentials: JSON.stringify(next) }).catch(() => {});
      back(`${ch.name} tersambung`, true);
    } catch (err) {
      back(err.message, false);
    }
  });

  // ---- Percakapan ----
  app.get('/api/inbox/conversations', scope, async (req, res) => {
    const where = ['c.brand_id = ?'];
    const args = [req.brand.id];
    const f = req.query.filter;
    if (f === 'unread') where.push('c.unread > 0');
    if (f === 'unreplied') where.push('c.waiting_since IS NOT NULL');
    if (f === 'mine') { where.push('c.assignee_id = ?'); args.push(req.user.id); }
    if (f === 'closed') where.push("c.status = 'closed'");
    else if (f !== 'all') where.push("c.status = 'open'");
    if (req.query.channel) { where.push('c.channel_id = ?'); args.push(Number(req.query.channel)); }
    if (req.query.platform) { where.push('ch.platform = ?'); args.push(String(req.query.platform)); }
    if (req.query.q) { where.push('(LOWER(c.customer_name) LIKE ? OR LOWER(c.last_preview) LIKE ?)'); args.push(`%${String(req.query.q).toLowerCase()}%`, `%${String(req.query.q).toLowerCase()}%`); }
    const rows = await db.all(`
      SELECT c.* FROM conversations c JOIN chat_channels ch ON ch.id = c.channel_id
      WHERE ${where.join(' AND ')} ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 200
    `, ...args);
    const [channels, people] = [await channelMap(req.brand.id), await names()];
    res.json(rows.map((r) => convRow(r, channels, people)));
  });

  app.get('/api/inbox/summary', scope, async (req, res) => {
    const r = await db.get(`
      SELECT COUNT(*) AS open, SUM(CASE WHEN unread > 0 THEN 1 ELSE 0 END) AS unread, SUM(CASE WHEN waiting_since IS NOT NULL THEN 1 ELSE 0 END) AS unreplied,
        SUM(CASE WHEN assignee_id = ? THEN 1 ELSE 0 END) AS mine
      FROM conversations WHERE brand_id = ? AND status = 'open'
    `, req.user.id, req.brand.id);
    res.json(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v || 0)])));
  });

  app.get('/api/inbox/conversations/:id', scope, async (req, res) => {
    const c = await getConv(req);
    if (!c) return res.status(404).json({ error: 'Percakapan tidak ditemukan' });
    const messages = await db.all('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY sent_at, id', c.id);
    if (req.query.read === '1' && c.unread > 0) await markRead(db, c);
    const [channels, people] = [await channelMap(req.brand.id), await names()];
    res.json({
      ...convRow({ ...c, unread: req.query.read === '1' ? 0 : c.unread }, channels, people),
      messages: messages.map((m) => ({ ...m, meta: JSON.parse(m.meta || '{}'), staff: m.staff_id !== null ? people.get(m.staff_id) || null : null })),
    });
  });

  // Tarik ulang pesan terbaru dari platform untuk percakapan ini.
  app.post('/api/inbox/conversations/:id/refresh', scope, async (req, res) => {
    const c = await getConv(req);
    if (!c) return res.status(404).json({ error: 'Percakapan tidak ditemukan' });
    const ch = await db.get('SELECT * FROM chat_channels WHERE id = ?', c.channel_id);
    try {
      const conn = chatConnectors[ch.platform];
      const { messages = [], credentials } = await conn.listMessages(creds(ch), { ...c, meta: JSON.parse(c.meta || '{}') });
      if (credentials) await db.run('UPDATE chat_channels SET credentials = ? WHERE id = ?', JSON.stringify(credentials), ch.id);
      let added = 0;
      for (const m of messages) if (await ingestMessage(db, c, m)) added++;
      res.json({ added });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
  app.post('/api/inbox/conversations/:id/messages', scope, imageUpload.single('image'), async (req, res) => {
    const c = await getConv(req);
    if (!c) return res.status(404).json({ error: 'Percakapan tidak ditemukan' });
    const text = str(req.body?.text, 4000);
    let image = null;
    let imageUrl = null;
    if (req.file) {
      if (!/^image\/(jpeg|png|gif|webp)$/.test(req.file.mimetype)) return res.status(400).json({ error: 'Gambar harus JPG, PNG, GIF, atau WEBP' });
      image = { buffer: req.file.buffer, mime: req.file.mimetype, name: req.file.originalname };
      if (storage.kind === 'blob') {
        const { put } = await import('@vercel/blob');
        imageUrl = (await put(`inbox/${Date.now()}-${req.file.originalname}`, req.file.buffer, { access: 'public', addRandomSuffix: true, contentType: req.file.mimetype })).url;
      }
    }
    if (!text && !image) return res.status(400).json({ error: 'Tulis pesan atau pilih gambar' });
    const msg = await sendReply(db, c.id, { text, image, imageUrl, user: req.user });
    if (!c.assignee_id) await db.run('UPDATE conversations SET assignee_id = ? WHERE id = ?', req.user.id, c.id);
    res.status(msg.status === 'failed' ? 502 : 201).json({ ...msg, error: msg.error });
  });

  app.patch('/api/inbox/conversations/:id', scope, async (req, res) => {
    const c = await getConv(req);
    if (!c) return res.status(404).json({ error: 'Percakapan tidak ditemukan' });
    const b = req.body || {};
    const next = {
      assignee_id: b.assignee_id !== undefined ? (b.assignee_id === null || b.assignee_id === '' ? null : Number(b.assignee_id)) : c.assignee_id,
      status: ['open', 'closed'].includes(b.status) ? b.status : c.status,
      tags: Array.isArray(b.tags) ? JSON.stringify(b.tags.map((t) => str(t, 30)).filter(Boolean).slice(0, 10)) : c.tags,
      notes: b.notes !== undefined ? str(b.notes, 4000) : c.notes,
    };
    if (next.status === 'closed') await db.run('UPDATE conversations SET waiting_since = NULL, unread = 0 WHERE id = ?', c.id);
    const [row] = await db.run('UPDATE conversations SET assignee_id = ?, status = ?, tags = ?, notes = ? WHERE id = ? RETURNING *', next.assignee_id, next.status, next.tags, next.notes, c.id);
    res.json(convRow(row, await channelMap(req.brand.id), await names()));
  });

  // Panel kanan: pesanan pembeli (dari cache, bisa disegarkan dari API).
  app.get('/api/inbox/conversations/:id/orders', scope, async (req, res) => {
    const c = await getConv(req);
    if (!c) return res.status(404).json({ error: 'Percakapan tidak ditemukan' });
    const ch = await db.get('SELECT * FROM chat_channels WHERE id = ?', c.channel_id);
    let error = null;
    if (req.query.refresh === '1' && chatConnectors[ch.platform].listOrders) {
      try {
        const r = await chatConnectors[ch.platform].listOrders(creds(ch), { since: Date.now() - 30 * 86400_000, buyerId: c.customer_id });
        if (r.credentials) await db.run('UPDATE chat_channels SET credentials = ? WHERE id = ?', JSON.stringify(r.credentials), ch.id);
        for (const o of r.orders || []) await processOrder(db, ch, o);
      } catch (err) { error = err.message; }
    }
    const orders = await db.all('SELECT * FROM chat_orders WHERE channel_id = ? AND buyer_id = ? ORDER BY ordered_at DESC LIMIT 30', ch.id, String(c.customer_id || ''));
    res.json({ orders: orders.map((o) => ({ ...o, items: JSON.parse(o.items || '[]') })), error });
  });

  // Chat -> tiket komplain/retur (dicatat di Layanan Pelanggan).
  app.post('/api/inbox/conversations/:id/ticket', scope, async (req, res) => {
    const c = await getConv(req);
    if (!c) return res.status(404).json({ error: 'Percakapan tidak ditemukan' });
    const ch = await db.get('SELECT * FROM chat_channels WHERE id = ?', c.channel_id);
    const lastIn = await db.get("SELECT text FROM chat_messages WHERE conversation_id = ? AND direction = 'in' ORDER BY sent_at DESC LIMIT 1", c.id);
    const channel = { shopee: 'shopee', tiktokshop: c.customer_platform === 'tokopedia' ? 'tokopedia' : 'tiktok', lazada: 'lazada', whatsapp: 'whatsapp', instagram: 'instagram' }[ch.platform] || 'lainnya';
    const due = new Date(Date.now() + 24 * 3600_000).toISOString();
    const [t] = await db.run(`
      INSERT INTO cs_tickets (brand_id, customer, channel, shop, category, priority, status, summary, assignee_id, due_at, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'normal', 'baru', ?, ?, ?, ?, ?, ?) RETURNING *
    `, req.brand.id, c.customer_name || c.customer_id || 'pelanggan', channel, ch.name, str(req.body?.category, 40) || 'komplain_produk',
    str(req.body?.summary, 4000) || lastIn?.text || '', c.assignee_id ?? req.user.id, due, req.user.username, now(), now());
    res.status(201).json(t);
  });

  // Saran balasan AI (tombol "Saran Balasan").
  app.post('/api/inbox/conversations/:id/suggest', scope, async (req, res) => {
    const c = await getConv(req);
    if (!c) return res.status(404).json({ error: 'Percakapan tidak ditemukan' });
    const msgs = (await db.all('SELECT direction, sender, text, type FROM chat_messages WHERE conversation_id = ? ORDER BY sent_at DESC LIMIT 20', c.id)).reverse();
    const templates = await db.all('SELECT title, body FROM cs_templates WHERE brand_id = ? ORDER BY uses DESC LIMIT 15', req.brand.id);
    try {
      const answer = await askClaude({
        system: `Kamu CS toko online Indonesia yang ramah, sopan, singkat, dan solutif. Panggil pelanggan "Kak". Jangan menjanjikan hal yang tidak pasti (refund, ongkir gratis) tanpa dasar. Tulis HANYA isi balasan, tanpa pembuka/penjelasan.\n${brandBlock(req.brand)}\n${templates.length ? `<template_toko>\n${templates.map((t) => `- ${t.title}: ${t.body}`).join('\n')}\n</template_toko>` : ''}`,
        content: `Riwayat chat dengan pelanggan "${c.customer_name}":\n${msgs.map((m) => `${m.direction === 'in' ? 'Pelanggan' : 'Toko'}: ${m.text || `[${m.type}]`}`).join('\n')}\n\nTulis balasan berikutnya untuk toko.`,
        effort: 'low',
        maxTokens: 2000,
      });
      res.json({ suggestion: answer.trim() });
    } catch (err) {
      if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  // ---- Auto-reply ----
  app.get('/api/inbox/rules', scope, async (req, res) => {
    res.json((await db.all('SELECT * FROM auto_rules WHERE brand_id = ? ORDER BY id', req.brand.id)).map((r) => ({ ...r, active: !!r.active, channel_ids: JSON.parse(r.channel_ids), hours: JSON.parse(r.hours) })));
  });
  app.post('/api/inbox/rules', scope, async (req, res) => {
    const b = req.body || {};
    if (!RULE_KINDS.includes(b.kind)) return res.status(400).json({ error: 'Jenis auto-reply tidak dikenal' });
    if (!str(b.reply)) return res.status(400).json({ error: 'Isi balasan wajib diisi' });
    if (b.kind === 'keyword' && !str(b.keywords)) return res.status(400).json({ error: 'Isi kata kunci (pisahkan dengan koma)' });
    const [row] = await db.run(
      'INSERT INTO auto_rules (brand_id, kind, name, keywords, reply, channel_ids, hours, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?) RETURNING *',
      req.brand.id, b.kind, str(b.name, 120), str(b.keywords, 1000), str(b.reply), JSON.stringify((b.channel_ids || []).map(Number)), JSON.stringify(b.hours || {}), now(),
    );
    res.status(201).json(row);
  });
  app.patch('/api/inbox/rules/:id', scope, async (req, res) => {
    const r = await db.get('SELECT * FROM auto_rules WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    if (!r) return res.status(404).json({ error: 'Aturan tidak ditemukan' });
    const b = req.body || {};
    const [row] = await db.run('UPDATE auto_rules SET name = ?, keywords = ?, reply = ?, channel_ids = ?, hours = ?, active = ? WHERE id = ? RETURNING *',
      b.name !== undefined ? str(b.name, 120) : r.name, b.keywords !== undefined ? str(b.keywords, 1000) : r.keywords, b.reply !== undefined ? str(b.reply) || r.reply : r.reply,
      b.channel_ids ? JSON.stringify(b.channel_ids.map(Number)) : r.channel_ids, b.hours ? JSON.stringify(b.hours) : r.hours,
      b.active !== undefined ? (b.active ? 1 : 0) : r.active, r.id);
    res.json(row);
  });
  app.delete('/api/inbox/rules/:id', scope, async (req, res) => {
    await db.run('DELETE FROM auto_rules WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    res.status(204).end();
  });

  // ---- Pengingat pesanan otomatis ----
  app.get('/api/inbox/reminders', scope, async (req, res) => {
    const rows = await db.all('SELECT * FROM order_reminders WHERE brand_id = ?', req.brand.id);
    res.json(Object.keys(ORDER_EVENTS).map((event) => {
      const r = rows.find((x) => x.event === event);
      return { event, label: ORDER_EVENTS[event], template: r?.template || DEFAULT_REMINDERS[event], active: !!r?.active };
    }));
  });
  app.put('/api/inbox/reminders/:event', scope, async (req, res) => {
    const event = req.params.event;
    if (!ORDER_EVENTS[event]) return res.status(400).json({ error: 'Jenis pengingat tidak dikenal' });
    const template = str(req.body?.template) || DEFAULT_REMINDERS[event];
    await db.run('DELETE FROM order_reminders WHERE brand_id = ? AND event = ?', req.brand.id, event);
    await db.run('INSERT INTO order_reminders (brand_id, event, template, active, created_at) VALUES (?, ?, ?, ?, ?)', req.brand.id, event, template, req.body?.active ? 1 : 0, now());
    res.json({ event, template, active: !!req.body?.active });
  });

  // ---- Simulasi (latihan & tes tanpa marketplace) ----
  app.post('/api/inbox/simulate', scope, async (req, res) => {
    const ch = await db.get("SELECT * FROM chat_channels WHERE id = ? AND brand_id = ? AND platform = 'simulasi'", Number(req.body?.channel_id), req.brand.id);
    if (!ch) return res.status(400).json({ error: 'Pilih channel Simulasi' });
    const customer = str(req.body?.customer, 80) || 'pembeli_demo';
    const text = str(req.body?.text) || 'Halo kak, barangnya ready?';
    const r = await receiveInbound(db, ch, { external_id: `sim_${customer}`, customer_name: customer, customer_id: `sim_${customer}` }, {
      external_id: `sim_in_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, sender: customer, type: 'text', text, sent_at: req.body?.sent_at || now(),
    });
    res.status(201).json({ conversation_id: r.conv.id, message: r.message });
  });
  app.post('/api/inbox/simulate-order', scope, async (req, res) => {
    const ch = await db.get("SELECT * FROM chat_channels WHERE id = ? AND brand_id = ? AND platform = 'simulasi'", Number(req.body?.channel_id), req.brand.id);
    if (!ch) return res.status(400).json({ error: 'Pilih channel Simulasi' });
    const customer = str(req.body?.customer, 80) || 'pembeli_demo';
    const status = ORDER_EVENTS[req.body?.status] ? req.body.status : 'paid';
    const sent = await processOrder(db, ch, {
      external_id: str(req.body?.order_id, 40) || 'SIM-0001', buyer_id: `sim_${customer}`, buyer_name: customer, status, raw_status: status,
      total: 'Rp89.000', items: [{ name: str(req.body?.product, 120) || 'Madu Zestmag 250ml', qty: 1 }], ordered_at: now(),
    });
    res.json({ reminded: !!sent, message: sent });
  });
}

// ---- Webhook publik dari platform (tanpa login, diverifikasi tanda tangan) ----
export function inboxWebhookRoute(app, db, { background }) {
  app.all('/api/chat/webhook/:token', async (req, res) => {
    const ch = await db.get('SELECT * FROM chat_channels WHERE webhook_token = ?', String(req.params.token));
    if (!ch) return res.status(404).json({ error: 'not found' });
    const conn = chatConnectors[ch.platform];
    const c = creds(ch);
    if (req.method === 'GET') {
      const challenge = conn.webhook?.challenge?.(req, c);
      return challenge ? res.type('text').send(challenge) : res.status(403).send('forbidden');
    }
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    if (!conn.webhook?.verify || !conn.webhook.verify(req, c, url)) return res.status(401).json({ error: 'signature tidak valid' });
    res.json({ ok: true }); // balas cepat, proses di belakang
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    background((async () => {
      if (conn.webhook.parse) {
        for (const e of conn.webhook.parse(body)) await receiveInbound(db, ch, e.conversation, e.message);
      } else {
        await syncChannel(db, ch); // Shopee / TikTok Shop / Lazada: ambil data terbaru lewat API resmi
      }
    })());
  });
}

export { upsertConversation };
