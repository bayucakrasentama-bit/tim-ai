// Asisten AI tunggal: satu pintu untuk semua agen AI. Panel samping (tombol di sidebar atau Ctrl+J) yang tahu halaman
// yang sedang dibuka, menyarankan agen yang cocok, dan menerima permintaan bebas: AI memilih agen + mengisi brief-nya
// sendiri, lalu menjalankannya di panel (atau langsung menjawab kalau tidak perlu agen).
const S = window.siarin;
const { esc, toast, state } = S;
const $ = (sel, el = document) => el.querySelector(sel);
const A = () => window.timAgents;
const md = (t) => (window.timAi?.md ? window.timAi.md(t) : `<pre class="script">${esc(t)}</pre>`);
const ic = (n) => window.timIcon?.(n) || '';

// Saran per halaman: [agen yang cocok], [contoh permintaan].
const CONTEXT = {
  today: [['metrica', 'hook', 'produk'], ['Apa 3 prioritas paling penting hari ini?', 'Buat 10 hook untuk produk terlaris']],
  dashboard: [['metrica', 'hook'], ['Ringkas performa 30 hari terakhir', 'Ide konten minggu depan']],
  planner: [['hook', 'emosi', 'concept'], ['Buat 10 hook Reels untuk promo gajian', 'Ide konten 7 hari untuk tebusmurah']],
  calendar: [['hook', 'concept'], ['Susun ide konten untuk tanggal kosong minggu ini']],
  compose: [['hook', 'tagline'], ['Tulis caption Instagram yang mengajak beli', 'Buat 5 variasi caption singkat']],
  studio: [['concept', 'logo', 'identity'], ['Buat konsep visual feed untuk promo bulan ini']],
  adv: [['metrica', 'scaling', 'rules', 'hook'], ['Iklan mana yang harus dimatikan?', 'Susun automated rules untuk target ROAS 2,5']],
  mp: [['metrica', 'scaling'], ['Bagaimana menaikkan ROAS iklan marketplace?']],
  'agents-adv': [['metrica', 'scaling', 'rules'], ['Buat rencana scaling budget 7 hari']],
  inbox: [[], ['Buat balasan sopan untuk pelanggan yang komplain paket telat', 'Template jawaban pertanyaan ongkir']],
  closer: [[], ['Buat 3 pesan follow-up untuk pelanggan yang belum bayar', 'Tulis sapaan pembuka CS yang ramah']],
  cs: [[], ['Buat template balasan untuk retur barang rusak']],
  reports: [['metrica'], ['Apa insight terpenting dari laporan minggu ini?']],
  analytics: [['hook', 'metrica'], ['Konten seperti apa yang paling banyak ditonton?']],
};
const VIEW_LABEL = () => {
  const v = document.querySelector('.view.active')?.id.replace('view-', '') || 'today';
  const hub = document.querySelector('#nav [data-hub].active .nav-label')?.textContent;
  const sub = document.querySelector('.hub-tabs button.active')?.textContent;
  return { v, label: [hub, sub && sub !== hub ? sub : null].filter(Boolean).join(' › ') || document.querySelector('.view.active h1')?.textContent || 'TIM-AI' };
};

const st = { open: false, log: [], busy: false };
const panel = document.createElement('aside');
panel.className = 'asst';
panel.setAttribute('aria-label', 'Asisten AI');
panel.hidden = true;
document.body.append(panel);

