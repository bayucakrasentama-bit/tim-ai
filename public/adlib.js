// Intel Iklan — dashboard Meta Ad Library: keyword, kandidat pemenang (iklan tayang
// terlama), top advertiser, velocity creative baru, dan log scan dari agen Mac.
(() => {
  const S = window.siarin;
  const { api, esc, toast } = S;
  const $ = (sel, root = document) => root.querySelector(sel);

  const state = { overview: null, keywords: [], ads: [], kwFilter: 0 };

  const kwName = (id) => state.keywords.find((k) => k.id === id)?.keyword || '—';
  const fmtDate = (d) => (d ? String(d).slice(0, 10) : '—');
  const age = (d) => (d == null ? '—' : d + ' hari');

  async function load() {
    try {
      const [ov, kws, ads] = await Promise.all([
        api('/api/adlib/overview'),
        api('/api/adlib/keywords'),
        api('/api/adlib/ads?sort=recent&limit=150'),
      ]);
      state.overview = ov || {};
      state.keywords = kws?.keywords || [];
      state.ads = ads?.ads || [];
      draw();
    } catch (ex) {
      toast(ex.message || 'Gagal memuat Intel Iklan');
    }
  }

  function draw() {
    const ov = state.overview;
    const t = ov.totals || { creatives: 0, active: 0, new_7d: 0 };
    const winners = ov.winners || [];
    const top = ov.top_advertisers || [];
    const maxAge = winners[0]?.age_days ?? 0;
    const ads = state.ads.filter((a) => !state.kwFilter || a.keyword_id === state.kwFilter);
    const lastScan = (ov.scans || [])[0];

    $('#view-adlib').innerHTML = `
      <div class="card">
        <div class="row between">
          <div><h2>Intel Iklan — Meta Ad Library</h2>
            <p class="muted small">Scan iklan aktif Indonesia per keyword. Umur iklan = proxy winning: makin lama tayang, makin besar kemungkinan iklannya profitable.</p></div>
          <div class="row">
            <span class="pill">${lastScan ? `Scan terakhir: ${esc(fmtDate(lastScan.started_at))} (${esc(lastScan.status)})` : 'Belum pernah di-scan'}</span>
            <button class="btn" data-act="adlib-refresh">Muat ulang</button>
          </div>
        </div>
      </div>

      <div class="grid cards">
        <div class="card"><h3>${t.creatives}</h3><p class="muted">Total creative terkumpul</p></div>
        <div class="card"><h3>${t.active}</h3><p class="muted">Masih tayang (scan terakhir)</p></div>
        <div class="card"><h3>${t.new_7d}</h3><p class="muted">Creative baru 7 hari</p></div>
        <div class="card"><h3>${age(maxAge)}</h3><p class="muted">Umur iklan terpanjang</p></div>
      </div>

      <div class="card">
        <h3>Keyword dipantau</h3>
        <form class="row" data-act="adlib-addkw">
          <input name="keyword" placeholder="mis. madu, suplemen mata, detoks" style="flex:1" required>
          <select name="country"><option value="ID">ID</option></select>
          <button class="btn primary" type="submit">Tambah keyword</button>
        </form>
        <table class="table">
          <thead><tr><th>Keyword</th><th>Negara</th><th>Creative</th><th>Tayang</th><th>Baru 7h</th><th>Advertiser</th><th>Umur max</th><th>Scan terakhir</th><th></th></tr></thead>
          <tbody>
            ${state.keywords.map((k) => `
              <tr>
                <td><b>${esc(k.keyword)}</b></td>
                <td>${esc(k.country)}</td>
                <td>${k.total}</td>
                <td>${k.active}</td>
                <td>${k.new_7d}</td>
                <td>${k.pages}</td>
                <td>${age(k.max_age_days)}</td>
                <td class="small muted">${esc(fmtDate(k.last_scan))}${k.last_status === 'error' ? ' ⚠' : ''}</td>
                <td><button class="btn small" data-act="adlib-delkw" data-id="${k.id}">Hapus</button></td>
              </tr>`).join('') || '<tr><td colspan="9" class="muted">Belum ada keyword — tambah di atas.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="grid two">
        <div class="card">
          <h3>Kandidat pemenang — tayang terlama</h3>
          <table class="table">
            <thead><tr><th>Advertiser</th><th>Keyword</th><th>Mulai</th><th>Umur</th><th>Cuplikan</th></tr></thead>
            <tbody>
              ${winners.map((w) => `
                <tr>
                  <td><b>${esc(w.page_name || '—')}</b></td>
                  <td>${esc(kwName(w.keyword_id))}</td>
                  <td>${esc(fmtDate(w.start_date))}</td>
                  <td><b>${age(w.age_days)}</b></td>
                  <td class="small">${esc((w.body_text || '').slice(0, 120))}</td>
                </tr>`).join('') || '<tr><td colspan="5" class="muted">Belum ada data.</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="card">
          <h3>Top advertiser (kejenuhan segmen)</h3>
          <table class="table">
            <thead><tr><th>Advertiser</th><th>Jumlah creative</th><th>Umur terpanjang</th></tr></thead>
            <tbody>
              ${top.map((p) => `
                <tr>
                  <td><b>${esc(p.page_name)}</b></td>
                  <td>${p.ads}</td>
                  <td>${age(p.max_age_days)}</td>
                </tr>`).join('') || '<tr><td colspan="3" class="muted">Belum ada data.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="row between">
          <h3>Creative terbaru masuk</h3>
          <select data-act="adlib-filter">
            <option value="0">Semua keyword</option>
            ${state.keywords.map((k) => `<option value="${k.id}" ${state.kwFilter === k.id ? 'selected' : ''}>${esc(k.keyword)}</option>`).join('')}
          </select>
        </div>
        <table class="table">
          <thead><tr><th>Advertiser</th><th>Keyword</th><th>Mulai tayang</th><th>Umur</th><th>Salinan iklan</th><th>Status</th></tr></thead>
          <tbody>
            ${ads.slice(0, 60).map((a) => `
              <tr>
                <td>${esc(a.page_name || '—')}</td>
                <td>${esc(kwName(a.keyword_id))}</td>
                <td>${esc(fmtDate(a.start_date))}</td>
                <td>${age(a.age_days)}</td>
                <td class="small">${esc((a.body_text || '').slice(0, 140))}</td>
                <td>${a.active ? '<span class="pill">tayang</span>' : '<span class="pill muted">berhenti</span>'}</td>
              </tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada creative. Jalankan scanner Mac atau tunggu jadwalnya.</td></tr>'}
          </tbody>
        </table>
      </div>`;

    bind();
  }

  function bind() {
    const root = $('#view-adlib');
    $('[data-act="adlib-refresh"]', root)?.addEventListener('click', load);
    $('[data-act="adlib-addkw"]', root)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api('/api/adlib/keywords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: f.get('keyword'), country: f.get('country') }),
        });
        e.target.reset();
        toast('Keyword ditambahkan');
        load();
      } catch (ex) { toast(ex.message || 'Gagal menambah keyword'); }
    });
    $('[data-act="adlib-filter"]', root)?.addEventListener('change', (e) => {
      state.kwFilter = Number(e.target.value) || 0;
      draw();
    });
    root.querySelectorAll('[data-act="adlib-delkw"]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Hapus keyword beserta datanya?')) return;
        try {
          await api('/api/adlib/keywords/' + b.dataset.id, { method: 'DELETE' });
          toast('Keyword dihapus');
          load();
        } catch (ex) { toast(ex.message || 'Gagal menghapus'); }
      }));
  }

  S.viewHooks.adlib = load;
})();
