// Master BCS: panel AI ahli per tim, ditempel di bawah laporan tiap tim (dan di halaman Tim ADV / Tim MP).
// Persona = soul.md (bisa diganti pemilik/admin lewat tombol Persona).
const S = window.siarin;
const { api, esc, toast, openModal, closeModal, state } = S;
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const NAME = 'Master BCS';
const LABEL = { konten: 'Tim Konten', medsos: 'Tim Medsos', digital: 'Tim Digital', adv: 'Tim ADV', mp: 'Tim MP', kol: 'Tim KOL', affiliate: 'Tim Affiliate', cs: 'Tim CS' };
const QUICK = [
  ['Bedah laporan ini: vonis, insight, dan keputusan tindakan minggu ini.', 'Bedah & putuskan'],
  ['Vonis aja: intinya apa dan 3 tindakan paling penting sekarang?', 'Vonis kilat'],
  ['Susun kill criteria & target KPI yang harus dipantau 7 hari ke depan dari data ini.', 'Kill criteria & KPI'],
  ['Data apa yang masih kosong/DATA GAP dan harus disetor tim supaya analisamu valid?', 'Data yang kurang'],
];
const logs = {}; // percakapan per tim (selama halaman terbuka)

// Markdown sederhana -> HTML aman (teks di-escape dulu).
function md(src) {
  const blocks = [];
  let t = String(src || '').replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    blocks.push(`<pre class="md-code">${esc(code.replace(/\n$/, ''))}</pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  t = esc(t);
  const inline = (s) => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*{2}([^*]+)\*{2}/g, '<b>$1</b>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, '$1<i>$2</i>');
  const lines = t.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\|.+\|\s*$/.test(l) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const head = cells(l);
      i += 2;
      const body = [];
      while (i < lines.length && /^\|.+\|\s*$/.test(lines[i])) body.push(cells(lines[i++]));
      i--;
      out.push(`<div class="table-wrap"><table class="data"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { const n = Math.min(h[1].length + 2, 6); out.push(`<h${n} class="md-h">${inline(h[2])}</h${n}>`); continue; }
    if (/^\s*([-•]|\* |\d+[.)])\s+/.test(l)) { out.push(`<div class="md-li">${inline(l.trim())}</div>`); continue; }
    if (/^---+$/.test(l.trim())) { out.push('<hr>'); continue; }
    out.push(l.trim() ? `<p>${inline(l)}</p>` : '');
  }
  return out.join('').replace(/\u0000(\d+)\u0000/g, (_m, n) => blocks[Number(n)]);
}

function draw(box, team, opts) {
  const log = (logs[team] ||= []);
  const ai = !!state.config.ai;
  const manage = ['owner', 'admin'].includes(state.me?.user.role);
  box.innerHTML = `<div class="row-between"><div><div class="mbcs-title"><span class="mbcs-badge">BCS</span> ${NAME} <span class="hint">· ahli ${LABEL[team] || team}</span></div>
    <div class="hint">Terhubung ke laporan ${esc(LABEL[team] || team)} (${opts.days} hari). Persona: soul.md (Hakim Eksekutor).</div></div>
    <div class="btn-row">${manage ? '<button class="ghost small" data-mbcs-persona>Persona (soul.md)</button>' : ''}${log.length ? '<button class="ghost small" data-mbcs-reset>Mulai ulang</button>' : ''}</div></div>
    ${ai ? '' : '<div class="check bad small-note">AI belum aktif. Isi API key Gemini di <b>AI Studio → Pengaturan AI</b> (atau pasang ANTHROPIC_API_KEY), lalu muat ulang.</div>'}
    <div class="btn-row left mbcs-quick">${QUICK.map(([, l], i) => `<button class="ghost small" data-mbcs-q="${i}" ${ai ? '' : 'disabled'}>${esc(l)}</button>`).join('')}</div>
    <div class="chat mbcs-chat">${log.map((m) => `<div class="msg ${m.role}">${m.role === 'assistant' ? `<div class="md">${md(m.content)}</div>` : esc(m.content)}</div>`).join('')}
    ${box.dataset.busy ? `<div class="msg assistant"><span class="spinner inline"></span> ${NAME} lagi membaca laporan & menimbang keputusan… (30–90 detik)</div>` : ''}</div>
    <form class="chat-form" data-mbcs-form><textarea rows="2" placeholder="Tanya ${NAME}: mis. brand mana yang harus dipotong budgetnya?" ${ai ? '' : 'disabled'}></textarea><button class="primary" ${ai ? '' : 'disabled'}>Kirim</button></form>`;
  const chat = box.querySelector('.mbcs-chat');
  chat.scrollTop = chat.scrollHeight;
}

