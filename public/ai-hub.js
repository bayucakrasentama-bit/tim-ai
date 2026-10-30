// AI Hub: halaman "AI & API Keys" (BYOK + model default), Model Picker, dan tab AI Studio baru:
// Playground, Arena (bandingkan 2–3 model), Gambar, Video, Suara. Prompt Builder di Studio mengirim prompt ke tab Gambar.
const S = window.siarin;
const { api, esc, toast, state } = S;
const $ = (sel, root = document) => root.querySelector(sel);
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const md = (t) => (window.timAi?.md ? window.timAi.md(t) : `<pre class="script">${esc(t)}</pre>`);
const manage = () => ['owner', 'admin'].includes(state.me?.user?.role);
const GROUPS = [
  ['Teks & reasoning (langsung ke provider)', ['openai', 'anthropic', 'gemini', 'deepseek', 'xai', 'qwen', 'groq', 'together', 'fireworks']],
  ['Agregator & model lokal', ['openrouter', 'custom']],
  ['Gambar & video', ['fal', 'replicate']],
  ['Suara / voice-over', ['elevenlabs']],
];
let hub = null; // { providers, default, media }
const models = {}; // cache daftar model per provider|kind
const usd = (v) => (v == null ? '–' : v < 0.01 ? `$${v.toFixed(5)}` : `$${v.toFixed(4)}`);

async function loadHub(force = false) {
  if (!hub || force) hub = await api('/api/ai/providers');
  return hub;
}
async function loadModels(provider, kind = 'text', force = false) {
  const k = `${provider}|${kind}`;
  if (!models[k] || force) models[k] = (await api(`/api/ai/models?provider=${provider}&kind=${kind}`)).models;
  return models[k];
}
const configured = (cap) => Object.values(hub.providers).filter((p) => p.configured && p.caps.includes(cap));

// ---------------- Model Picker ----------------
// Mengisi <select data-mp-provider> + <input data-mp-model list=…> di dalam root. Model diambil dari API provider.
function pickerHtml(id, cap, preset = {}) {
  const list = configured(cap);
  const prov = preset.provider && list.some((p) => p.id === preset.provider) ? preset.provider : list[0]?.id || '';
  return `<div class="mp" data-mp="${id}" data-cap="${cap}">
    <select data-mp-provider aria-label="Provider">${list.map((p) => `<option value="${p.id}" ${p.id === prov ? 'selected' : ''}>${esc(p.label.split(' (')[0])}</option>`).join('') || '<option value="">Belum ada key</option>'}</select>
    <input data-mp-model list="mp-${id}-list" placeholder="${list.length ? 'pilih / ketik ID model' : 'isi API key dulu'}" value="${esc(preset.model || '')}" autocomplete="off">
    <datalist id="mp-${id}-list"></datalist>
    ${cap === 'text' ? `<label class="toggle mp-think" hidden><input type="checkbox" data-mp-thinking> Extended thinking</label>` : ''}
    <span class="hint" data-mp-info></span></div>`;
}
async function bindPicker(root) {
  const fill = async () => {
    const prov = $('[data-mp-provider]', root).value;
    const dl = $('datalist', root);
    const info = $('[data-mp-info]', root);
    const think = $('.mp-think', root);
    if (think) think.hidden = prov !== 'anthropic';
    if (!prov) { dl.innerHTML = ''; return; }
    info.textContent = 'memuat model…';
    try {
      const list = await loadModels(prov, root.dataset.cap);
      dl.innerHTML = list.map((m) => `<option value="${esc(m.id)}">${esc(m.name !== m.id ? m.name : '')}${m.price ? ` · $${(m.price.in * 1e6).toFixed(2)}/$${(m.price.out * 1e6).toFixed(2)} per 1M` : ''}</option>`).join('');
      const input = $('[data-mp-model]', root);
      if (!input.value || !list.some((m) => m.id === input.value)) {
        if (!input.value && list[0]) input.value = list[0].id;
      }
      info.textContent = `${list.length} model${list.some((m) => m.suggested) ? ' (saran, boleh ketik ID lain)' : ''}`;
    } catch (ex) { info.textContent = ex.message; }
  };
  $('[data-mp-provider]', root).addEventListener('change', () => { $('[data-mp-model]', root).value = ''; fill(); });
  await fill();
}
const pickerValue = (root) => ({ provider: $('[data-mp-provider]', root)?.value, model: $('[data-mp-model]', root)?.value.trim(), thinking: !!$('[data-mp-thinking]', root)?.checked });
function priceOf(p) {
  const list = models[`${p.provider}|text`] || [];
  return list.find((m) => m.id === p.model)?.price || null;
}

