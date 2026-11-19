// ERP Toko — UI modul: Dashboard, Order, Lead, Customer, Produk, Stok & Gudang,
// Invoice, Pengeluaran, Komplain, Review, Audit log. Gaya mengikuti modul lain (window.siarin).
(() => {
  const S = window.siarin;
  const { api, esc, toast } = S;
  const $ = (sel, root = document) => root.querySelector(sel);

  const TABS = [
    ['dashboard', 'Dashboard'], ['orders', 'Order'], ['leads', 'Lead'], ['customers', 'Customer'],
    ['products', 'Produk'], ['stock', 'Stok & Gudang'], ['invoices', 'Invoice'], ['expenses', 'Pengeluaran'],
    ['complaints', 'Komplain'], ['reviews', 'Review'], ['audit', 'Audit log'],
  ];

  const FORMS = {
    leads: { label: 'Lead', fields: [['name', 'Nama', 'text'], ['phone', 'HP', 'text'], ['source', 'Sumber', 'text'], ['status', 'Status', 'select', ['baru', 'dihubungi', 'prospek', 'dikonversi', 'ditolak']], ['value', 'Nilai (Rp)', 'number'], ['notes', 'Catatan', 'textarea']] },
    customers: { label: 'Customer', fields: [['name', 'Nama', 'text'], ['phone', 'HP', 'text'], ['email', 'Email', 'text'], ['channel', 'Channel', 'select', ['shopee', 'tokopedia', 'tiktok', 'lazada', 'whatsapp', 'instagram', 'offline', 'lainnya']], ['city', 'Kota', 'text'], ['notes', 'Catatan', 'textarea']] },
    products: { label: 'Produk', fields: [['sku', 'SKU', 'text'], ['name', 'Nama', 'text'], ['category', 'Kategori', 'text'], ['cost', 'HPP (Rp)', 'number'], ['price', 'Harga Jual (Rp)', 'number'], ['stock_min', 'Stok Minimum', 'number']] },
    warehouses: { label: 'Gudang', fields: [['name', 'Nama', 'text'], ['city', 'Kota', 'text'], ['notes', 'Catatan', 'textarea']] },
    invoices: { label: 'Invoice', fields: [['invoice_no', 'No Invoice', 'text'], ['order_id', 'ID Order', 'number'], ['customer_id', 'ID Customer', 'number'], ['amount', 'Jumlah (Rp)', 'number'], ['status', 'Status', 'select', ['belum_lunas', 'lunas', 'jatuh_tempo', 'batal']], ['due_at', 'Jatuh Tempo', 'date'], ['notes', 'Catatan', 'textarea']] },
    expenses: { label: 'Pengeluaran', fields: [['category', 'Kategori', 'text'], ['amount', 'Jumlah (Rp)', 'number'], ['notes', 'Catatan', 'textarea'], ['spent_at', 'Tanggal', 'date']] },
    reviews: { label: 'Review', fields: [['product_id', 'ID Produk', 'number'], ['customer_id', 'ID Customer', 'number'], ['rating', 'Rating (1-5)', 'number'], ['channel', 'Channel', 'text'], ['comment', 'Komentar', 'textarea'], ['review_at', 'Tanggal', 'date']] },
    stock_moves: { label: 'Pergerakan Stok', fields: [['product_id', 'ID Produk', 'number'], ['warehouse_id', 'ID Gudang', 'number'], ['type', 'Jenis', 'select', ['masuk', 'keluar', 'penyesuaian']], ['qty', 'Jumlah', 'number'], ['ref', 'Referensi', 'text'], ['notes', 'Catatan', 'textarea']] },
  };

  const COLS = {
    leads: [['name', 'Nama'], ['phone', 'HP'], ['source', 'Sumber'], ['status', 'Status'], ['value', 'Nilai']],
    customers: [['name', 'Nama'], ['phone', 'HP'], ['email', 'Email'], ['channel', 'Channel'], ['city', 'Kota']],
    products: [['sku', 'SKU'], ['name', 'Nama'], ['category', 'Kategori'], ['cost', 'HPP'], ['price', 'Harga'], ['stock_min', 'Min']],
    warehouses: [['name', 'Nama'], ['city', 'Kota']],
    invoices: [['invoice_no', 'No'], ['amount', 'Jumlah'], ['status', 'Status'], ['due_at', 'Jatuh Tempo']],
    expenses: [['category', 'Kategori'], ['amount', 'Jumlah'], ['spent_at', 'Tanggal']],
    reviews: [['rating', 'Rating'], ['channel', 'Channel'], ['comment', 'Komentar'], ['review_at', 'Tanggal']],
    stock_moves: [['product_id', 'Produk'], ['warehouse_id', 'Gudang'], ['type', 'Jenis'], ['qty', 'Jumlah'], ['created_at', 'Waktu']],
  };

  const rp = (v) => 'Rp' + Number(v || 0).toLocaleString('id-ID');
  const fmt = (v) => (v == null ? '—' : String(v).slice(0, 60));
  const state = { tab: 'dashboard' };

  function formHtml(key, row = {}) {
    const f = FORMS[key];
    return `<form class="erp-form" data-entity="${key}" ${row.id ? `data-id="${row.id}"` : ''}>
      ${f.fields.map(([name, label, type, opts]) => {
        const v = row[name] ?? '';
        if (type === 'textarea') return `<label>${label}<textarea name="${name}">${esc(String(v))}</textarea></label>`;
        if (type === 'select') return `<label>${label}<select name="${name}">${opts.map((o) => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
        return `<label>${label}<input name="${name}" type="${type}" value="${esc(String(v))}"></label>`;
      }).join('')}
      <div class="erp-actions"><button class="primary" type="submit">Simpan</button>
      <button class="ghost" type="button" data-cancel>Batal</button></div>
    </form>`;
  }

  async function submitForm(form) {
    const key = form.dataset.entity;
    const id = form.dataset.id;
    const body = {};
    for (const el of form.elements) if (el.name) body[el.name] = el.value;
    const method = id ? 'PATCH' : 'POST';
    const url = id ? `/api/erp/${key}/${id}` : `/api/erp/${key}`;
    try {
      await api(url, { method, body });
      toast(id ? 'Tersimpan' : 'Ditambahkan');
      render();
    } catch (e) { toast(e.message || 'Gagal menyimpan'); }
  }

  function tableHtml(key, rows) {
    const cols = COLS[key];
    return `<div class="erp-table-wrap"><table class="erp-table">
      <thead><tr>${cols.map(([, l]) => `<th>${l}</th>`).join('')}<th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr>${cols.map(([k]) => `<td>${fmt(r[k])}</td>`).join('')}
        <td class="row-acts"><button class="ghost small" data-edit="${r.id}">Ubah</button>
        <button class="ghost small" data-del="${r.id}">Hapus</button></td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  async function renderEntity(key) {
    const box = $('#erp-body');
    const rows = await api(`/api/erp/${key}`);
    box.innerHTML = `
      <div class="erp-bar"><button class="primary" data-add>+ Tambah ${FORMS[key].label}</button>
      <button class="ghost" data-entity-more="${key === 'stock_moves' ? 'warehouses' : ''}" hidden></button></div>
      <div class="erp-form-slot"></div>
      ${tableHtml(key, rows)}`;
    if (key === 'stock_moves') {
      const stock = await api('/api/erp/stock');
      box.insertAdjacentHTML('afterbegin', `<div class="erp-table-wrap"><table class="erp-table">
        <thead><tr><th>Produk</th><th>SKU</th><th>Stok</th><th>Minimum</th></tr></thead>
        <tbody>${stock.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.sku || '—')}</td>
          <td><b>${s.stok}</b></td><td>${s.stock_min}</td></tr>`).join('')}</tbody></table></div>
        <h3>Pergerakan Stok</h3><div class="erp-bar"><button class="primary" data-add>+ Tambah Pergerakan</button></div>
        <div class="erp-form-slot"></div>${tableHtml(key, rows)}`);
    }
  }

  async function renderDashboard() {
    const d = await api('/api/erp/dashboard');
    $('#erp-body').innerHTML = `
      <div class="erp-cards">
        <div class="erp-card"><span>Omzet Bulan Ini</span><b>${rp(d.omzet_bulan)}</b></div>
        <div class="erp-card"><span>Order Hari Ini</span><b>${d.order_hari_ini}</b></div>
        <div class="erp-card"><span>Perlu Diproses</span><b>${d.perlu_diproses}</b></div>
        <div class="erp-card"><span>Siap Kirim</span><b>${d.siap_kirim}</b></div>
        <div class="erp-card"><span>Piutang</span><b>${rp(d.piutang)}</b></div>
        <div class="erp-card"><span>Pengeluaran Bulan</span><b>${rp(d.pengeluaran_bulan)}</b></div>
      </div>
      <h3>Stok Menipis</h3>
      <div class="erp-table-wrap"><table class="erp-table">
        <thead><tr><th>Produk</th><th>Stok</th><th>Minimum</th></tr></thead>
        <tbody>${(d.stok_menipis || []).map((s) => `<tr><td>${esc(s.name)}</td><td><b>${s.stok}</b></td><td>${s.stock_min}</td></tr>`).join('') || '<tr><td colspan="3">Semua stok aman 👍</td></tr>'}</tbody>
      </table></div>`;
  }

  const ORDER_STATUS = ['baru', 'dibayar', 'dikemas', 'dikirim', 'selesai', 'batal'];

  async function renderOrders() {
    const rows = await api('/api/erp/orders');
    $('#erp-body').innerHTML = `
      <div class="erp-bar"><button class="primary" data-add-order>+ Tambah Order</button></div>
      <div class="erp-form-slot"></div>
      <div class="erp-table-wrap"><table class="erp-table">
        <thead><tr><th>No</th><th>Sumber</th><th>Customer</th><th>Channel</th><th>Status</th><th>Total</th><th>Dibayar</th><th>Tanggal</th><th></th></tr></thead>
        <tbody>${rows.map((o) => `<tr>
          <td>${esc(o.order_no)}</td>
          <td>${o.source === 'marketplace' ? '<span class="erp-tag">Marketplace</span>' : '<span class="erp-tag erp-tag-m">Manual</span>'}</td>
          <td>${esc(o.customer_name || '—')}</td><td>${esc(o.channel || '—')}</td>
          <td>${o.source === 'marketplace' ? esc(o.status || '—') : `<select class="erp-status" data-order="${o.id}">${ORDER_STATUS.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`}</td>
          <td><b>${rp(o.total)}</b></td><td>${o.dibayar == null ? '—' : rp(o.dibayar)}</td><td>${fmt((o.order_at || '').slice(0, 10))}</td>
          <td class="row-acts">${o.source === 'marketplace'
            ? '<span class="erp-readonly">sinkron</span>'
            : `<button class="ghost small" data-order-open="${o.id}">Detail</button><button class="ghost small" data-order-del="${o.id}">Hapus</button>`}</td></tr>`).join('') || '<tr><td colspan="9">Belum ada order</td></tr>'}</tbody>
      </table></div>
      <div id="erp-order-detail"></div>`;
  }

  async function openOrder(id) {
    const o = await api(`/api/erp/orders/${id}`);
    const items = (o.items || []).map((it) => `<tr><td>${esc(it.name || '—')}</td><td>${it.qty}</td><td>${rp(it.price)}</td><td>${rp(it.qty * it.price)}</td></tr>`).join('');
    const pays = (o.payments || []).map((p) => `<tr><td>${fmt((p.paid_at || '').slice(0, 10))}</td><td>${rp(p.amount)}</td><td>${esc(p.method || '—')}</td></tr>`).join('');
    $('#erp-order-detail').innerHTML = `<h3>Detail ${esc(o.order_no)}</h3>
      <div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>Item</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>${items}</tbody></table></div>
      <h4>Pembayaran</h4>
      <div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>Tanggal</th><th>Jumlah</th><th>Metode</th></tr></thead><tbody>${pays || '<tr><td colspan="3">Belum ada pembayaran</td></tr>'}</tbody></table></div>
      <form class="erp-form" data-pay="${id}">
        <label>Jumlah (Rp)<input name="amount" type="number"></label>
        <label>Metode<input name="method" type="text" placeholder="transfer / cod / e-wallet"></label>
        <div class="erp-actions"><button class="primary" type="submit">Catat Pembayaran</button></div>
      </form>`;
  }

  async function renderAudit() {
    const rows = await api('/api/erp/audit-logs');
    $('#erp-body').innerHTML = `<div class="erp-table-wrap"><table class="erp-table">
      <thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Entri</th><th>ID</th><th>Detail</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${fmt(r.created_at)}</td><td>${esc(r.actor)}</td><td>${esc(r.action)}</td>
        <td>${esc(r.entity)}</td><td>${r.entity_id ?? '—'}</td><td>${fmt(r.detail)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  const CS_STATUS = ['baru', 'diproses', 'menunggu', 'selesai'];

  // Komplain = data yang sama dengan menu "Tiket & Template" (cs_tickets) — tidak disimpan dobel.
  async function renderComplaints() {
    const rows = await api('/api/cs/tickets');
    $('#erp-body').innerHTML = `
      <p class="erp-note">Komplain & retur dikelola sebagai <b>CS Tiket</b> (SLA + template balasan) — data yang sama dengan menu "Tiket & Template".</p>
      <div class="erp-table-wrap"><table class="erp-table">
        <thead><tr><th>Pelanggan</th><th>Channel</th><th>Kategori</th><th>Prioritas</th><th>Status</th><th>Ringkasan</th><th>Batas Waktu</th></tr></thead>
        <tbody>${rows.map((t) => `<tr>
          <td>${esc(t.customer || '—')}</td><td>${esc(t.channel || '—')}</td><td>${esc(t.category || '—')}</td>
          <td>${esc(t.priority || '—')}</td>
          <td><select class="erp-status cs-status" data-ticket="${t.id}">${CS_STATUS.map((s) => `<option ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
          <td>${esc(String(t.summary || '').slice(0, 60))}</td><td>${fmt((t.due_at || '').slice(0, 16).replace('T', ' '))}</td>
        </tr>`).join('') || '<tr><td colspan="7">Belum ada tiket</td></tr>'}</tbody>
      </table></div>`;
  }

  async function render() {
    const t = state.tab;
    if (t === 'dashboard') return renderDashboard().catch((e) => toast(e.message));
    if (t === 'orders') return renderOrders().catch((e) => toast(e.message));
    if (t === 'audit') return renderAudit().catch((e) => toast(e.message));
    if (t === 'complaints') return renderComplaints().catch((e) => toast(e.message));
    if (t === 'stock') return renderEntity('stock_moves').catch((e) => toast(e.message));
    return renderEntity(t).catch((e) => toast(e.message));
  }

  function drawShell() {
    $('#view-erp').innerHTML = `
      <h1>ERP Toko</h1>
      <div class="erp-tabs">${TABS.map(([k, l]) => `<button class="erp-tab ${k === state.tab ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="erp-body">Memuat…</div>`;
    render();
  }

  // Event delegation
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { state.tab = tab.dataset.tab; drawShell(); return; }
    const view = e.target.closest('#view-erp');
    if (!view) return;
    const add = e.target.closest('[data-add]');
    if (add) {
      const key = state.tab;
      const slot = $('.erp-form-slot', view);
      slot.innerHTML = formHtml(key);
      slot.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      const key = state.tab === 'stock' ? 'stock_moves' : state.tab;
      api(`/api/erp/${key}`).then((rows) => {
        const row = rows.find((r) => String(r.id) === edit.dataset.edit);
        const slot = $('.erp-form-slot', view);
        if (slot && row) { slot.innerHTML = formHtml(key, row); slot.scrollIntoView({ behavior: 'smooth' }); }
      });
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del && confirm('Hapus data ini?')) {
      const key = state.tab === 'stock' ? 'stock_moves' : state.tab;
      api(`/api/erp/${key}/${del.dataset.del}`, { method: 'DELETE' }).then(() => { toast('Dihapus'); render(); }).catch((err) => toast(err.message));
      return;
    }
    if (e.target.closest('[data-cancel]')) { $('.erp-form-slot', view).innerHTML = ''; return; }
    const addOrder = e.target.closest('[data-add-order]');
    if (addOrder) {
      $('.erp-form-slot', view).innerHTML = `<form class="erp-form" data-order-new>
        <label>Customer ID<input name="customer_id" type="number"></label>
        <label>Channel<input name="channel" type="text" placeholder="shopee / tiktok / whatsapp"></label>
        <label>Ongkir (Rp)<input name="shipping" type="number" value="0"></label>
        <label>Item (satu per baris: nama|qty|harga)<textarea name="items" placeholder="Madu Gurahfit 280gr|2|125000"></textarea></label>
        <label>Catatan<textarea name="notes"></textarea></label>
        <div class="erp-actions"><button class="primary" type="submit">Simpan Order</button>
        <button class="ghost" type="button" data-cancel>Batal</button></div></form>`;
      return;
    }
    const open = e.target.closest('[data-order-open]');
    if (open) { openOrder(open.dataset.orderOpen); return; }
    const od = e.target.closest('[data-order-del]');
    if (od && confirm('Hapus order beserta item & pembayarannya?')) {
      api(`/api/erp/orders/${od.dataset.orderDel}`, { method: 'DELETE' }).then(() => { toast('Order dihapus'); renderOrders(); }).catch((err) => toast(err.message));
    }
  });

  document.addEventListener('submit', (e) => {
    const view = e.target.closest('#view-erp');
    if (!view) return;
    e.preventDefault();
    const form = e.target;
    if (form.dataset.entity) return submitForm(form);
    if (form.dataset.pay) {
      const body = {};
      for (const el of form.elements) if (el.name) body[el.name] = el.value;
      return api(`/api/erp/orders/${form.dataset.pay}/payments`, { method: 'POST', body })
        .then(() => { toast('Pembayaran dicatat'); openOrder(form.dataset.pay); }).catch((err) => toast(err.message));
    }
    if (form.hasAttribute('data-order-new')) {
      const body = {};
      for (const el of form.elements) if (el.name && el.name !== 'items') body[el.name] = el.value;
      body.items = (form.elements.items.value || '').split('\n').filter(Boolean).map((line) => {
        const [name, qty, price] = line.split('|').map((x) => x.trim());
        return { name, qty: Number(qty) || 1, price: Number(price) || 0 };
      });
      return api('/api/erp/orders', { method: 'POST', body })
        .then(() => { toast('Order dibuat'); renderOrders(); }).catch((err) => toast(err.message));
    }
  });

  document.addEventListener('change', (e) => {
    const tk = e.target.closest('.cs-status');
    if (tk) {
      api(`/api/cs/tickets/${tk.dataset.ticket}`, { method: 'PATCH', body: { status: tk.value } })
        .then(() => toast(`Tiket → ${tk.value}`)).catch((err) => toast(err.message));
      return;
    }
    const sel = e.target.closest('.erp-status');
    if (!sel) return;
    api(`/api/erp/orders/${sel.dataset.order}`, { method: 'PATCH', body: { status: sel.value } })
      .then(() => toast(`Status → ${sel.value}`)).catch((err) => toast(err.message));
  });

  S.viewHooks.erp = drawShell;
})();