async function ask(box, team, opts, question) {
  if (box.dataset.busy) return;
  const log = (logs[team] ||= []);
  log.push({ role: 'user', content: question });
  box.dataset.busy = '1';
  draw(box, team, opts);
  try {
    const { answer } = await api(`/api/team-ai/${team}/ask`, json('POST', { messages: log, days: opts.days }));
    log.push({ role: 'assistant', content: answer });
  } catch (ex) {
    log.push({ role: 'assistant', content: `⚠️ ${ex.message}` });
  }
  delete box.dataset.busy;
  if (box.isConnected) draw(box, team, opts);
}

async function personaModal() {
  const p = await api('/api/team-ai/persona');
  openModal(`<form id="mbcs-persona"><h3>Persona ${NAME} (soul.md)</h3>
    <p class="hint">Dipakai semua tim. ${p.custom ? 'Sekarang memakai versi yang kamu pasang.' : 'Sekarang memakai soul.md bawaan.'} Keahlian tiap tim ditambahkan otomatis di atasnya.</p>
    <label class="btn small" style="margin-bottom:8px">Pilih file .md<input type="file" accept=".md,.txt,text/markdown,text/plain" id="mbcs-file" hidden></label>
    <textarea id="mbcs-soul" rows="16" spellcheck="false" style="font-family:ui-monospace,monospace;font-size:12px">${esc(p.content)}</textarea>
    <div class="modal-actions"><button type="button" class="ghost" id="mbcs-reset-soul">Pakai bawaan</button><button type="button" class="ghost" data-close>Batal</button><button class="primary">Simpan</button></div></form>`);
  document.getElementById('modal-box').classList.add('wide');
  document.getElementById('mbcs-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) document.getElementById('mbcs-soul').value = await f.text();
  });
  document.getElementById('mbcs-reset-soul').addEventListener('click', async () => {
    await api('/api/team-ai/persona', json('PUT', { content: '' }));
    closeModal();
    toast('Persona kembali ke soul.md bawaan');
  });
  document.getElementById('mbcs-persona').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/team-ai/persona', json('PUT', { content: document.getElementById('mbcs-soul').value }));
      closeModal();
      toast('Persona Master BCS tersimpan');
    } catch (ex) { toast(ex.message); }
  });
}

// Tempel panel ke dalam container (mis. #rp-body). opts.days = periode laporan.
function mount(container, team, opts = {}) {
  if (!LABEL[team] || !container) return;
  const box = document.createElement('div');
  box.className = 'card mbcs no-print';
  box.dataset.team = team;
  container.appendChild(box);
  const o = { days: Number(opts.days) || 30 };
  draw(box, team, o);
  box.addEventListener('click', (e) => {
    const d = e.target.dataset;
    if (d.mbcsQ !== undefined) ask(box, team, o, QUICK[Number(d.mbcsQ)][0]);
    if (d.mbcsReset !== undefined) { logs[team] = []; draw(box, team, o); }
    if (d.mbcsPersona !== undefined) personaModal().catch((ex) => toast(ex.message));
  });
  box.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = box.querySelector('textarea').value.trim();
    if (q) ask(box, team, o, q);
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.matches('textarea')) box.querySelector('form').requestSubmit();
  });
}

window.timAi = { mount, md };
