// ERP Toko — modul lengkap: Lead, Order, Customer, Produk, Stok & Gudang, Invoice,
// Pengeluaran, Laporan, Komplain, Review, Audit log. Pola mengikuti cs.js (scope + brand).
import { now } from './db.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS erp_customers (id BIGSERIAL PRIMARY KEY, brand_id BIGINT NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT, channel TEXT, city TEXT, notes TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS erp_leads (id BIGSERIAL PRIMARY KEY, brand_id BIGINT NOT NULL, name TEXT NOT NULL, phone TEXT, source TEXT, status TEXT DEFAULT 'baru', value NUMERIC DEFAULT 0, notes TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS erp_products (id BIGSERIAL PRIMARY KEY, brand_id BIGINT NOT NULL, sku TEXT, name TEXT NOT NULL, category TEXT, cost NUMERIC DEFAULT 0, price NUMERIC DEFAULT 0, stock_min NUMERIC DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS erp_warehouses (id BIGSERIAL PRIMARY KEY, brand_id BIGINT NOT NULL, name TEXT NOT NULL, city TEXT, notes TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS erp_stock_moves (id BIGSERIAL PRIMARY KEY, brand_id BIGINT NOT NULL, product_id BIGINT, warehouse_id BIGINT, type TEXT NOT NULL, qty NUMERIC NOT NULL, ref TEXT, notes TEXT, created_by TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS erp_orders (id BIGSERIAL PRIMARY KEY, brand_id BIGINT NOT NULL, order_no TEXT, customer_id BIGINT, channel TEXT, status TEXT DEFAULT 'baru', shipping NUMERIC DEFAULT 0, order_at TEXT, notes TEXT, created_by TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS erp_order_items (id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL, product_id BIGINT, name TEXT, qty NUMERIC NOT NULL DEFAULT 1, price NUMERIC NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS erp_payments (id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL, amount NUMERIC NOT NULL, method TEXT, paid_at TEXT, notes TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS erp_invoices (id BIGSERIAL PRIMARY KEY, brand_id BIGINT NOT NULL, invoice_no TEXT, order_id BIGINT, customer_id BIGINT, amount NUMERIC NOT NULL DEFAULT 0, status TEXT DEFAULT 'belum_lunas', due_at TEXT, notes TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS erp_expenses (id BIGSERIAL PRIMARY KEY, brand_id BIGINT NOT NULL, category TEXT, amount NUMERIC NOT NULL DEFAULT 0, notes TEXT, spent_at TEXT, created_by TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS erp_reviews (id BIGSERIAL PRIMARY KEY, brand_id BIGINT NOT NULL, product_id BIGINT, customer_id BIGINT, rating INTEGER DEFAULT 5, channel TEXT, comment TEXT, review_at TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS erp_audit_logs (id BIGSERIAL PRIMARY KEY, brand_id BIGINT NOT NULL, actor TEXT, action TEXT, entity TEXT, entity_id BIGINT, detail TEXT, created_at TEXT);
`;

const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const num = (v, dflt = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : dflt;
};

// Definisi entitas generik: kolom form + validasi minimal.
const ENTITIES = {
  leads: { label: 'Lead', cols: { name: 'text', phone: 'text', source: 'text', status: 'select:baru|dihubungi|prospek|dikonversi|ditolak', value: 'number', notes: 'textarea' }, required: ['name'] },
  customers: { label: 'Customer', cols: { name: 'text', phone: 'text', email: 'text', channel: 'select:shopee|tokopedia|tiktok|lazada|whatsapp|instagram|offline|lainnya', city: 'text', notes: 'textarea' }, required: ['name'] },
  products: { label: 'Produk', cols: { sku: 'text', name: 'text', category: 'text', cost: 'number', price: 'number', stock_min: 'number' }, required: ['name'] },
  warehouses: { label: 'Gudang', cols: { name: 'text', city: 'text', notes: 'textarea' }, required: ['name'] },
  invoices: { label: 'Invoice', cols: { invoice_no: 'text', order_id: 'number', customer_id: 'number', amount: 'number', status: 'select:belum_lunas|lunas|jatuh_tempo|batal', due_at: 'date', notes: 'textarea' }, required: ['amount'] },
  expenses: { label: 'Pengeluaran', cols: { category: 'text', amount: 'number', notes: 'textarea', spent_at: 'date' }, required: ['amount'] },
  reviews: { label: 'Review', cols: { product_id: 'number', customer_id: 'number', rating: 'number', channel: 'text', comment: 'textarea', review_at: 'date' }, required: ['comment'] },
  stock_moves: { label: 'Stok', cols: { product_id: 'number', warehouse_id: 'number', type: 'select:masuk|keluar|penyesuaian', qty: 'number', ref: 'text', notes: 'textarea' }, required: ['product_id', 'qty'] },
};

async function audit(db, req, action, entity, entityId, detail) {
  await db.run(
    'INSERT INTO erp_audit_logs (brand_id, actor, action, entity, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    req.brand.id, req.user.username, action, entity, entityId ?? null, str(detail, 500), now()
  );
}

export function erpRoutes(app, db, scope) {
  SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)
    .forEach((sql) => db.run(sql).catch((e) => console.error('ERP schema:', e.message)));

  // ---- Dashboard ----
  const dashboard = async (req, res) => {
    const b = req.brand.id;
    const month = now().slice(0, 7);
    const day = now().slice(0, 10);
    const one = async (sql, ...args) => (await db.get(sql, ...args)) || {};
    const out = {};
    out.omzet_bulan = (await one(`SELECT COALESCE(SUM(total),0) AS v FROM (SELECT o.id, (SELECT COALESCE(SUM(qty*price),0) FROM erp_order_items i WHERE i.order_id = o.id) + o.shipping AS total FROM erp_orders o WHERE o.brand_id = ? AND o.status NOT IN ('batal') AND COALESCE(NULLIF(o.order_at,''), o.created_at) LIKE '${month}%' ) t`, b)).v;
    out.order_hari_ini = (await one(`SELECT count(*) AS v FROM erp_orders WHERE brand_id = ? AND COALESCE(NULLIF(order_at,''), created_at) LIKE '${day}%'`, b)).v;
    out.perlu_diproses = (await one(`SELECT count(*) AS v FROM erp_orders WHERE brand_id = ? AND status IN ('baru','dibayar')`, b)).v;
    out.siap_kirim = (await one(`SELECT count(*) AS v FROM erp_orders WHERE brand_id = ? AND status = 'dikemas'`, b)).v;
    out.piutang = (await one(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_invoices WHERE brand_id = ? AND status NOT IN ('lunas','batal')`, b)).v;
    out.pengeluaran_bulan = (await one(`SELECT COALESCE(SUM(amount),0) AS v FROM erp_expenses WHERE brand_id = ? AND COALESCE(NULLIF(spent_at,''), created_at) LIKE '${month}%'`, b)).v;
    out.stok_menipis = (await db.all(`SELECT p.id, p.name, p.stock_min, COALESCE(SUM(CASE WHEN m.type='masuk' THEN m.qty WHEN m.type='keluar' THEN -m.qty ELSE m.qty END),0) AS stok FROM erp_products p LEFT JOIN erp_stock_moves m ON m.product_id = p.id WHERE p.brand_id = ? GROUP BY p.id, p.name, p.stock_min HAVING COALESCE(SUM(CASE WHEN m.type='masuk' THEN m.qty WHEN m.type='keluar' THEN -m.qty ELSE m.qty END),0) < p.stock_min`, b));
    res.json(out);
  };
  app.get('/api/erp/dashboard', scope, dashboard);
  app.get('/api/erp/summary', scope, dashboard);

  // ---- Audit log (baca saja) ----
  app.get('/api/erp/audit-logs', scope, async (req, res) => {
    res.json(await db.all('SELECT * FROM erp_audit_logs WHERE brand_id = ? ORDER BY id DESC LIMIT 200', req.brand.id));
  });

  // ---- CRUD generik ----
  const cast = (def, key, v) => {
    const t = def.cols[key] || 'text';
    if (t === 'number') return num(v, 0);
    return str(v);
  };

  for (const [name, def] of Object.entries(ENTITIES)) {
    app.get(`/api/erp/${name}`, scope, async (req, res) => {
      res.json(await db.all(`SELECT * FROM erp_${name} WHERE brand_id = ? ORDER BY id DESC LIMIT 500`, req.brand.id));
    });

    app.post(`/api/erp/${name}`, scope, async (req, res) => {
      const b = req.body || {};
      for (const f of def.required) {
        if (b[f] === undefined || b[f] === null || b[f] === '') return res.status(400).json({ error: `${f} wajib diisi` });
      }
      const keys = Object.keys(def.cols);
      const vals = keys.map((k) => cast(def, k, b[k]));
      const stamp = now();
      const [row] = await db.run(
        `INSERT INTO erp_${name} (brand_id, ${keys.join(', ')}, created_at) VALUES (?, ${keys.map(() => '?').join(', ')}, ?) RETURNING *`,
        req.brand.id, ...vals, stamp
      );
      await audit(db, req, 'tambah', name, row.id, JSON.stringify(b).slice(0, 300));
      res.status(201).json(row);
    });

    app.patch(`/api/erp/${name}/:id`, scope, async (req, res) => {
      const id = Number(req.params.id);
      const cur = await db.get(`SELECT * FROM erp_${name} WHERE id = ? AND brand_id = ?`, id, req.brand.id);
      if (!cur) return res.status(404).json({ error: 'Data tidak ditemukan' });
      const b = req.body || {};
      const keys = Object.keys(def.cols).filter((k) => b[k] !== undefined);
      if (!keys.length) return res.json(cur);
      const vals = keys.map((k) => cast(def, k, b[k]));
      const [row] = await db.run(
        `UPDATE erp_${name} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? RETURNING *`,
        ...vals, id
      );
      await audit(db, req, 'ubah', name, id, keys.join(','));
      res.json(row);
    });

    app.delete(`/api/erp/${name}/:id`, scope, async (req, res) => {
      const id = Number(req.params.id);
      const cur = await db.get(`SELECT * FROM erp_${name} WHERE id = ? AND brand_id = ?`, id, req.brand.id);
      if (!cur) return res.status(404).json({ error: 'Data tidak ditemukan' });
      await db.run(`DELETE FROM erp_${name} WHERE id = ?`, id);
      await audit(db, req, 'hapus', name, id, str(cur.name || cur.summary || cur.invoice_no || '', 100));
      res.json({ ok: true });
    });
  }

  // ---- Stok turunan (per produk) ----
  app.get('/api/erp/stock', scope, async (req, res) => {
    res.json(await db.all(`
      SELECT p.id AS product_id, p.name, p.sku, p.stock_min,
        COALESCE(SUM(CASE WHEN m.type='masuk' THEN m.qty WHEN m.type='keluar' THEN -m.qty ELSE m.qty END),0) AS stok
      FROM erp_products p LEFT JOIN erp_stock_moves m ON m.product_id = p.id
      WHERE p.brand_id = ? GROUP BY p.id, p.name, p.sku, p.stock_min ORDER BY p.name`, req.brand.id));
  });

  // ---- Order khusus (dengan item & pembayaran) ----
  app.get('/api/erp/orders', scope, async (req, res) => {
    const manual = await db.all(`
      SELECT o.*, c.name AS customer_name,
        (SELECT COALESCE(SUM(qty*price),0) FROM erp_order_items i WHERE i.order_id = o.id) AS subtotal,
        (SELECT COALESCE(SUM(qty*price),0) FROM erp_order_items i WHERE i.order_id = o.id) + o.shipping AS total,
        (SELECT COALESCE(SUM(amount),0) FROM erp_payments p WHERE p.order_id = o.id) AS dibayar
      FROM erp_orders o LEFT JOIN erp_customers c ON c.id = o.customer_id
      WHERE o.brand_id = ? ORDER BY o.id DESC LIMIT 500`, req.brand.id);
    // Order marketplace yang tersinkron lewat Inbox (chat_orders) digabung ke tampilan yang sama —
    // satu pintu untuk semua order, barisnya hanya-baca (sumbernya sistem marketplace).
    let synced = [];
    try {
      synced = await db.all(`
        SELECT co.*, cc.platform, cc.name AS channel_name FROM chat_orders co
        LEFT JOIN chat_channels cc ON cc.id = co.channel_id
        ORDER BY co.id DESC LIMIT 500`);
    } catch { /* tabel belum ada */ }
    const rows = [
      ...manual.map((o) => ({ ...o, source: 'manual' })),
      ...synced.map((o) => ({
        id: 'm' + o.id, source: 'marketplace', order_no: o.external_id,
        customer_name: o.buyer_name, channel: o.platform || o.channel_name || 'marketplace',
        status: o.raw_status || o.status, subtotal: null, total: o.total, dibayar: null,
        order_at: o.ordered_at, created_at: o.updated_at,
      })),
    ];
    res.json(rows);
  });

  app.get('/api/erp/orders/:id', scope, async (req, res) => {
    const id = Number(req.params.id);
    const o = await db.get('SELECT * FROM erp_orders WHERE id = ? AND brand_id = ?', id, req.brand.id);
    if (!o) return res.status(404).json({ error: 'Order tidak ditemukan' });
    o.items = await db.all('SELECT * FROM erp_order_items WHERE order_id = ? ORDER BY id', id);
    o.payments = await db.all('SELECT * FROM erp_payments WHERE order_id = ? ORDER BY id', id);
    res.json(o);
  });

  app.post('/api/erp/orders', scope, async (req, res) => {
    const b = req.body || {};
    const stamp = now();
    const orderNo = str(b.order_no) || `ORD-${Date.now().toString(36).toUpperCase()}`;
    const [o] = await db.run(
      `INSERT INTO erp_orders (brand_id, order_no, customer_id, channel, status, shipping, order_at, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      req.brand.id, orderNo, b.customer_id ? Number(b.customer_id) : null, str(b.channel, 50),
      ['baru', 'dibayar', 'dikemas', 'dikirim', 'selesai', 'batal'].includes(b.status) ? b.status : 'baru',
      num(b.shipping, 0), str(b.order_at) || stamp, str(b.notes), req.user.username, stamp, stamp
    );
    for (const it of (Array.isArray(b.items) ? b.items : [])) {
      await db.run('INSERT INTO erp_order_items (order_id, product_id, name, qty, price) VALUES (?, ?, ?, ?, ?)',
        o.id, it.product_id ? Number(it.product_id) : null, str(it.name, 200), num(it.qty, 1), num(it.price, 0));
    }
    await audit(db, req, 'tambah', 'orders', o.id, orderNo);
    res.status(201).json(o);
  });

  app.patch('/api/erp/orders/:id', scope, async (req, res) => {
    const id = Number(req.params.id);
    const cur = await db.get('SELECT * FROM erp_orders WHERE id = ? AND brand_id = ?', id, req.brand.id);
    if (!cur) return res.status(404).json({ error: 'Order tidak ditemukan' });
    const b = req.body || {};
    const next = {
      order_no: b.order_no !== undefined ? str(b.order_no) : cur.order_no,
      customer_id: b.customer_id !== undefined ? (b.customer_id ? Number(b.customer_id) : null) : cur.customer_id,
      channel: b.channel !== undefined ? str(b.channel, 50) : cur.channel,
      status: ['baru', 'dibayar', 'dikemas', 'dikirim', 'selesai', 'batal'].includes(b.status) ? b.status : cur.status,
      shipping: b.shipping !== undefined ? num(b.shipping, 0) : cur.shipping,
      order_at: b.order_at !== undefined ? str(b.order_at) : cur.order_at,
      notes: b.notes !== undefined ? str(b.notes) : cur.notes,
    };
    const [row] = await db.run(
      `UPDATE erp_orders SET order_no = ?, customer_id = ?, channel = ?, status = ?, shipping = ?, order_at = ?, notes = ?, updated_at = ? WHERE id = ? RETURNING *`,
      next.order_no, next.customer_id, next.channel, next.status, next.shipping, next.order_at, next.notes, now(), id
    );
    if (Array.isArray(b.items)) {
      await db.run('DELETE FROM erp_order_items WHERE order_id = ?', id);
      for (const it of b.items) {
        await db.run('INSERT INTO erp_order_items (order_id, product_id, name, qty, price) VALUES (?, ?, ?, ?, ?)',
          id, it.product_id ? Number(it.product_id) : null, str(it.name, 200), num(it.qty, 1), num(it.price, 0));
      }
    }
    await audit(db, req, 'ubah', 'orders', id, `status=${next.status}`);
    res.json(row);
  });

  app.post('/api/erp/orders/:id/payments', scope, async (req, res) => {
    const id = Number(req.params.id);
    const o = await db.get('SELECT * FROM erp_orders WHERE id = ? AND brand_id = ?', id, req.brand.id);
    if (!o) return res.status(404).json({ error: 'Order tidak ditemukan' });
    const b = req.body || {};
    const [row] = await db.run(
      'INSERT INTO erp_payments (order_id, amount, method, paid_at, notes, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
      id, num(b.amount, 0), str(b.method, 50), str(b.paid_at) || now(), str(b.notes), now()
    );
    await audit(db, req, 'bayar', 'orders', id, `Rp${num(b.amount, 0)}`);
    res.status(201).json(row);
  });

  app.delete('/api/erp/orders/:id', scope, async (req, res) => {
    const id = Number(req.params.id);
    const cur = await db.get('SELECT * FROM erp_orders WHERE id = ? AND brand_id = ?', id, req.brand.id);
    if (!cur) return res.status(404).json({ error: 'Order tidak ditemukan' });
    await db.run('DELETE FROM erp_order_items WHERE order_id = ?', id);
    await db.run('DELETE FROM erp_payments WHERE order_id = ?', id);
    await db.run('DELETE FROM erp_orders WHERE id = ?', id);
    await audit(db, req, 'hapus', 'orders', id, cur.order_no);
    res.json({ ok: true });
  });
}

export { ENTITIES, audit, str, num };