function render() {
  const { v, label } = VIEW_LABEL();
  const [ids, prompts] = CONTEXT[v] || [[], ['Apa yang bisa kamu bantu di halaman ini?']];
  const agents = ids.map((id) => A()?.AGENTS.find((a) => a.id === id)).filter(Boolean);
  panel.innerHTML = `<div class="asst-head"><div><b>${ic('sparkles')} Asisten AI</b><div class="hint">Konteks: ${esc(label)} · ${esc(state.brands.find((b) => b.id === state.brandId)?.name || '')}</div></div>
      <div class="btn-row">${st.log.length ? '<button class="ghost small" data-as-reset>Baru</button>' : ''}<button class="icon-btn" data-as-close aria-label="Tutup">✕</button></div></div>
    <div class="asst-body">${st.log.length ? st.log.map((m) => (m.role === 'user' ? `<div class="msg user">${esc(m.text)}</div>`
      : `<div class="asst-ans">${m.agent ? `<div class="hint">${esc(m.agent.name)} · ${esc(A().TEAM[m.agent.team]?.label || '')}</div>` : ''}<div class="md">${md(m.text)}</div>
        ${m.error ? '' : `<div class="btn-row left"><button class="ghost small" data-as-copy="${st.log.indexOf(m)}">Salin</button><button class="ghost small" data-as-plan="${st.log.indexOf(m)}">Jadikan kartu Planner</button>${m.agent ? `<button class="ghost small" data-as-open="${m.agent.id}">Buka di halaman agen</button>` : ''}</div>`}</div>`)).join('')
      : `<p class="hint">Tulis apa yang kamu butuhkan. Asisten memilih agen yang tepat dan mengisi brief-nya sendiri.</p>
        ${agents.length ? `<div class="label">Agen yang cocok di halaman ini</div><div class="asst-chips">${agents.map((a) => `<button class="ghost small" data-as-agent="${a.id}">${esc(a.icon)} ${esc(a.name)}</button>`).join('')}</div>` : ''}
        <div class="label">Contoh permintaan</div><div class="asst-chips">${prompts.map((p, i) => `<button class="ghost small" data-as-prompt="${i}">${esc(p)}</button>`).join('')}</div>`}
      ${st.busy ? '<div class="asst-ans"><span class="spinner inline"></span> Asisten sedang bekerja… (20–60 detik)</div>' : ''}</div>
    <form class="chat-form asst-form"><textarea rows="2" placeholder="${st.agent ? `Brief untuk ${esc(st.agent.name)}…` : 'mis. buat 10 hook untuk promo gajian'}" ${st.busy ? 'disabled' : ''}></textarea><button class="primary" ${st.busy ? 'disabled' : ''}>Kirim</button></form>
    ${st.agent ? `<div class="hint asst-pick">Agen dipilih: <b>${esc(st.agent.name)}</b> · <button class="link" data-as-unpick>batal</button></div>` : ''}`;
  const body = $('.asst-body', panel);
  body.scrollTop = body.scrollHeight;
  if (!st.busy) $('textarea', panel).focus();
}

async function ask(text) {
  const { v, label } = VIEW_LABEL();
  st.log.push({ role: 'user', text });
  st.busy = true; render();
  try {
    const { AGENTS, chat, parseJson, brandCtx, generate } = A();
    let agent = st.agent;
    let values = null;
    if (agent) {
      values = parseJson(await chat(`Kamu pengisi brief.${brandCtx()} Jawab HANYA JSON valid.`, `Isi brief agen "${agent.name}" dari permintaan: "${text}"\nField: ${agent.fields.map((f) => `${f.k} (${f.label}${f.opts ? `; pilih salah satu: ${f.opts.join(' / ')}` : ''})`).join(', ')}\nFormat: {"values":{...}}`, { temperature: 0.2, max_tokens: 800 })).values || {};
    } else {
      const catalog = AGENTS.map((a) => `${a.id} | ${a.name}: ${a.desc} | field: ${a.fields.map((f) => f.k).join(', ')}`).join('\n');
      const route = parseJson(await chat(`Kamu Asisten AI di aplikasi TIM-AI (operasional marketing: konten, iklan, CS).${brandCtx()} Pengguna sedang di halaman "${label}". Jawab HANYA JSON valid.`,
        `Permintaan: "${text}"\n\nAgen tersedia (id | nama: fungsi | field):\n${catalog}\n\nKalau permintaan cocok dengan salah satu agen, pakai agen itu dan isi field brief dari permintaan & konteks halaman:\n{"mode":"agent","agent":"id","values":{...}}\nKalau tidak perlu agen (pertanyaan umum, pesan/balasan singkat, saran), jawab langsung dalam Markdown Bahasa Indonesia yang praktis:\n{"mode":"answer","answer":"..."}`, { temperature: 0.3, max_tokens: 2500 }));
      if (route.mode === 'agent' && AGENTS.some((a) => a.id === route.agent)) { agent = AGENTS.find((a) => a.id === route.agent); values = route.values || {}; }
      else { st.log.push({ role: 'assistant', text: route.answer || 'Maaf, belum bisa menjawab. Coba tulis lebih spesifik.' }); }
    }
    if (agent) {
      for (const f of agent.fields) if (f.req && !String(values[f.k] || '').trim()) values[f.k] = text;
      st.log.push({ role: 'assistant', agent, values, text: await generate(agent, values) });
    }
  } catch (ex) {
    st.log.push({ role: 'assistant', text: `⚠️ ${ex.message}`, error: true });
  }
  st.busy = false;
  if (st.open) render();
}

