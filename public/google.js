// Ekosistem Google: tombol Gemini (gambar, video, suara, teks) yang terbuka di akun Google user yang login,
// plus kartu pengaturan "Masuk dengan Google" untuk pemilik di menu Tim.
// Pakai: <button data-gemini="image" data-gemini-from="#md-prompt">…</button> (atau data-gemini-text="…").
// Klik = salin prompt, lalu buka halaman Gemini yang sesuai. Gemini tidak menerima prompt lewat URL, jadi tinggal tempel.
const S = window.siarin;
const { api, esc, toast, state } = S;
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const GEMINI = {
  image: ['https://gemini.google.com/images', 'Gemini Images'],
  video: ['https://gemini.google.com/videos', 'Gemini Videos'],
  voice: ['https://aistudio.google.com/generate-speech', 'AI Studio Speech'],
  text: ['https://gemini.google.com/app', 'Gemini'],
};

// Email Google user (dari login Google / diisi admin): buka langsung di akun itu. Tanpa email: pilih akun dulu.
export function geminiLink(kind = 'text') {
  const url = (GEMINI[kind] || GEMINI.text)[0];
  const email = state.me?.user?.email;
  return email
    ? `${url}?authuser=${encodeURIComponent(email)}`
    : `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(url)}`;
}
export const geminiLabel = (kind = 'text') => (GEMINI[kind] || GEMINI.text)[1];

// Tombol siap pakai. from = selector textarea sumber prompt; form = kalimat pembuka + isi form tempat tombol berada.
export const geminiButton = (kind, { from = '', text = '', form = null, label = '', cls = 'ghost' } = {}) =>
  `<button type="button" class="${cls} gemini-btn" data-gemini="${kind}"${from ? ` data-gemini-from="${esc(from)}"` : ''}${text ? ` data-gemini-text="${esc(text)}"` : ''}${form !== null ? ` data-gemini-form="${esc(form)}"` : ''}>${esc(label || `Buka di ${geminiLabel(kind)}`)} ↗</button>`;

export async function openGemini(kind, text = '') {
  // Buka tab dulu (masih dalam klik user, supaya tidak diblok popup blocker), baru salin.
  const win = window.open(geminiLink(kind), '_blank');
  if (win) win.opener = null;
  if (text.trim()) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`Prompt disalin. Tempel di ${geminiLabel(kind)} (Ctrl/⌘+V).`);
    } catch { toast('Tidak bisa menyalin otomatis, salin prompt-nya manual.'); }
  }
  if (!win) toast('Tab baru diblok browser. Izinkan pop-up untuk TIM-AI.');
}

// Prompt dari isi form: "<pembuka>" + tiap kolom yang terisi sebagai "Label: isi".
function formPrompt(form, intro) {
  if (!form) return intro;
  const lines = [...form.querySelectorAll('input:not([type=checkbox]):not([type=hidden]):not([type=file]), select, textarea')]
    .filter((el) => String(el.value || '').trim())
    .map((el) => `${(form.querySelector(`label[for="${el.id}"]`)?.textContent || el.name || '').trim()}: ${el.value.trim()}`);
  const checked = [...form.querySelectorAll('input[type=checkbox]:checked')].map((el) => el.parentElement.textContent.trim()).filter(Boolean);
  if (checked.length) lines.push(`Platform: ${checked.join(', ')}`);
  return [intro, ...lines].filter(Boolean).join('\n');
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-gemini]');
  if (!b) return;
  e.preventDefault();
  if (b.dataset.geminiForm !== undefined) return openGemini(b.dataset.gemini, formPrompt(b.closest('form'), b.dataset.geminiForm));
  const src = b.dataset.geminiFrom ? (b.closest('.card, .modal, section, form, body') || document).querySelector(b.dataset.geminiFrom) || document.querySelector(b.dataset.geminiFrom) : null;
  openGemini(b.dataset.gemini, src ? src.value ?? src.textContent : b.dataset.geminiText || '');
});

S.gemini = { link: geminiLink, label: geminiLabel, button: geminiButton, open: openGemini };

// ---------------- Pengaturan "Masuk dengan Google" (pemilik) ----------------
async function drawGoogleLogin() {
  if (state.me?.user?.role !== 'owner' || !state.me.authEnabled) return;
  const list = document.getElementById('user-list');
  if (!list) return;
  let box = document.getElementById('google-login-card');
  if (!box) {
    list.insertAdjacentHTML('afterend', '<div class="card" id="google-login-card"></div>');
    box = document.getElementById('google-login-card');
  }
  let c;
  try { c = await api('/api/google-login'); } catch (ex) { box.innerHTML = `<div class="check bad">${esc(ex.message)}</div>`; return; }
  const on = !!c.client_id;
  box.innerHTML = `<div class="row-between"><div class="label">Masuk dengan Google</div><span class="pill ${on ? 'ok' : ''}">${on ? 'Aktif' : 'Belum aktif'}</span></div>
    <p class="hint">Tiap anggota login pakai akun Google-nya sendiri (email diisi di <b>Edit</b> anggota). Akun Google yang sama dipakai untuk Gemini: gambar, video, suara, dan ide/script.</p>
    <details ${on ? '' : 'open'}><summary class="hint">Cara mengaktifkan (sekali saja, ±5 menit)</summary>
      <ol class="hint">
        <li>Buka <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener">Google Cloud Console → Clients</a>, buat project kalau belum ada.</li>
        <li><b>Create client</b> → Application type <b>Web application</b>.</li>
        <li>Authorized JavaScript origins: <code>${esc(c.origin)}</code></li>
        <li>Authorized redirect URIs: <code>${esc(c.redirect_uri)}</code></li>
        <li>Di <b>Audience</b>, set <b>In production</b> (atau tambahkan email tim sebagai test user).</li>
        <li>Salin Client ID ke bawah, lalu Simpan. Client secret tidak diperlukan.</li>
      </ol></details>
    <form id="gl-form" class="form-grid">
      <div class="span-2"><label class="label" for="gl-owner">Email Google pemilik</label><input id="gl-owner" type="email" value="${esc(c.owner_email)}" placeholder="nama@gmail.com"></div>
      <div class="span-2"><label class="label" for="gl-id">Client ID</label><input id="gl-id" value="${esc(c.client_id)}" ${c.from_env ? 'disabled' : ''} placeholder="xxxx.apps.googleusercontent.com" autocomplete="off"></div>
      <div class="span-2 btn-row"><button class="primary" type="submit">Simpan</button></div>
    </form>`;
  box.querySelector('#gl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { owner_email: box.querySelector('#gl-owner').value };
    if (!c.from_env) body.client_id = box.querySelector('#gl-id').value;
    try {
      await api('/api/google-login', json('PUT', body));
      await S.loadMe?.();
      toast('Login Google tersimpan');
      drawGoogleLogin();
    } catch (ex) { toast(ex.message); }
  });
}
const prevTeam = S.viewHooks.team;
S.viewHooks.team = async () => { await prevTeam?.(); drawGoogleLogin(); };
