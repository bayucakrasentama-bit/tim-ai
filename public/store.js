/* Toko Digital — katalog produk ala lynk.id: kartu produk, harga coret, benefits, CTA link. */
(() => {
  const S = window.siarin;
  const { api, esc, toast } = S;
  const $ = (sel, el = document) => el.querySelector(sel);
  const v = () => $('#view-store');
  const R = () => '/api/katalog';
  let products = [];
  let view = 'catalog';

  const rp = (n) => n ? 'Rp' + Number(n).toLocaleString('id-ID') : 'GRATIS';

  function card(p) {
    return `<div class="card" style="border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
        <div>
          <div style="font-size:11px;opacity:.6;text-transform:uppercase">${esc(p.category)}</div>
          <div style="font-weight:700;font-size:15px;line-height:1.3">${esc(p.title)}</div>
        </div>
        <div style="text-align:right;white-space:nowrap">
          ${p.price_old ? `<div style="text-decoration:line-through;opacity:.5;font-size:12px">${rp(p.price_old)}</div>` : ''}
          <div style="font-weight:800;font-size:17px;color:${p.price ? 'var(--accent)' : '#22c55e'}">${rp(p.price)}</div>
        </div>
      </div>
      <div style="opacity:.85;font-size:13px">${esc(p.summary)}</div>
      ${(p.benefits || []).length ? `<ul style="margin:0;padding-left:16px;font-size:12px;opacity:.8">${p.benefits.slice(0, 4).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      ${p.angle ? `<div style="font-size:11px;opacity:.6;border-left:3px solid var(--accent);padding-left:8px">Angle: ${esc(p.angle)}</div>` : ''}
      <div style="margin-top:auto;display:flex;gap:8px">
        <a class="btn small" href="${esc(p.url)}" target="_blank" rel="noopener">Buka Produk →</a>
        <button class="btn small ghost" data-copy="${esc(p.url)}">Salin Link</button>
      </div>
    </div>`;
  }

  async function load() {
    const root = v();
    if (!root) return;
    root.innerHTML = '<div class="loading">Memuat katalog…</div>';
    const j = await api('GET', R() + '/products');
    products = j.products || [];
    root.innerHTML = `
      <div class="section-head">
        <h2>Toko Digital</h2>
        <div class="sub">Katalog produk digital siap jual — clone dari riset kompetitor (Ratware & Rahyang). Harga, angle, dan link checkout sudah terisi.</div>
      </div>
      <div style="display:flex;gap:8px;margin:12px 0">
        <button class="btn small" id="store-catalog" ${view === 'catalog' ? 'disabled' : ''}>📦 Katalog</button>
        <button class="btn small ghost" id="store-all">Kelola</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">
        ${products.map(card).join('') || '<div class="loading">Belum ada produk</div>'}
      </div>`;
    $('#store-all', root)?.addEventListener('click', admin);
    root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
      navigator.clipboard.writeText(b.dataset.copy); toast('Link tersalin ✓');
    }));
  }

  async function admin() {
    const root = v();
    root.innerHTML = '<div class="loading">Memuat…</div>';
    const j = await api('GET', R() + '/admin/products');
    const rows = j.products || [];
    root.innerHTML = `
      <div class="section-head">
        <h2>Kelola Produk</h2>
        <div class="sub">Edit harga, judul, link, atau sembunyikan produk dari katalog publik.</div>
      </div>
      <div style="display:flex;gap:8px;margin:12px 0"><button class="btn small" id="store-back">← Katalog</button></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${rows.map((p) => `
          <div class="card" style="border:1px solid var(--border);border-radius:10px;padding:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
              <div style="font-weight:700">${esc(p.title)}</div>
              <div style="font-size:12px;opacity:.7">${esc(p.slug)} · ${esc(p.category)} · ${rp(p.price)} ${p.price_old ? `<s>${rp(p.price_old)}</s>` : ''} · ${p.published ? '🟢 live' : '⚪ draft'}</div>
            </div>
            <a class="btn small ghost" href="${esc(p.url)}" target="_blank" rel="noopener">Buka</a>
            <button class="btn small ghost" data-toggle="${p.id}" data-pub="${p.published ? 0 : 1}">${p.published ? 'Sembunyikan' : 'Tampilkan'}</button>
            <button class="btn small ghost" data-del="${p.id}">🗑</button>
          </div>`).join('')}
      </div>`;
    $('#store-back', root)?.addEventListener('click', load);
    root.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      await api('PATCH', R() + '/admin/products/' + b.dataset.toggle, { published: b.dataset.pub === '1' });
      admin();
    }));
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Hapus produk ini?')) return;
      await api('DELETE', R() + '/admin/products/' + b.dataset.del);
      admin();
    }));
  }

  S.viewHooks = S.viewHooks || {};
  S.viewHooks.store = load;
})();