function open() { st.open = true; panel.hidden = false; document.documentElement.classList.add('asst-open'); render(); }
function close() { st.open = false; panel.hidden = true; document.documentElement.classList.remove('asst-open'); }
panel.addEventListener('click', (e) => {
  const d = e.target.closest('button')?.dataset || {};
  if (d.asClose !== undefined) close();
  if (d.asReset !== undefined) { st.log = []; st.agent = null; render(); }
  if (d.asAgent) { st.agent = A().AGENTS.find((a) => a.id === d.asAgent); render(); }
  if (d.asUnpick !== undefined) { st.agent = null; render(); }
  if (d.asPrompt) { const { v } = VIEW_LABEL(); ask((CONTEXT[v] || [[], ['Apa yang bisa kamu bantu di halaman ini?']])[1][Number(d.asPrompt)]); }
  if (d.asCopy) navigator.clipboard?.writeText(st.log[Number(d.asCopy)].text).then(() => toast('Disalin'));
  if (d.asPlan) { const m = st.log[Number(d.asPlan)]; const q = st.log[Number(d.asPlan) - 1]?.text || ''; A().toPlanner(`${m.agent ? `${m.agent.name}: ` : ''}${q}`.slice(0, 80), `Dari Asisten AI${m.agent ? ` (${m.agent.name})` : ''}\nPermintaan: ${q}\n\n${m.text}`); }
  if (d.asOpen) { const m = [...st.log].reverse().find((x) => x.agent?.id === d.asOpen); A().openAgent(d.asOpen, m?.values || {}); close(); }
});
panel.addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('textarea', panel).value.trim();
  if (t && !st.busy) ask(t);
});
panel.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && e.target.matches('textarea')) { e.preventDefault(); e.target.form.requestSubmit(); }
  if (e.key === 'Escape') close();
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); st.open ? close() : open(); }
});
// Konteks ikut berganti saat pindah halaman (selama panel terbuka dan belum ada percakapan).
let lastView = null;
new MutationObserver(() => {
  const v = document.querySelector('.view.active')?.id;
  if (v === lastView) return;
  lastView = v;
  if (st.open && !st.log.length && !st.busy) render();
}).observe(document.querySelector('main'), { subtree: true, attributes: true, attributeFilter: ['class'] });

// Tombol di sidebar, di bawah kotak cari.
const btn = document.createElement('button');
btn.type = 'button';
btn.className = 'sb-assist';
btn.innerHTML = `${ic('sparkles')}<span>Asisten AI</span><kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} J</kbd>`;
btn.addEventListener('click', () => (st.open ? close() : open()));
document.querySelector('.sb-top')?.append(btn);

window.timAssistant = { open, close };
