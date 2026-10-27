// Data bersama per brand (server: /api/store, src/brand-store.js) dengan cache sinkron di browser.
// Dipakai agents.js (riwayat & aktivitas agen, kalkulator, Kantor AI), cs-closer.js (CS AI) dan today.js (Hari Ini).
// - get/set sinkron dari cache; set dikirim ke server (ditunda sebentar per kunci).
// - push/patch/remove untuk daftar (order, aktivitas): diubah per item di server, jadi 2 orang bisa menulis bersamaan.
// - Saat pertama kali dimuat, data lama yang masih tersimpan di browser ini dipindahkan ke server (sekali saja).
const S = window.siarin;
const { api } = S;
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const PREFIXES = ['agents.', 'cs.', 'today.'];
const STALE_MS = 20_000;
// Kunci lama di localStorage → kunci server. Simulator chat & tanda "terkirim" broadcast tetap per browser.
const LEGACY = [
  { local: (b) => `timai.agents.${b}.`, server: 'agents.', skip: /^cs\./ },
  { local: (b) => `timai.cs.${b}.`, server: 'cs.', skip: /^(sim\.|bc\.sent$)/ },
];

const brands = new Map(); // brandId -> { data, at, promise }
const timers = new Map();
const entry = () => {
  const id = S.state.brandId || 0;
  if (!brands.has(id)) brands.set(id, { data: {}, at: 0, promise: null });
  return brands.get(id);
};

async function migrate(e) {
  const b = S.state.brandId || 0;
  const flag = `timai.store.migrated.${b}`;
  try { if (localStorage.getItem(flag)) return; } catch { return; }
  const uploads = [];
  for (const { local, server, skip } of LEGACY) {
    const pre = local(b);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(pre)) continue;
      const rest = k.slice(pre.length);
      if (skip.test(rest)) continue;
      const key = server + rest;
      if (e.data[key] != null) continue;
      try { e.data[key] = JSON.parse(localStorage.getItem(k)); } catch { continue; }
      uploads.push(api(`/api/store/${encodeURIComponent(key)}`, json('PUT', { value: e.data[key] })));
    }
  }
  await Promise.all(uploads);
  try { localStorage.setItem(flag, '1'); } catch { /* mode privat */ }
}

async function load(e) {
  const parts = await Promise.all(PREFIXES.map((p) => api(`/api/store-prefix/${encodeURIComponent(p)}`)));
  const before = JSON.stringify(e.data);
  const fresh = Object.assign({}, ...parts);
  // Kunci yang sedang menunggu dikirim jangan ditimpa data server yang lebih lama.
  for (const k of Object.keys(e.data)) if (timers.has(`${S.state.brandId}|${k}`)) fresh[k] = e.data[k];
  e.data = fresh;
  await migrate(e);
  e.at = Date.now();
  return JSON.stringify(e.data) !== before;
}

window.timStore = {
  isReady: () => entry().at > 0,
  // Muat (atau segarkan kalau sudah > 20 detik). Hasil: true kalau ada data yang berubah.
  ready({ refresh = false } = {}) {
    const e = entry();
    if (e.promise) return e.promise;
    if (e.at && !(refresh && Date.now() - e.at > STALE_MS)) return Promise.resolve(false);
    e.promise = load(e).catch(() => { e.at = e.at || Date.now(); return false; }).finally(() => { e.promise = null; });
    return e.promise;
  },
  get(key, d) {
    const v = entry().data[key];
    return v == null ? (typeof d === 'object' && d !== null ? structuredClone(d) : d) : structuredClone(v);
  },
  set(key, value) {
    const e = entry();
    e.data[key] = structuredClone(value);
    const t = `${S.state.brandId}|${key}`;
    clearTimeout(timers.get(t));
    timers.set(t, setTimeout(() => {
      timers.delete(t);
      api(`/api/store/${encodeURIComponent(key)}`, json('PUT', { value })).catch((ex) => S.toast(`Gagal menyimpan: ${ex.message}`));
    }, 400));
  },
  async push(key, item, cap = 500) {
    const e = entry();
    e.data[key] = [item, ...(e.data[key] || []).filter((x) => String(x.id) !== String(item.id))].slice(0, cap);
    e.data[key] = await api(`/api/store/${encodeURIComponent(key)}/items`, json('POST', { item, cap })).catch((ex) => { S.toast(`Gagal menyimpan: ${ex.message}`); return e.data[key]; });
    return e.data[key];
  },
  async patch(key, id, patch) {
    const e = entry();
    e.data[key] = (e.data[key] || []).map((x) => (String(x.id) === String(id) ? { ...x, ...patch } : x));
    e.data[key] = await api(`/api/store/${encodeURIComponent(key)}/items/${encodeURIComponent(id)}`, json('PATCH', { patch })).catch((ex) => { S.toast(`Gagal menyimpan: ${ex.message}`); return e.data[key]; });
    return e.data[key];
  },
  async remove(key, id) {
    const e = entry();
    e.data[key] = (e.data[key] || []).filter((x) => String(x.id) !== String(id));
    e.data[key] = await api(`/api/store/${encodeURIComponent(key)}/items/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((ex) => { S.toast(`Gagal menyimpan: ${ex.message}`); return e.data[key]; });
    return e.data[key];
  },
};

// Halaman yang memakai data bersama: tunggu data siap sebelum digambar, lalu segarkan di belakang
// (gambar ulang hanya kalau data dari laptop lain berubah).
export function withStore(render) {
  return function wrapped(...args) {
    const st = window.timStore;
    if (!st.isReady()) {
      const view = document.querySelector('.view.active');
      if (view && !view.innerHTML.trim()) view.innerHTML = '<div class="spinner"></div>';
      st.ready().then(() => render(...args));
      return;
    }
    render(...args);
    // Jangan gambar ulang saat pengguna sedang mengetik di halaman ini.
    const typing = () => document.activeElement?.closest?.('.view.active') && document.activeElement.matches('input, textarea, select');
    st.ready({ refresh: true }).then((changed) => { if (changed && !typing()) render(...args); });
  };
}
window.timStore.withStore = withStore;