// ---------------- Halaman AI & API Keys ----------------
async function drawKeys() {
  const view = $('#view-aikeys');
  view.innerHTML = '<h1>AI & API Keys</h1><div class="spinner"></div>';
  await loadHub(true);
  const P = hub.providers;
  const def = hub.default;
  const canEdit = manage();
  view.innerHTML = `<div class="page-head"><div><h1>AI & API Keys</h1>
    <p class="hint">Bring Your Own Key: pakai akun AI milik bisnis sendiri. Key disimpan di server TIM-AI dan tidak pernah ditampilkan lagi (hanya 4 karakter terakhir). Daftar model ditarik langsung dari provider, jadi model terbaru otomatis muncul.</p></div></div>
  <div class="card ai-default">
    <div class="label">Model default untuk semua fitur AI</div>
    <p class="hint">Dipakai Master BCS, AI Studio (ide/analisa/strategi), Launch Lab, LP Builder, dan saran balasan Inbox. ${def ? `Sekarang: <b>${esc(P[def.provider]?.label || def.provider)}</b> · <code>${esc(def.model)}</code>` : 'Belum diatur (memakai pengaturan Gemini/Claude lama).'}</p>
    ${canEdit ? `<div id="def-picker">${pickerHtml('def', 'text', def || {})}</div>
    <div class="btn-row left"><label class="hint">Temperature <input type="number" id="def-temp" min="0" max="2" step="0.1" value="${def?.temperature ?? ''}" placeholder="bawaan" class="inline-input" style="width:90px"></label>
    <button class="primary" id="def-save">Jadikan default</button>${def ? '<button class="ghost" id="def-clear">Kembali ke pengaturan lama</button>' : ''}</div>` : '<p class="hint">Hanya pemilik/admin yang bisa mengubah.</p>'}
  </div>
  ${GROUPS.map(([title, ids]) => `<h3>${title}</h3><div class="key-grid">${ids.map((id) => {
    const p = P[id];
    return `<form class="card key-card ${p.configured ? 'on' : ''}" data-key-form="${id}">
      <div class="row-between"><b>${esc(p.label)}</b><span class="tag ${p.configured ? 'ok' : ''}">${p.configured ? (p.source === 'env' ? 'aktif (env server)' : 'aktif') : 'belum'}</span></div>
      <div class="hint">${p.caps.map((c) => ({ text: 'teks', image: 'gambar', video: 'video', audio: 'suara' }[c])).join(' · ')}${p.keyUrl ? ` · <a href="${p.keyUrl}" target="_blank" rel="noopener">ambil key ↗</a>` : ''}</div>
      ${canEdit ? `<input name="key" type="password" autocomplete="new-password" data-lpignore="true" placeholder="${p.key_hint ? `${p.key_hint} tersimpan — isi untuk ganti` : id === 'custom' ? 'API key (opsional untuk Ollama)' : 'API key'}">
      ${p.custom || id === 'openrouter' ? `<input name="base_url" autocomplete="off" value="${esc(p.base_url || '')}" placeholder="${p.custom ? 'Base URL, mis. https://xxxx.ngrok-free.app/v1' : `Base URL (opsional, bawaan ${p.default_base})`}">` : ''}
      ${p.custom ? '<p class="hint">Ollama / LM Studio di komputer sendiri harus dibuka ke internet dulu (mis. ngrok/Cloudflare Tunnel), karena yang memanggil adalah server TIM-AI, bukan browser.</p>' : ''}
      <div class="btn-row left"><button class="primary small">Simpan</button>${p.configured ? `<button type="button" class="ghost small" data-key-test="${id}">Tes</button>` : ''}${p.key_hint || p.base_url ? `<button type="button" class="ghost small" data-key-del="${id}">Hapus</button>` : ''}<span class="hint" data-key-out></span></div>` : ''}
    </form>`;
  }).join('')}</div>`).join('')}`;
  if (canEdit) {
    const dp = $('#def-picker .mp');
    if (dp) await bindPicker(dp);
    $('#def-save')?.addEventListener('click', async () => {
      const v = pickerValue(dp);
      try {
        await api('/api/ai/default', json('PUT', { ...v, temperature: $('#def-temp').value }));
        state.config.ai = true;
        toast('Model default tersimpan');
        drawKeys();
      } catch (ex) { toast(ex.message); }
    });
    $('#def-clear')?.addEventListener('click', async () => { await api('/api/ai/default', json('PUT', {})); toast('Kembali ke pengaturan lama'); drawKeys(); });
  }
}
function bindKeysPage() {
  const view = $('#view-aikeys');
  view.addEventListener('submit', async (e) => {
    const id = e.target.dataset.keyForm;
    if (!id) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    try {
      await api(`/api/ai/providers/${id}`, json('PUT', v));
      delete models[`${id}|text`];
      toast('Tersimpan');
      drawKeys();
    } catch (ex) { toast(ex.message); }
  });
  view.addEventListener('click', async (e) => {
    const d = e.target.dataset;
    if (d.keyDel && confirm('Hapus API key ini?')) { await api(`/api/ai/providers/${d.keyDel}`, { method: 'DELETE' }); toast('Dihapus'); drawKeys(); }
    if (d.keyTest) {
      const out = $('[data-key-out]', e.target.closest('form'));
      out.textContent = 'mengetes…';
      try {
        const p = hub.providers[d.keyTest];
        const kind = p.caps.includes('text') ? 'text' : p.caps[0];
        if (kind === 'audio') { const v = await api('/api/ai/voices'); out.textContent = `✓ tersambung · ${v.voices.length} suara`; }
        else { const list = await loadModels(d.keyTest, kind, true); out.textContent = kind === 'text' ? `✓ tersambung · ${list.length} model` : '✓ key tersimpan (dites saat generate)'; }
      } catch (ex) { out.textContent = `✕ ${ex.message}`; }
    }
  });
}

