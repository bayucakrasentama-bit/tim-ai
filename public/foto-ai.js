/* Foto AI — studio foto AI ala MantraFoto: pilih fitur, upload foto, hasil siap pakai. */
(() => {
  const S = window.siarin;
  const { api, esc, toast } = S;
  const $ = (sel, el = document) => el.querySelector(sel);
  const v = () => $('#view-fotoai');
  const R = () => '/api/foto-ai';
  let state = { tools: [], sel: null, photos: [], ratio: '', results: [] };

  const ratioLabel = { '1:1': 'Persegi 1:1', '3:4': 'Portrait 3:4', '4:3': '4:3', '16:9': 'Landscape 16:9', '9:16': 'Story 9:16' };

  function toolCards() {
    return state.tools.map((t) => `
      <button class="btn ${state.sel === t.id ? 'primary' : ''}" data-tool="${t.id}" style="flex-direction:column;align-items:flex-start;gap:4px;text-align:left;min-width:180px">
        <b>${t.icon} ${esc(t.name)}</b><small class="hint">${esc(t.desc)}</small>
      </button>`).join('');
  }

  function previewImgs() {
    return state.photos.map((p, i) => `
      <div style="position:relative;display:inline-block;margin:4px">
        <img src="${p}" style="width:96px;height:96px;object-fit:cover;border-radius:10px">
        <button class="btn" data-rm="${i}" style="position:absolute;top:-6px;right:-6px;padding:0 7px;font-size:12px">✕</button>
      </div>`).join('');
  }

  function resultsHtml() {
    if (!state.results.length) return '';
    return `<h3>Hasil</h3>` + state.results.map((r, i) => `
      <div class="card" style="margin-bottom:12px">
        <img src="${r.url}" style="max-width:100%;border-radius:12px">
        <p class="hint" style="margin:6px 0">${esc(r.prompt).slice(0, 180)}…</p>
        <div class="btnrow">
          <a class="btn primary" href="${r.url}" download="foto-ai-${i + 1}.png">⬇️ Download</a>
          <button class="btn" data-copy="${i}">📋 Salin Prompt</button>
        </div>
      </div>`).join('');
  }

  function draw() {
    const t = state.tools.find((x) => x.id === state.sel);
    v().innerHTML = `
      <h2>📸 Foto AI</h2>
      <p class="hint">Studio foto AI: photoshoot produk, model AI, food, pas foto, kreatif iklan — upload foto, pilih fitur, hasil siap posting.</p>
      <div class="card">
        <h3>1. Pilih fitur</h3>
        <div class="btnrow">${toolCards()}</div>
      </div>
      ${t ? `
      <div class="card">
        <h3>2. Foto & opsi — ${t.icon} ${esc(t.name)}</h3>
        <p class="hint">${esc(t.desc)} · hasil keluar satu per satu</p>
        <input type="file" id="fx-photo" accept="image/*" multiple class="btn">
        <div style="margin:8px 0">${previewImgs()}</div>
        <div class="btnrow">
          ${t.fields.map((f) => `<input id="ff-${f.k}" class="btn" style="min-width:180px" placeholder="${esc(f.label)}">`).join('')}
          <input id="ff-extra" class="btn" style="min-width:180px" placeholder="Instruksi tambahan (opsional)">
          <select id="ff-ratio" class="btn">
            <option value="">Rasio (default)</option>
            ${Object.entries(ratioLabel).map(([k, l]) => `<option value="${k}" ${state.ratio === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <button class="btn primary" id="fx-go">✨ Buat Foto (${Math.min(state.photos.length || 1, 4)})</button>
        </div>
      </div>` : '<div class="card"><p class="hint">Pilih fitur dulu ya.</p></div>'}
      <div id="fx-out">${resultsHtml()}</div>`;
    bind();
  }

  function bind() {
    v().querySelectorAll('[data-tool]').forEach((el) => el.onclick = () => { state.sel = el.dataset.tool; draw(); });
    v().querySelectorAll('[data-rm]').forEach((el) => el.onclick = () => { state.photos.splice(+el.dataset.rm, 1); draw(); });
    v().querySelectorAll('[data-copy]').forEach((el) => el.onclick = () => {
      navigator.clipboard.writeText(state.results[+el.dataset.copy].prompt); toast('Prompt disalin');
    });
    const file = $('#fx-photo');
    if (file) file.onchange = async () => {
      for (const f of [...file.files].slice(0, 4)) {
        state.photos.push(await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); }));
      }
      draw();
    };
    const go = $('#fx-go');
    if (go) go.onclick = async () => {
      if (!state.photos.length) return toast('Upload foto dulu');
      go.disabled = true; go.textContent = 'Memproses…';
      const fields = {};
      (state.tools.find((x) => x.id === state.sel)?.fields || []).forEach((f) => { fields[f.k] = $(`#ff-${f.k}`)?.value || ''; });
      const body = { tool: state.sel, photos: state.photos.slice(0, 4), fields, extra: $('#ff-extra')?.value || '', ratio: $('#ff-ratio')?.value || '' };
      const res = await api('POST', `${R()}/generate`, body);
      if (res.error) toast(res.error);
      if (res.result) { state.results.unshift(res.result); draw(); toast('Foto jadi!'); }
      else { go.disabled = false; go.textContent = '✨ Buat Foto'; }
    };
  }

  S.viewHooks.fotoai = async () => {
    if (!state.tools.length) {
      const res = await api('GET', `${R()}/tools`);
      state.tools = res.tools || [];
    }
    draw();
  };
})();
