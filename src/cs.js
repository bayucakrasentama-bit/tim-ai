// Tim CS: tiket komplain/retur dengan batas waktu (SLA), template balasan, impor laporan Desty Chat,
// dan laporan CS. Chat pelanggannya sendiri tetap dibalas di Desty Chat (tidak ada API).
import multer from 'multer';
import { now } from './db.js';
import { readXlsx } from './xlsx.js';
import { createContent } from './planner.js';

export const CHANNELS = ['shopee', 'tokopedia', 'tiktok', 'lazada', 'whatsapp', 'instagram', 'lainnya'];
export const CATEGORIES = ['pertanyaan', 'keberatan', 'komplain_produk', 'pengiriman', 'retur_refund', 'pembayaran', 'follow_up', 'lainnya'];
export const STATUSES = ['baru', 'diproses', 'menunggu', 'selesai'];
// Batas waktu penyelesaian per prioritas (jam).
export const SLA_HOURS = { urgent: 2, tinggi: 4, normal: 24, rendah: 48 };

const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);

// ---- Impor Desty ----
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(String(v).replace('%', '').replace(',', '.'));
  return Number.isFinite(x) ? x : null;
};
const pct = (v) => (num(v) === null ? null : num(v) / 100);
const deskDay = (v) => {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(v || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

export function parseDesty(rows) {
  const head = Object.keys(rows[0] || {});
  if (head.includes('Nama Staf')) {
    return {
      type: 'staff',
      rows: rows.map((r) => ({
        day: deskDay(r['Waktu Dimulai']), staff: str(r['Nama Staf'], 200), shops: str(r.ShopName, 1000),
        sessions: num(r['Jumlah Sesi Ditugaskan']), sessions_replied: num(r['Jumlah Sesi Dibalas']),
        customers: num(r['Jumlah Pelanggan Ditugaskan']), customers_replied: num(r['Jumlah Pelanggan Dibalas']),
        replied_1m: num(r['Sesi Dibalas ≤ 1 Menit']), replied_5m: num(r['Sesi Dibalas ≤ 5 Menit']),
        replied_10m: num(r['Sesi Dibalas ≤ 10 Menit']), replied_30m: num(r['Sesi Dibalas ≤ 30 Menit']),
        replied_60m: num(r['Sesi Dibalas ≤ 60 Menit']),
        avg_first_response: num(r.avgFirstResponseTime ?? r['Rata-Rata Waktu Pertama Respon (menit)']),
      })).filter((r) => r.day && r.staff),
    };
  }
  if (head.includes('Nama Toko')) {
    return {
      type: 'store',
      rows: rows.map((r) => ({
        day: deskDay(r['Waktu Dimulai']), shop: str(r['Nama Toko'], 200), marketplace: str(r.Marketplace, 40).toLowerCase(),
        customers: num(r['Jumlah Pelanggan']), customers_replied: num(r['Jumlah Pelanggan Dibalas']),
        customers_replied_staff: num(r['Jumlah Pelanggan Dibalas Staf']),
        sessions: num(r['Jumlah Sesi']), sessions_replied: num(r['Jumlah Sesi Dibalas']),
        rate_1h: pct(r['Tingkat Respon ≤ 1 Jam']), rate_24h: pct(r['Tingkat Respon ≤ 24 Jam']),
        unanswered_rate: pct(r['Tingkat Pesan Tidak Direspon']),
        avg_first_response: num(r.avgFirstResponseTime ?? r['Rata-Rata Waktu Pertama Respon (menit)']),
        converted: num(r['Jumlah Pelanggan Dikonversi']),
      })).filter((r) => r.day && r.shop),
    };
  }
  throw new Error('Format file tidak dikenal. Pakai file "Unduh" dari Desty: Performa Staf atau Performa Toko.');
}

async function upsertDesty(db, brandId, parsed) {
  const table = parsed.type === 'staff' ? 'cs_staff_daily' : 'cs_store_daily';
  const keyCol = parsed.type === 'staff' ? 'staff' : 'shop';
  for (const r of parsed.rows) {
    await db.run(`DELETE FROM ${table} WHERE brand_id = ? AND day = ? AND ${keyCol} = ?`, brandId, r.day, r[keyCol]);
    const cols = Object.keys(r);
    await db.run(
      `INSERT INTO ${table} (brand_id, ${cols.join(', ')}, imported_at) VALUES (?, ${cols.map(() => '?').join(', ')}, ?)`,
      brandId, ...cols.map((c) => r[c]), now(),
    );
  }
  return parsed.rows.length;
}

// ---- Laporan CS ----
const sum = (rows, f) => rows.reduce((a, r) => a + (Number(r[f]) || 0), 0);
const ratio = (a, b) => (b ? a / b : null);
// Rata-rata waktu respons pertama tertimbang jumlah sesi yang dibalas.
const weightedFrt = (rows) => {
  const w = rows.filter((r) => r.avg_first_response !== null && r.sessions_replied);
  return w.length ? sum(w.map((r) => ({ v: r.avg_first_response * r.sessions_replied })), 'v') / sum(w, 'sessions_replied') : null;
};

// Statistik langsung dari Inbox TIM-AI (chat marketplace/WA/IG yang dibalas dari TIM-AI).
export async function inboxStats(db, brandId, { from, to } = {}, ownerUsername = 'admin') {
  const inRange = (iso) => iso && (!from || iso >= from) && (!to || iso < to);
  const msgs = (await db.all(`
    SELECT m.direction, m.staff_id, m.sender, m.response_seconds, m.sent_at, m.status, c.id AS conv, c.channel_id, ch.name AS channel, ch.platform
    FROM chat_messages m JOIN conversations c ON c.id = m.conversation_id JOIN chat_channels ch ON ch.id = c.channel_id
    WHERE c.brand_id = ?
  `, brandId)).filter((m) => inRange(m.sent_at));
  const names = new Map([[0, ownerUsername], ...(await db.all('SELECT id, username FROM users')).map((u) => [u.id, u.username])]);
  const inConv = new Set(msgs.filter((m) => m.direction === 'in').map((m) => m.conv));
  const staffReplies = msgs.filter((m) => m.direction === 'out' && m.staff_id !== null && m.status === 'sent');
  const repliedConv = new Set(staffReplies.map((m) => m.conv));
  const timed = staffReplies.filter((m) => m.response_seconds !== null);
  const avg = (rows) => (rows.length ? rows.reduce((a, m) => a + m.response_seconds, 0) / rows.length / 60 : null);
  const within = (rows, sec) => (rows.length ? rows.filter((m) => m.response_seconds <= sec).length / rows.length : null);
  const group = (rows, keyOf) => {
    const map = new Map();
    for (const m of rows) map.set(keyOf(m), [...(map.get(keyOf(m)) || []), m]);
    return map;
  };
  const staff = [...group(staffReplies, (m) => m.staff_id)].map(([id, rows]) => {
    const t = rows.filter((m) => m.response_seconds !== null);
    return { key: names.get(id) || `#${id}`, replies: rows.length, conversations: new Set(rows.map((m) => m.conv)).size, avg_first_response: avg(t), within_5m: within(t, 300) };
  }).sort((a, b) => b.replies - a.replies);
  const channels = [...group(msgs, (m) => m.channel_id)].map(([, rows]) => {
    const ins = new Set(rows.filter((m) => m.direction === 'in').map((m) => m.conv));
    const outs = rows.filter((m) => m.direction === 'out' && m.staff_id !== null && m.status === 'sent');
    const t = outs.filter((m) => m.response_seconds !== null);
    const rep = new Set(outs.map((m) => m.conv));
    return { key: rows[0].channel, platform: rows[0].platform, customers: ins.size, replied: [...ins].filter((c) => rep.has(c)).length, avg_first_response: avg(t), within_5m: within(t, 300) };
  }).sort((a, b) => b.customers - a.customers);
  const waiting = await db.all('SELECT waiting_since FROM conversations WHERE brand_id = ? AND waiting_since IS NOT NULL AND status = ?', brandId, 'open');
  return {
    active: msgs.length > 0,
    customers: inConv.size,
    replied: [...inConv].filter((c) => repliedConv.has(c)).length,
    response_rate: inConv.size ? [...inConv].filter((c) => repliedConv.has(c)).length / inConv.size : null,
    avg_first_response: avg(timed),
    within_5m: within(timed, 300),
    messages_in: msgs.filter((m) => m.direction === 'in').length,
    messages_out: staffReplies.length,
    auto_replies: msgs.filter((m) => m.direction === 'out' && m.staff_id === null && m.status === 'sent').length,
    failed: msgs.filter((m) => m.status === 'failed').length,
    waiting_now: waiting.length,
    waiting_over_1h: waiting.filter((w) => Date.now() - new Date(w.waiting_since) > 3600_000).length,
    staff,
    channels,
  };
}

export async function csReport(db, brandId, { from, to } = {}, ownerUsername = 'admin') {
  const dFrom = from ? from.slice(0, 10) : '0000';
  const dTo = to ? to.slice(0, 10) : '9999';
  const staffRows = await db.all('SELECT * FROM cs_staff_daily WHERE brand_id = ? AND day >= ? AND day < ? ORDER BY day', brandId, dFrom, dTo);
  const storeRows = await db.all('SELECT * FROM cs_store_daily WHERE brand_id = ? AND day >= ? AND day < ? ORDER BY day', brandId, dFrom, dTo);

  const group = (rows, key, fn) => {
    const m = new Map();
    for (const r of rows) m.set(r[key], [...(m.get(r[key]) || []), r]);
    return [...m.entries()].map(([k, rs]) => ({ key: k, ...fn(rs) }));
  };
  const staff = group(staffRows, 'staff', (rs) => ({
    days: new Set(rs.map((r) => r.day)).size,
    customers: sum(rs, 'customers'), customers_replied: sum(rs, 'customers_replied'),
    sessions: sum(rs, 'sessions'), sessions_replied: sum(rs, 'sessions_replied'),
    response_rate: ratio(sum(rs, 'sessions_replied'), sum(rs, 'sessions')),
    within_5m: ratio(sum(rs, 'replied_5m'), sum(rs, 'sessions')),
    avg_first_response: weightedFrt(rs),
  })).sort((a, b) => (b.response_rate ?? -1) - (a.response_rate ?? -1));
  const shops = group(storeRows, 'shop', (rs) => ({
    marketplace: rs[0].marketplace,
    customers: sum(rs, 'customers'), customers_replied: sum(rs, 'customers_replied'), converted: sum(rs, 'converted'),
    response_rate: ratio(sum(rs, 'customers_replied'), sum(rs, 'customers')),
    conversion_rate: ratio(sum(rs, 'converted'), sum(rs, 'customers')),
    avg_first_response: weightedFrt(rs),
  })).sort((a, b) => b.customers - a.customers);
  const daily = group(storeRows, 'day', (rs) => ({
    customers: sum(rs, 'customers'), replied: sum(rs, 'customers_replied'), converted: sum(rs, 'converted'),
    response_rate: ratio(sum(rs, 'customers_replied'), sum(rs, 'customers')),
  }));

  const inRange = (iso) => iso && (!from || iso >= from) && (!to || iso < to);
  const tickets = (await db.all('SELECT * FROM cs_tickets WHERE brand_id = ?', brandId)).filter((t) => inRange(t.created_at));
  const nowIso = new Date().toISOString();
  const closed = tickets.filter((t) => t.status === 'selesai');
  const met = closed.filter((t) => t.due_at && t.resolved_at && t.resolved_at <= t.due_at).length;
  const names = new Map([[0, ownerUsername], ...(await db.all('SELECT id, username FROM users')).map((u) => [u.id, u.username])]);
  const countBy = (rows, f) => rows.reduce((m, r) => ({ ...m, [r[f]]: (m[r[f]] || 0) + 1 }), {});
  const byAgent = group(tickets.map((t) => ({ ...t, agent: t.assignee_id === null ? '(belum ada PIC)' : names.get(t.assignee_id) || `#${t.assignee_id}` })), 'agent', (rs) => ({
    total: rs.length, selesai: rs.filter((t) => t.status === 'selesai').length,
    sla_met: rs.filter((t) => t.status === 'selesai' && t.resolved_at <= t.due_at).length,
    overdue: rs.filter((t) => t.status !== 'selesai' && t.due_at < nowIso).length,
  }));

  return {
    inbox: await inboxStats(db, brandId, { from, to }, ownerUsername),
    chat: {
      imported: staffRows.length + storeRows.length > 0,
      customers: sum(storeRows, 'customers') || sum(staffRows, 'customers'),
      customers_replied: sum(storeRows, 'customers_replied') || sum(staffRows, 'customers_replied'),
      converted: sum(storeRows, 'converted'),
      response_rate: ratio(sum(storeRows, 'customers_replied'), sum(storeRows, 'customers')) ?? ratio(sum(staffRows, 'sessions_replied'), sum(staffRows, 'sessions')),
      within_5m: ratio(sum(staffRows, 'replied_5m'), sum(staffRows, 'sessions')),
      avg_first_response: weightedFrt(storeRows.length ? storeRows : staffRows),
      conversion_rate: ratio(sum(storeRows, 'converted'), sum(storeRows, 'customers')),
      last_day: [...staffRows, ...storeRows].map((r) => r.day).sort().at(-1) || null,
    },
    staff,
    shops,
    daily,
    tickets: {
      total: tickets.length,
      byStatus: countBy(tickets, 'status'),
      byCategory: countBy(tickets, 'category'),
      byChannel: countBy(tickets, 'channel'),
      overdue: tickets.filter((t) => t.status !== 'selesai' && t.due_at && t.due_at < nowIso).length,
      sla_rate: ratio(met, closed.length),
      avg_resolution_hours: closed.length
        ? closed.reduce((a, t) => a + (new Date(t.resolved_at) - new Date(t.created_at)) / 3600_000, 0) / closed.length : null,
      byAgent,
    },
  };
}

export function csRoutes(app, db, scope, { ownerUsername = 'admin' } = {}) {
  const getTicket = (req) => db.get('SELECT * FROM cs_tickets WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);

  // ---- Tiket ----
  app.get('/api/cs/tickets', scope, async (req, res) => {
    const where = ['brand_id = ?'];
    const args = [req.brand.id];
    if (STATUSES.includes(req.query.status)) { where.push('status = ?'); args.push(req.query.status); }
    if (req.query.open === '1') where.push("status != 'selesai'");
    res.json(await db.all(`SELECT * FROM cs_tickets WHERE ${where.join(' AND ')} ORDER BY CASE WHEN status = 'selesai' THEN 1 ELSE 0 END, due_at, id DESC`, ...args));
  });

  app.post('/api/cs/tickets', scope, async (req, res) => {
    const b = req.body || {};
    const customer = str(b.customer, 200);
    if (!customer) return res.status(400).json({ error: 'Nama/username pelanggan wajib diisi' });
    const priority = pick(b.priority, Object.keys(SLA_HOURS), 'normal');
    const stamp = now();
    const due = new Date(Date.now() + SLA_HOURS[priority] * 3600_000).toISOString();
    const [row] = await db.run(`
      INSERT INTO cs_tickets (brand_id, customer, channel, shop, order_id, product, category, priority, status, summary,
        assignee_id, due_at, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'baru', ?, ?, ?, ?, ?, ?) RETURNING *
    `, req.brand.id, customer, pick(b.channel, CHANNELS, 'lainnya'), str(b.shop, 200), str(b.order_id, 100), str(b.product, 200),
    pick(b.category, CATEGORIES, 'pertanyaan'), priority, str(b.summary),
    b.assignee_id === undefined || b.assignee_id === '' || b.assignee_id === null ? req.user.id : Number(b.assignee_id),
    due, req.user.username, stamp, stamp);
    res.status(201).json(row);
  });

  app.patch('/api/cs/tickets/:id', scope, async (req, res) => {
    const t = await getTicket(req);
    if (!t) return res.status(404).json({ error: 'Tiket tidak ditemukan' });
    const b = req.body || {};
    const next = { ...t };
    for (const f of ['customer', 'shop', 'order_id', 'product', 'summary', 'resolution']) if (b[f] !== undefined) next[f] = str(b[f], f === 'summary' || f === 'resolution' ? 4000 : 200);
    if (b.channel !== undefined) next.channel = pick(b.channel, CHANNELS, t.channel);
    if (b.category !== undefined) next.category = pick(b.category, CATEGORIES, t.category);
    if (b.priority !== undefined && b.priority !== t.priority) {
      next.priority = pick(b.priority, Object.keys(SLA_HOURS), t.priority);
      next.due_at = new Date(new Date(t.created_at).getTime() + SLA_HOURS[next.priority] * 3600_000).toISOString();
    }
    if (b.assignee_id !== undefined) next.assignee_id = b.assignee_id === null || b.assignee_id === '' ? null : Number(b.assignee_id);
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'Status tidak dikenal' });
      next.status = b.status;
      next.resolved_at = b.status === 'selesai' ? t.resolved_at || now() : null;
    }
    const [row] = await db.run(`
      UPDATE cs_tickets SET customer = ?, channel = ?, shop = ?, order_id = ?, product = ?, category = ?, priority = ?, status = ?,
        summary = ?, resolution = ?, assignee_id = ?, due_at = ?, resolved_at = ?, updated_at = ? WHERE id = ? RETURNING *
    `, next.customer, next.channel, next.shop, next.order_id, next.product, next.category, next.priority, next.status,
    next.summary, next.resolution, next.assignee_id, next.due_at, next.resolved_at, now(), t.id);
    res.json(row);
  });

  app.delete('/api/cs/tickets/:id', scope, async (req, res) => {
    await db.run('DELETE FROM cs_tickets WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    res.status(204).end();
  });

  // Keluhan/pertanyaan pelanggan -> ide konten untuk tim konten (masuk kolom Ide di Planner).
  app.post('/api/cs/tickets/:id/to-content', scope, async (req, res) => {
    const t = await getTicket(req);
    if (!t) return res.status(404).json({ error: 'Tiket tidak ditemukan' });
    const item = await createContent(db, req.brand.id, {
      title: str(req.body?.title, 200) || `Jawab pertanyaan pelanggan: ${t.summary.slice(0, 80) || t.category.replace('_', ' ')}`,
      pillar: 'Edukasi / FAQ',
      notes: `Dari tiket CS #${t.id} (${t.channel}${t.product ? ` · ${t.product}` : ''}):\n${t.summary}`,
    }, req.user);
    await db.run('UPDATE cs_tickets SET content_id = ?, updated_at = ? WHERE id = ?', item.id, now(), t.id);
    res.status(201).json(item);
  });

  // ---- Template balasan ----
  app.get('/api/cs/templates', scope, async (req, res) => {
    res.json(await db.all('SELECT * FROM cs_templates WHERE brand_id = ? ORDER BY category, uses DESC, title', req.brand.id));
  });
  app.post('/api/cs/templates', scope, async (req, res) => {
    const title = str(req.body?.title, 200);
    const body = str(req.body?.body, 4000);
    if (!title || !body) return res.status(400).json({ error: 'Judul dan isi template wajib diisi' });
    const [row] = await db.run(
      'INSERT INTO cs_templates (brand_id, title, category, body, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
      req.brand.id, title, pick(req.body?.category, CATEGORIES, 'pertanyaan'), body, req.user.username, now(), now(),
    );
    res.status(201).json(row);
  });
  app.patch('/api/cs/templates/:id', scope, async (req, res) => {
    const t = await db.get('SELECT * FROM cs_templates WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    if (!t) return res.status(404).json({ error: 'Template tidak ditemukan' });
    const title = req.body?.title !== undefined ? str(req.body.title, 200) || t.title : t.title;
    const body = req.body?.body !== undefined ? str(req.body.body, 4000) || t.body : t.body;
    const category = req.body?.category !== undefined ? pick(req.body.category, CATEGORIES, t.category) : t.category;
    const uses = req.body?.used ? t.uses + 1 : t.uses;
    const [row] = await db.run('UPDATE cs_templates SET title = ?, body = ?, category = ?, uses = ?, updated_at = ? WHERE id = ? RETURNING *', title, body, category, uses, now(), t.id);
    res.json(row);
  });
  app.delete('/api/cs/templates/:id', scope, async (req, res) => {
    await db.run('DELETE FROM cs_templates WHERE id = ? AND brand_id = ?', Number(req.params.id), req.brand.id);
    res.status(204).end();
  });

  // ---- Impor laporan Desty (file .xlsx dari tombol "Unduh") ----
  const xlsxUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
  app.post('/api/cs/import', scope, xlsxUpload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Pilih file .xlsx dari Desty dulu' });
    let parsed;
    try {
      parsed = parseDesty(readXlsx(req.file.buffer));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const count = await upsertDesty(db, req.brand.id, parsed);
    res.json({ type: parsed.type, rows: count, days: [...new Set(parsed.rows.map((r) => r.day))].sort() });
  });

  app.get('/api/reports/cs', scope, async (req, res) => {
    res.json(await csReport(db, req.brand.id, { from: req.query.from ? String(req.query.from) : null, to: req.query.to ? String(req.query.to) : null }, ownerUsername));
  });
}