// ---------------- AI Studio: tab baru ----------------
const NEW_TABS = { playground: 'Playground', arena: 'Arena (bandingkan model)', image: 'Gambar', video: 'Video', voice: 'Suara' };
let presets = [];
async function loadPresets() { presets = await api('/api/ai/presets').catch(() => []); return presets; }
const noKey = (cap) => `<div class="check bad small-note">Belum ada provider ${cap} yang aktif. Isi API key di <button class="link" data-goto="aikeys">Pengaturan → AI & API Keys</button>.</div>`;
const estTokens = (s) => Math.ceil(String(s || '').length / 4);

function paramHtml() {
  return `<div class="form-grid">
    <div class="span-2"><label class="label" for="pg-preset">Brand Voice / System prompt</label>
      <div class="btn-row left"><select id="pg-preset"><option value="">— tanpa preset —</option>${presets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
      <button type="button" class="ghost small" id="pg-preset-save">Simpan sebagai preset</button><button type="button" class="ghost small" id="pg-preset-del">Hapus preset</button></div>
      <textarea id="pg-system" rows="3" placeholder="mis. Kamu copywriter brand madu herbal. Bahasa santai, hindari klaim medis, selalu tutup dengan CTA WhatsApp."></textarea></div>
    <div><label class="label" for="pg-temp">Temperature <span id="pg-temp-v">0.7</span></label><input id="pg-temp" type="range" min="0" max="2" step="0.1" value="0.7"></div>
    <div><label class="label" for="pg-max">Max tokens <span id="pg-max-v">2000</span></label><input id="pg-max" type="range" min="256" max="32000" step="256" value="2000"></div>
  </div>`;
}
function bindParams(root) {
  const sync = () => { $('#pg-temp-v', root).textContent = $('#pg-temp', root).value; $('#pg-max-v', root).textContent = $('#pg-max', root).value; };
  $('#pg-temp', root).addEventListener('input', sync);
  $('#pg-max', root).addEventListener('input', sync);
  $('#pg-preset', root).addEventListener('change', (e) => { const p = presets.find((x) => x.id === e.target.value); if (p) $('#pg-system', root).value = p.system; });
  $('#pg-preset-save', root).addEventListener('click', async () => {
    const name = prompt('Nama preset (mis. Brand Voice Zestmag):');
    if (!name) return;
    presets = await api('/api/ai/presets', json('PUT', [...presets, { name, system: $('#pg-system', root).value }]));
    toast('Preset tersimpan');
    $('#pg-preset', root).innerHTML = `<option value="">— tanpa preset —</option>${presets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}`;
  });
  $('#pg-preset-del', root).addEventListener('click', async () => {
    const id = $('#pg-preset', root).value;
    if (!id) return;
    presets = await api('/api/ai/presets', json('PUT', presets.filter((p) => p.id !== id)));
    $('#pg-preset', root).innerHTML = `<option value="">— tanpa preset —</option>${presets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}`;
  });
}
const params = (root) => ({ system: $('#pg-system', root).value, temperature: Number($('#pg-temp', root).value), max_tokens: Number($('#pg-max', root).value) });

function resultCard(r) {
  if (!r.ok && r.error) return `<div class="card arena-col"><div class="label">${esc(r.provider)} · ${esc(r.model)}</div><div class="check bad">${esc(r.error)}</div></div>`;
  return `<div class="card arena-col"><div class="row-between"><div class="label">${esc(r.provider)} · <code>${esc(r.model)}</code></div>
    <div class="btn-row"><button class="ghost small" data-copy-out>Salin</button><button class="ghost small" data-to-planner>→ Planner</button></div></div>
    <div class="arena-meta mono">${(r.ms / 1000).toFixed(1)} dtk · in ${r.usage?.input ?? '?'} · out ${r.usage?.output ?? '?'} tok · ${usd(r.cost_usd)}</div>
    <div class="md arena-out" data-raw="${esc(r.text)}">${md(r.text)}</div></div>`;
}

async function tabPlayground(panel, output) {
  await loadPresets();
  if (!configured('text').length) { panel.innerHTML = noKey('teks'); output.innerHTML = ''; return; }
  panel.innerHTML = `<div class="label">Model</div>${pickerHtml('pg', 'text', hub.default || {})}${paramHtml()}
    <label class="label" for="pg-prompt">Prompt</label><textarea id="pg-prompt" rows="6" placeholder="mis. Tulis 10 hook TikTok untuk madu anak susah makan, gaya ibu-ibu relatable"></textarea>
    <div class="row-between"><span class="hint mono" id="pg-est"></span><button class="primary ai" id="pg-run">✨ Jalankan</button></div>`;
  output.innerHTML = '';
  await bindPicker($('.mp', panel));
  bindParams(panel);
  const est = () => {
    const p = pickerValue($('.mp', panel));
    const tin = estTokens($('#pg-system', panel).value) + estTokens($('#pg-prompt', panel).value);
    const price = priceOf(p);
    $('#pg-est', panel).textContent = `≈ ${tin} token input${price ? ` · estimasi maks ${usd(tin * price.in + Number($('#pg-max', panel).value) * price.out)}` : ''}`;
  };
  panel.addEventListener('input', est);
  est();
  $('#pg-run', panel).addEventListener('click', async () => {
    const p = pickerValue($('.mp', panel));
    const btn = $('#pg-run', panel);
    btn.disabled = true;
    output.innerHTML = '<div class="card"><div class="spinner"></div></div>';
    try {
      const r = await api('/api/ai/chat', json('POST', { ...p, ...params(panel), prompt: $('#pg-prompt', panel).value }));
      output.innerHTML = resultCard({ ok: true, ...r });
    } catch (ex) { output.innerHTML = `<div class="check bad">${esc(ex.message)}</div>`; }
    btn.disabled = false;
  });
}

async function tabArena(panel, output) {
  await loadPresets();
  const list = configured('text');
  if (!list.length) { panel.innerHTML = noKey('teks'); output.innerHTML = ''; return; }
  panel.innerHTML = `<p class="hint">Satu prompt ke 2–3 model sekaligus, hasil berdampingan dengan waktu, token, dan biaya. Pilih yang terbaik, salin, atau kirim ke Planner.</p>
    <div class="arena-pickers">${[0, 1, 2].map((i) => `<div><div class="label">Model ${i + 1}${i === 2 ? ' (opsional)' : ''}</div>${pickerHtml(`ar${i}`, 'text', { provider: list[i % list.length].id })}</div>`).join('')}</div>
    ${paramHtml()}
    <label class="label" for="ar-prompt">Prompt</label><textarea id="ar-prompt" rows="5" placeholder="mis. Buat 5 hook iklan Meta untuk madu anak, target ibu 25-35"></textarea>
    <div class="row-between"><label class="toggle"><input type="checkbox" id="ar-use3"> Pakai model ke-3</label><button class="primary ai" id="ar-run">⚔️ Bandingkan</button></div>`;
  output.innerHTML = '';
  for (const el of panel.querySelectorAll('.mp')) await bindPicker(el);
  bindParams(panel);
  $('#ar-run', panel).addEventListener('click', async () => {
    const pk = [...panel.querySelectorAll('.mp')].map(pickerValue).slice(0, $('#ar-use3', panel).checked ? 3 : 2);
    const btn = $('#ar-run', panel);
    btn.disabled = true;
    output.innerHTML = `<div class="arena-grid">${pk.map(() => '<div class="card"><div class="spinner"></div></div>').join('')}</div>`;
    try {
      const r = await api('/api/ai/arena', json('POST', { ...params(panel), prompt: $('#ar-prompt', panel).value, targets: pk }));
      output.innerHTML = `<div class="arena-grid">${r.results.map(resultCard).join('')}</div>`;
    } catch (ex) { output.innerHTML = `<div class="check bad">${esc(ex.message)}</div>`; }
    btn.disabled = false;
  });
}

// ---------------- Gambar & video ----------------
function jobCard(j) {
  const media = j.status === 'done' && j.result_url
    ? (j.kind === 'video' ? `<video src="${esc(j.result_url)}" controls playsinline></video>` : `<a href="${esc(j.result_url)}" target="_blank" rel="noopener"><img src="${esc(j.result_url)}" alt="" loading="lazy"></a>`)
    : j.status === 'failed' ? `<div class="check bad small-note">${esc(j.error || 'gagal')}</div>` : '<div class="spinner"></div>';
  return `<div class="card gen-card" data-job="${j.id}" data-status="${j.status}">${media}
    <div class="hint gen-meta"><b>${esc(j.provider)}</b> · ${esc(j.model)}</div><div class="gen-prompt">${esc(j.prompt)}</div>
    <div class="btn-row left">${j.result_url ? `<a class="btn small" href="${esc(j.result_url)}" target="_blank" rel="noopener" download>Unduh</a><button class="ghost small" data-copy-url="${esc(j.result_url)}">Salin link</button>` : ''}
    <button class="ghost small" data-copy-prompt>Salin prompt</button><button class="asset-del static" data-job-del="${j.id}" aria-label="Hapus">✕</button></div></div>`;
}
let pollTimer = null;
async function tabMedia(kind, panel, output) {
  const cap = kind;
  if (!configured(cap).length) { panel.innerHTML = noKey(kind === 'video' ? 'video' : 'gambar'); output.innerHTML = ''; return; }
  panel.innerHTML = `<div class="label">Model ${kind === 'video' ? 'video' : 'gambar'}</div>${pickerHtml(`md-${kind}`, cap)}
    <label class="label" for="md-prompt">Prompt</label><textarea id="md-prompt" rows="4" placeholder="${kind === 'video' ? 'mis. Close-up madu dituang ke sendok kayu, cahaya pagi hangat, slow motion, gaya iklan premium' : 'mis. Foto produk botol madu di meja kayu, cahaya natural, latar daun, gaya katalog premium'}"></textarea>
    <div class="form-grid"><div><label class="label" for="md-aspect">Rasio</label><select id="md-aspect"><option>1:1</option><option>9:16</option><option>16:9</option><option>4:5</option></select></div>
    ${kind === 'video' ? '<div><label class="label" for="md-dur">Durasi (detik)</label><select id="md-dur"><option>5</option><option>10</option></select></div><div class="span-2"><label class="label" for="md-img">Gambar awal (opsional, link https — image-to-video)</label><input id="md-img" placeholder="https://"></div>' : ''}</div>
    <div class="row-between"><span class="hint">${kind === 'video' ? 'Video biasanya selesai 1–5 menit; halaman ini memantau otomatis.' : 'Hasil disimpan ke penyimpanan TIM-AI supaya link-nya tidak kedaluwarsa.'}</span><button class="primary ai" id="md-run">✨ Generate</button></div>`;
  await bindPicker($('.mp', panel));
  const drawGallery = async () => {
    const jobs = (await api('/api/ai/jobs')).filter((j) => j.kind === kind);
    output.innerHTML = jobs.length ? `<div class="gen-grid">${jobs.map(jobCard).join('')}</div>` : '<div class="empty">Belum ada hasil.</div>';
    clearInterval(pollTimer);
    if (jobs.some((j) => ['running', 'queued'].includes(j.status))) {
      pollTimer = setInterval(async () => {
        if (!output.isConnected || !document.querySelector('#view-ai.active, #view-studio.active')) return clearInterval(pollTimer);
        const pending = [...output.querySelectorAll('[data-status=running], [data-status=queued]')];
        if (!pending.length) return clearInterval(pollTimer);
        for (const el of pending) {
          const j = await api(`/api/ai/jobs/${el.dataset.job}`).catch(() => null);
          if (j && j.status !== 'running') el.outerHTML = jobCard(j);
        }
      }, 5000);
    }
  };
  await drawGallery();
  $('#md-run', panel).addEventListener('click', async () => {
    const p = pickerValue($('.mp', panel));
    const btn = $('#md-run', panel);
    btn.disabled = true;
    btn.textContent = kind === 'video' ? 'Mengirim…' : 'Membuat gambar… (±10–60 dtk)';
    try {
      const j = await api('/api/ai/media', json('POST', { kind, ...p, prompt: $('#md-prompt', panel).value, aspect: $('#md-aspect', panel).value,
        duration: $('#md-dur', panel)?.value, image_url: $('#md-img', panel)?.value.trim() || null }));
      toast(j.status === 'done' ? 'Selesai' : j.status === 'failed' ? `Gagal: ${j.error}` : 'Diproses, hasil muncul otomatis');
      await drawGallery();
    } catch (ex) { toast(ex.message); }
    btn.disabled = false;
    btn.textContent = '✨ Generate';
  });
}

async function tabVoice(panel, output) {
  if (!configured('audio').length) { panel.innerHTML = noKey('suara'); output.innerHTML = ''; return; }
  panel.innerHTML = '<div class="spinner"></div>';
  let voices = [];
  try { voices = (await api('/api/ai/voices')).voices; } catch (ex) { panel.innerHTML = `<div class="check bad">${esc(ex.message)}</div>`; return; }
  panel.innerHTML = `<div class="form-grid"><div><label class="label" for="tts-voice">Suara</label><select id="tts-voice">${voices.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}${v.labels?.accent ? ` · ${esc(v.labels.accent)}` : ''}${v.category === 'cloned' ? ' · clone' : ''}</option>`).join('')}</select></div>
    <div><label class="label" for="tts-model">Model</label><input id="tts-model" list="tts-models" value="eleven_multilingual_v2"><datalist id="tts-models">${(hub.media.elevenlabs?.audio || []).map((m) => `<option value="${m}">`).join('')}</datalist></div></div>
    <label class="label" for="tts-text">Naskah voice-over</label><textarea id="tts-text" rows="6" placeholder="Tempel naskah VO di sini (maks 5.000 karakter)."></textarea>
    <div class="row-between"><span class="hint mono" id="tts-count">0 karakter</span><button class="primary ai" id="tts-run">🎙 Buat suara</button></div>`;
  output.innerHTML = '';
  $('#tts-text', panel).addEventListener('input', (e) => { $('#tts-count', panel).textContent = `${e.target.value.length} karakter`; });
  $('#tts-run', panel).addEventListener('click', async () => {
    const btn = $('#tts-run', panel);
    btn.disabled = true;
    try {
      const r = await api('/api/ai/tts', json('POST', { text: $('#tts-text', panel).value, voice_id: $('#tts-voice', panel).value, model: $('#tts-model', panel).value }));
      output.innerHTML = `<div class="card"><audio src="${esc(r.url)}" controls style="width:100%"></audio><div class="btn-row left"><a class="btn small" href="${esc(r.url)}" download="voice-over.mp3" target="_blank" rel="noopener">Unduh MP3</a></div></div>` + output.innerHTML;
    } catch (ex) { toast(ex.message); }
    btn.disabled = false;
  });
}

const TAB_FN = { playground: tabPlayground, arena: tabArena, image: (p, o) => tabMedia('image', p, o), video: (p, o) => tabMedia('video', p, o), voice: tabVoice };

function ensureAiTabs() {
  const tabs = $('#ai-tabs');
  if (!tabs || tabs.querySelector('[data-hub]')) return;
  tabs.insertAdjacentHTML('beforeend', Object.entries(NEW_TABS).map(([k, l]) => `<button data-hub="${k}">${l}</button>`).join(''));
  tabs.addEventListener('click', async (e) => {
    const k = e.target.dataset.hub;
    if (!k) return;
    e.stopImmediatePropagation();
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
    $('#ai-panel').innerHTML = '<div class="spinner"></div>';
    $('#ai-output').innerHTML = '';
    try { await loadHub(); await TAB_FN[k]($('#ai-panel'), $('#ai-output')); } catch (ex) { $('#ai-panel').innerHTML = `<div class="check bad">${esc(ex.message)}</div>`; }
  }, true);
}


// Aksi umum di hasil AI.
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (t.dataset.copyUrl) navigator.clipboard?.writeText(t.dataset.copyUrl).then(() => toast('Link disalin'));
  if (t.matches('[data-copy-prompt]')) navigator.clipboard?.writeText(t.closest('.gen-card').querySelector('.gen-prompt').textContent).then(() => toast('Prompt disalin'));
  if (t.dataset.jobDel) { await api(`/api/ai/jobs/${t.dataset.jobDel}`, { method: 'DELETE' }).catch(() => {}); t.closest('.gen-card').remove(); }
  if (t.matches('[data-copy-out]')) navigator.clipboard?.writeText(t.closest('.arena-col').querySelector('.arena-out').dataset.raw).then(() => toast('Disalin'));
  if (t.matches('[data-to-planner]')) {
    const col = t.closest('.arena-col');
    const text = col.querySelector('.arena-out').dataset.raw;
    try {
      await api('/api/content', json('POST', { title: text.split('\n').find((l) => l.trim())?.replace(/^[#*\s-]+/, '').slice(0, 80) || 'Hasil AI', status: 'ide', notes: `Dari AI (${col.querySelector('.label').textContent.trim()}):\n\n${text}` }));
      toast('Masuk ke Planner (kolom Ide)');
    } catch (ex) { toast(ex.message); }
  }
});

bindKeysPage();
S.viewHooks.aikeys = () => drawKeys().catch((ex) => toast(ex.message));
const prevAi = S.viewHooks.ai;
S.viewHooks.ai = () => { ensureAiTabs(); prevAi?.(); };
window.timHub = { loadHub, pickerHtml, bindPicker, pickerValue };
