// Video Motion: video ngomong / info produk -> video motion graphics siap posting.
// Alur: sumber -> caption otomatis (Whisper di browser) -> gaya -> b-roll -> musik -> hook & CTA -> render MP4 -> simpan ke kartu.
import { RATIOS, STYLES, FONT_URL, MotionRenderer, buildCaptions, buildProductCaptions, placeBroll, planAngles, playSfx, suggestHook } from '/motion-engine.js';

const S = window.siarin;
const { api, esc, toast, state } = S;
const $ = (sel) => document.querySelector(sel);
const view = $('#view-motion');
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t % 1) * 10)}`;

const M = {
  mode: 'video',
  project: {
    ratio: '9:16', style: 'bold', captions: [], broll: [], angles: [], contentDuration: 0,
    hook: { text: '', dur: 2.4 }, cta: { text: 'Follow buat tips lainnya', sub: 'Klik link di bio', dur: 2.5 },
    effects: { captions: true, angle: true, punch: true, shake: true, glitch: true, blurFill: true, progress: false, sfx: true },
    music: { volume: 0.25 }, brandColor: '#7c6cf0',
  },
  media: [], // pustaka b-roll: { id, kind, name, url, el }
  els: { main: null, broll: {} },
  mainSrc: null,
  musicEl: null,
  productLines: '',
  cardId: null,
  t: 0,
  playing: false,
  recording: null,
  words: null,
};
let nextMediaId = 1;
let renderer;
let audio; // { actx, master, rec, mainGain, musicGain, sources }

const total = () => M.project.contentDuration + (M.project.cta.dur || 0);

// ---------- Tampilan ----------
function shell() {
  view.innerHTML = `
  <div class="row-between"><h1>Video Motion</h1>
    <span class="hint">Video ngomong atau info produk → caption kata kunci, b-roll, efek, musik, CTA. Diproses di browser kamu.</span></div>
  <div class="motion-grid">
    <div class="motion-side">
      <div class="card"><div class="label">1. Sumber</div>
        <div class="tabs" id="mo-mode"><button data-mode="video" class="active">🎤 Video ngomong</button><button data-mode="produk">🛍 Info produk</button></div>
        <div id="mo-src-video">
          <label class="dropzone small-drop"><input type="file" id="mo-main" accept="video/*" hidden><span id="mo-main-name">Pilih video (maks. 5 menit)</span></label>
          <div class="hint">atau ambil dari kartu Planner:</div>
          <select id="mo-card-video"><option value="">– pilih kartu dengan lampiran video –</option></select>
        </div>
        <div id="mo-src-produk" hidden>
          <label class="label" for="mo-lines">Isi video (1 baris = 1 adegan)</label>
          <textarea id="mo-lines" rows="6" placeholder="Es Kopi Gula Aren\nGula aren asli, dimasak sendiri\nCuma 18 ribu\nPesan sekarang di GoFood"></textarea>
          <p class="hint">Foto produk di bagian B-roll dipakai jadi latar tiap adegan.</p>
        </div>
      </div>

      <div class="card"><div class="label">2. Caption otomatis</div>
        <button class="primary" id="mo-transcribe">✨ Buat caption otomatis</button>
        <div id="mo-transcribe-status" class="hint"></div>
        <p class="hint">Pertama kali, browser download model suara ±80 MB (sekali aja). Ucapan diproses di perangkatmu, nggak dikirim ke mana-mana.</p>
      </div>

      <div class="card"><div class="label">3. Gaya editing</div>
        <div class="style-grid" id="mo-styles"></div>
        <div class="form-grid">
          <div><label class="label" for="mo-ratio">Rasio</label><select id="mo-ratio">${Object.entries(RATIOS).map(([k, r]) => `<option value="${k}">${r.label}</option>`).join('')}</select></div>
        </div>
        <div class="checks" id="mo-effects">
          ${[['captions', 'Caption'], ['punch', 'Zoom kata kunci'], ['angle', 'Ganti angle'], ['shake', 'Shake'], ['glitch', 'Glitch'], ['blurFill', 'Latar blur'], ['progress', 'Progress bar'], ['sfx', 'Efek suara']]
    .map(([k, l]) => `<label><input type="checkbox" data-fx="${k}"> ${l}</label>`).join('')}
        </div>
      </div>

      <div class="card"><div class="label">4. B-roll</div>
        <label class="btn small upload-btn">+ Upload foto / klip<input type="file" id="mo-broll-files" accept="image/*,video/*" multiple hidden></label>
        <select id="mo-card-broll" class="inline-select"><option value="">+ Ambil dari kartu…</option></select>
        <div id="mo-media" class="mo-media"></div>
        <button class="ghost small" id="mo-place">Taruh b-roll otomatis</button>
        <div id="mo-broll-list"></div>
      </div>

      <div class="card"><div class="label">5. Musik</div>
        <label class="btn small upload-btn">Pilih musik latar<input type="file" id="mo-music" accept="audio/*" hidden></label>
        <span class="hint" id="mo-music-name">Belum ada (pakai musik yang kamu punya hak pakainya)</span>
        <label class="label" for="mo-volume">Volume musik</label>
        <input type="range" id="mo-volume" min="0" max="1" step="0.05">
        <p class="hint">Musik otomatis mengecil pas ada yang ngomong.</p>
      </div>

      <div class="card"><div class="label">6. Hook & CTA</div>
        <label class="label" for="mo-hook">Judul pembuka (hook)</label><input id="mo-hook" placeholder="mis. 3 cara bikin kopi susu enak">
        <label class="label" for="mo-cta">Ajakan di akhir (CTA)</label><input id="mo-cta">
        <label class="label" for="mo-cta-sub">Tombol CTA</label><input id="mo-cta-sub">
        <label class="label" for="mo-cta-dur">Durasi CTA (detik, 0 = tanpa CTA)</label><input id="mo-cta-dur" type="number" min="0" max="6" step="0.5">
      </div>
    </div>

    <div class="motion-main">
      <div class="card preview-card">
        <div class="mo-stage"><canvas id="mo-canvas"></canvas><div id="mo-empty" class="mo-empty">Pilih sumber dulu, terus klik <b>Buat caption otomatis</b></div></div>
        <div class="mo-controls">
          <button class="ghost" id="mo-play">▶ Putar</button>
          <input type="range" id="mo-seek" min="0" max="1" step="0.01" value="0">
          <span id="mo-time" class="hint">0:00.0 / 0:00.0</span>
        </div>
      </div>
      <div class="card"><div class="row-between"><div class="label">Edit caption</div><span class="hint">Klik teks buat benerin salah dengar</span></div>
        <div id="mo-captions" class="mo-captions"><p class="hint">Caption muncul di sini setelah langkah 2.</p></div></div>
      <div class="card"><div class="label">Render & simpan</div>
        <div class="form-grid"><div class="span-2"><label class="label" for="mo-target">Simpan hasil ke kartu Planner</label>
          <select id="mo-target"><option value="">– jangan simpan ke kartu –</option></select></div></div>
        <button class="primary big" id="mo-render">🎬 Render video</button>
        <p class="hint">Render jalan sepanjang durasi video. Jangan pindah tab atau minimize jendela selama render.</p>
        <div id="mo-result"></div>
      </div>
    </div>
  </div>`;
  renderer = new MotionRenderer($('#mo-canvas'));
  bind();
  syncInputs();
}

function syncInputs() {
  const p = M.project;
  document.querySelectorAll('#mo-mode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === M.mode));
  $('#mo-src-video').hidden = M.mode !== 'video';
  $('#mo-src-produk').hidden = M.mode !== 'produk';
  $('#mo-styles').innerHTML = STYLES.map((s) => `<button class="style-chip ${s.id === p.style ? 'on' : ''}" data-style="${s.id}" title="${esc(s.desc)}">
    <span class="style-sample" style="font-family:'${s.font}';${s.italic ? 'font-style:italic;' : ''}font-weight:${s.weight || 400};color:${s.hl === 'brand' ? 'var(--accent)' : s.hl}">${s.upper ? 'AA' : 'Aa'}</span>${esc(s.name)}</button>`).join('');
  $('#mo-ratio').value = p.ratio;
  document.querySelectorAll('#mo-effects [data-fx]').forEach((c) => (c.checked = !!p.effects[c.dataset.fx]));
  $('#mo-volume').value = p.music.volume;
  $('#mo-hook').value = p.hook.text;
  $('#mo-cta').value = p.cta.text;
  $('#mo-cta-sub').value = p.cta.sub;
  $('#mo-cta-dur').value = p.cta.dur;
  $('#mo-lines').value = M.productLines;
}

async function loadCards() {
  const cards = await api('/api/content').catch(() => []);
  const withVideo = cards.filter((c) => c.assets?.some((a) => a.kind === 'video'));
  const withMedia = cards.filter((c) => c.assets?.length);
  $('#mo-card-video').innerHTML = `<option value="">– pilih kartu dengan lampiran video –</option>${withVideo.map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join('')}`;
  $('#mo-card-broll').innerHTML = `<option value="">+ Ambil dari kartu…</option>${withMedia.map((c) => `<option value="${c.id}">${esc(c.title)} (${c.assets.length})</option>`).join('')}`;
  $('#mo-target').innerHTML = `<option value="">– jangan simpan ke kartu –</option><option value="new">+ Kartu baru</option>${cards.filter((c) => c.status !== 'tayang').map((c) => `<option value="${c.id}" ${c.id === M.cardId ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}`;
  M.cards = cards;
}

// ---------- Media ----------
// File online (Vercel Blob, domain lain) hanya bisa dipakai kalau servernya mengizinkan CORS.
const remote = (url) => /^https?:/.test(url) && new URL(url).origin !== location.origin;
const remoteHint = (url) => (remote(url) ? ' Lampiran online ini belum bisa dibaca Video Motion: download filenya, lalu upload langsung dari perangkat.' : '');

function mediaEl(kind, url) {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind === 'video' ? 'video' : 'img');
    el.crossOrigin = 'anonymous';
    if (kind === 'video') {
      el.muted = true;
      el.playsInline = true;
      el.preload = 'auto';
      el.onloadeddata = () => resolve(el);
    } else {
      el.onload = () => resolve(el);
    }
    el.onerror = () => reject(new Error(`Media tidak bisa dibuka.${remoteHint(url)}`));
    el.src = url;
  });
}

async function addMedia(kind, url, name) {
  const el = await mediaEl(kind, url);
  const m = { id: nextMediaId++, kind, url, name, el };
  M.media.push(m);
  drawMedia();
  return m;
}

function drawMedia() {
  $('#mo-media').innerHTML = M.media.map((m) => `<div class="mo-thumb" title="${esc(m.name)}">
    ${m.kind === 'video' ? `<video src="${esc(m.url)}" muted></video>` : `<img src="${esc(m.url)}" alt="">`}
    <button class="asset-del" data-rm-media="${m.id}" aria-label="Hapus ${esc(m.name)}">✕</button></div>`).join('') || '<p class="hint">Belum ada b-roll.</p>';
  $('#mo-broll-list').innerHTML = M.project.broll.length ? `<table class="data edit"><thead><tr><th>Mulai</th><th>Durasi</th><th>Media</th><th>Tampil</th><th></th></tr></thead><tbody>
    ${M.project.broll.map((b) => `<tr data-broll="${b.id}">
      <td><input type="number" step="0.1" min="0" data-bf="start" value="${b.start}"></td>
      <td><input type="number" step="0.1" min="0.5" data-bf="dur" value="${b.dur}"></td>
      <td><select data-bf="media">${M.media.map((m) => `<option value="${m.id}" ${m.id === b.media.id ? 'selected' : ''}>${esc(m.name.slice(0, 18))}</option>`).join('')}</select></td>
      <td><select data-bf="mode"><option value="full" ${b.mode === 'full' ? 'selected' : ''}>Layar penuh</option><option value="pip" ${b.mode === 'pip' ? 'selected' : ''}>Kotak atas</option></select></td>
      <td><button class="asset-del static" data-rm-broll="${b.id}" aria-label="Hapus b-roll">✕</button></td></tr>`).join('')}
  </tbody></table>` : '';
  M.els.broll = Object.fromEntries(M.project.broll.map((b) => [b.id, b.media.el]));
}

async function setMain(url, name) {
  stop();
  const el = document.createElement('video');
  el.crossOrigin = 'anonymous';
  el.playsInline = true;
  el.preload = 'auto';
  await new Promise((resolve, reject) => {
    el.onloadedmetadata = resolve;
    el.onerror = () => reject(new Error(`Video tidak bisa dibuka di browser ini.${remoteHint(url)}`));
    el.src = url;
  });
  if (el.duration > 5 * 60 + 1) throw new Error('Video maksimal 5 menit');
  await new Promise((r) => { el.onseeked = r; el.currentTime = 0.01; });
  M.els.main = el;
  M.mainSrc = url;
  M.project.contentDuration = el.duration;
  M.project.captions = [];
  M.project.angles = [];
  M.words = null;
  $('#mo-main-name').textContent = name;
  if (audio) connectMain();
  refresh();
}

// ---------- Audio ----------
function ensureAudio() {
  if (audio) return audio;
  const actx = new AudioContext();
  const master = actx.createGain();
  const rec = actx.createMediaStreamDestination();
  master.connect(actx.destination);
  master.connect(rec);
  const musicGain = actx.createGain();
  musicGain.connect(master);
  audio = { actx, master, rec, musicGain, mainNode: null, musicNode: null };
  connectMain();
  connectMusic();
  return audio;
}
function connectMain() {
  if (!audio || !M.els.main || M.els.main.__node) return;
  M.els.main.__node = audio.actx.createMediaElementSource(M.els.main);
  M.els.main.__node.connect(audio.master);
}
function connectMusic() {
  if (!audio || !M.musicEl || M.musicEl.__node) return;
  M.musicEl.__node = audio.actx.createMediaElementSource(M.musicEl);
  M.musicEl.__node.connect(audio.musicGain);
}

// ---------- Transkrip ----------
async function extractAudio(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`Suara video tidak bisa diambil.${remoteHint(url)}`);
  }
  if (!res.ok) throw new Error(`Video tidak bisa diunduh (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(buf);
  ctx.close();
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

let worker;
function transcribe(audioData) {
  worker ??= new Worker('/motion-worker.js', { type: 'module' });
  const files = {};
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'download') {
        files[d.file] = d.progress;
        const vals = Object.values(files);
        status(`Download model suara… ${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}%`);
      }
      if (d.type === 'transcribing') status('Lagi dengerin videonya… (±1 menit per menit video)');
      if (d.type === 'result') resolve(d.words);
      if (d.type === 'error') reject(new Error(d.message));
    };
    worker.onerror = (e) => reject(new Error(e.message || 'Model suara gagal dimuat'));
    worker.postMessage({ audio: audioData, language: 'indonesian' });
  });
}
const status = (msg) => { $('#mo-transcribe-status').textContent = msg; };

async function runCaptions() {
  const btn = $('#mo-transcribe');
  btn.disabled = true;
  try {
    if (M.mode === 'video') {
      if (!M.els.main) throw new Error('Pilih video dulu di langkah 1');
      status('Mengambil suara dari video…');
      const words = await transcribe(await extractAudio(M.mainSrc));
      if (!words.length) throw new Error('Nggak ada ucapan yang kedengeran di video ini');
      M.words = words;
      const card = M.cards?.find((c) => c.id === M.cardId);
      M.project.captions = buildCaptions(words, { boostWords: `${card?.title || ''} ${card?.pillar || ''}`.split(/\s+/) });
      M.project.contentDuration = M.els.main.duration;
      if (!M.project.hook.text) M.project.hook.text = card?.title || suggestHook(words);
      status(`Selesai: ${M.project.captions.length} caption dari ${words.length} kata.`);
    } else {
      const lines = M.productLines.split('\n').filter((l) => l.trim());
      if (!lines.length) throw new Error('Isi minimal satu baris info produk');
      M.project.captions = buildProductCaptions(lines);
      M.project.contentDuration = lines.length * 2.6;
      if (!M.project.hook.text) M.project.hook.text = '';
      status(`Selesai: ${lines.length} adegan.`);
    }
    M.project.angles = planAngles(M.project.captions);
    if (M.mode === 'video' && M.media.length && !M.project.broll.length) autoPlace();
    syncInputs();
    refresh();
  } catch (ex) {
    status('');
    toast(ex.message);
  } finally {
    btn.disabled = false;
  }
}

function autoPlace() {
  const style = STYLES.find((s) => s.id === M.project.style);
  const usable = M.media.filter((m) => m.kind === 'image' || m.kind === 'video');
  M.project.broll = placeBroll(M.project.captions, usable, { mode: style.broll });
  drawMedia();
}

// ---------- Caption editor ----------
function drawCaptions() {
  const caps = M.project.captions;
  $('#mo-captions').innerHTML = caps.length ? caps.map((c) => `<div class="mo-cap" data-cap="${c.id}">
    <button class="mo-cap-time" data-jump="${c.start}" title="Lompat ke sini">${fmt(c.start)}</button>
    <input class="mo-cap-text" value="${esc(c.text)}" aria-label="Teks caption ${fmt(c.start)}">
    <select class="mo-cap-key" aria-label="Kata kunci"><option value="">tanpa highlight</option>${c.text.split(/\s+/).map((w) => w.replace(/[.,!?;:]+$/, '')).filter(Boolean).map((w) => `<option ${w === c.keyword ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select>
    <button class="asset-del static" data-rm-cap="${c.id}" aria-label="Hapus caption">✕</button>
  </div>`).join('') : '<p class="hint">Caption muncul di sini setelah langkah 2.</p>';
}

// Teks diedit: bagi ulang waktu kata secara rata di dalam potongan itu.
function retime(cap, text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const step = (cap.end - cap.start) / Math.max(words.length, 1);
  cap.text = words.join(' ');
  cap.words = words.map((w, i) => ({ text: w, start: cap.start + i * step, end: cap.start + (i + 1) * step }));
  if (cap.keyword && !words.some((w) => w.replace(/[.,!?;:]+$/, '') === cap.keyword)) cap.keyword = null;
}

// ---------- Preview ----------
function refresh() {
  renderer.setSize(M.project.ratio);
  M.project.brandColor = state.brands.find((b) => b.id === state.brandId)?.color || '#7c6cf0';
  $('#mo-empty').hidden = !!(M.els.main || M.project.captions.length);
  $('#mo-seek').max = String(Math.max(total(), 0.1));
  M.els.productScene = M.mode === 'produk' ? productScene : null;
  drawCaptions();
  drawMedia();
  paint(M.t);
}

function productScene(t) {
  const imgs = M.media.filter((m) => m.kind === 'image' || m.kind === 'video');
  if (!imgs.length) return null;
  const idx = Math.max(0, M.project.captions.findIndex((c) => t >= c.start && t < c.end + 0.2));
  return imgs[idx % imgs.length].el;
}

// Mode info produk tidak memakai video ngomong walau sebelumnya sudah dipilih.
const activeEls = () => (M.mode === 'produk' ? { ...M.els, main: null } : M.els);

function paint(t) {
  M.t = t;
  renderer.draw({ ...M.project, angles: M.project.angles }, activeEls(), t);
  $('#mo-time').textContent = `${fmt(t)} / ${fmt(total())}`;
  if (!M.scrubbing) $('#mo-seek').value = String(t);
}

// Sinkronkan klip b-roll video dengan waktu timeline.
function syncBroll(t, playing) {
  for (const b of M.project.broll) {
    const el = b.media.el;
    if (b.media.kind !== 'video') continue;
    const active = t >= b.start && t < b.start + b.dur;
    const local = Math.min(t - b.start, (el.duration || 1) - 0.05);
    if (active && playing) {
      if (el.paused) { el.currentTime = Math.max(local, 0); el.play().catch(() => {}); } else if (Math.abs(el.currentTime - local) > 0.35) el.currentTime = local;
    } else if (!el.paused && !M.project.broll.some((o) => o.media === b.media && t >= o.start && t < o.start + o.dur)) {
      el.pause();
    } else if (active && !playing) {
      el.currentTime = Math.max(local, 0);
    }
  }
}

function sfxEvents() {
  const ev = M.project.broll.map((b) => ({ t: b.start, kind: 'whoosh' }));
  for (const c of M.project.captions) if (c.keyword) ev.push({ t: c.start, kind: 'pop' });
  return ev;
}

let raf = 0;
async function play(from = M.t) {
  if (!total()) return toast('Belum ada yang bisa diputar. Buat caption dulu.');
  const a = ensureAudio();
  await a.actx.resume();
  if (from >= total() - 0.05) from = 0;
  const main = M.els.main && M.mode === 'video' ? M.els.main : null;
  if (main) {
    main.currentTime = Math.min(from, main.duration - 0.01);
    await main.play();
  }
  if (M.musicEl) {
    M.musicEl.currentTime = from % (M.musicEl.duration || 1e9);
    M.musicEl.loop = true;
    M.musicEl.play().catch(() => {});
  }
  M.playing = true;
  $('#mo-play').textContent = '⏸ Jeda';
  const startPerf = performance.now();
  let prev = from;
  const events = sfxEvents();
  const tick = () => {
    if (!M.playing) return;
    let t = from + (performance.now() - startPerf) / 1000;
    if (main && !main.ended && t < M.project.contentDuration) t = main.currentTime;
    const style = STYLES.find((s) => s.id === M.project.style);
    if (M.project.effects.sfx) for (const e of events) if (prev < e.t && e.t <= t && (e.kind === 'whoosh' || ['pop', 'bounce'].includes(style.anim))) playSfx(a.actx, a.master, e.kind);
    const speaking = (M.words || []).some((w) => t >= w.start - 0.1 && t <= w.end + 0.15);
    a.musicGain.gain.setTargetAtTime(M.project.music.volume * (speaking && M.mode === 'video' ? 0.35 : 1), a.actx.currentTime, 0.12);
    syncBroll(t, true);
    paint(Math.min(t, total()));
    prev = t;
    if (t >= total()) return finish();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
function stop() {
  M.playing = false;
  cancelAnimationFrame(raf);
  M.els.main?.pause();
  M.musicEl?.pause();
  for (const m of M.media) if (m.kind === 'video') m.el.pause();
  if ($('#mo-play')) $('#mo-play').textContent = '▶ Putar';
}
function finish() {
  stop();
  M.onFinish?.();
}

async function seek(t) {
  stop();
  M.t = t;
  if (M.mode === 'video' && M.els.main && t < M.project.contentDuration) {
    M.els.main.currentTime = t;
    await new Promise((r) => { M.els.main.onseeked = r; setTimeout(r, 300); });
  }
  syncBroll(t, false);
  setTimeout(() => paint(t), 60);
  paint(t);
}

// ---------- Render ----------
function pickMime() {
  const opts = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  return opts.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

async function render() {
  if (!total()) return toast('Buat caption dulu (langkah 2)');
  if (M.recording) {
    M.recording.cancel = true;
    M.recording.rec.stop();
    return;
  }
  const mime = pickMime();
  if (!mime) return toast('Browser ini belum bisa merekam video. Pakai Chrome atau Safari versi terbaru.');
  await document.fonts.ready;
  const a = ensureAudio();
  await a.actx.resume();
  const stream = new MediaStream([...$('#mo-canvas').captureStream(30).getVideoTracks(), ...a.rec.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  M.recording = { rec, cancel: false };
  const btn = $('#mo-render');
  btn.textContent = '■ Batalkan render';
  const progress = setInterval(() => { $('#mo-result').innerHTML = `<div class="hint">Merender… ${Math.round((M.t / total()) * 100)}% · jangan pindah tab</div><div class="mini-track"><div class="mini-bar" style="width:${(M.t / total()) * 100}%"></div></div>`; }, 300);
  const done = new Promise((resolve) => { rec.onstop = resolve; });
  M.onFinish = () => rec.state !== 'inactive' && setTimeout(() => rec.stop(), 150);
  rec.start(1000);
  await play(0);
  await done;
  clearInterval(progress);
  M.onFinish = null;
  btn.textContent = '🎬 Render video';
  const cancelled = M.recording.cancel;
  M.recording = null;
  stop();
  if (cancelled) { $('#mo-result').innerHTML = '<p class="hint">Render dibatalkan.</p>'; return; }
  const type = mime.split(';')[0];
  const blob = new Blob(chunks, { type });
  const ext = type === 'video/mp4' ? 'mp4' : 'webm';
  const name = `video-motion-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.${ext}`;
  showResult(blob, name, ext);
}

function showResult(blob, name, ext) {
  const url = URL.createObjectURL(blob);
  $('#mo-result').innerHTML = `<video class="mo-out" src="${url}" controls playsinline></video>
    <p class="hint">${(blob.size / 1024 / 1024).toFixed(1)} MB · ${ext.toUpperCase()}${ext === 'webm' ? ' (Instagram Reels butuh MP4. Buka di Chrome/Safari terbaru biar dapat MP4)' : ''}</p>
    <div class="btn-row">
      <a class="btn" href="${url}" download="${esc(name)}">⬇ Download</a>
      <button class="ghost" id="mo-save">Simpan ke kartu</button>
      <button class="primary" id="mo-save-post">Simpan & jadwalkan →</button>
    </div>`;
  const save = async () => {
    let cardId = $('#mo-target').value;
    if (!cardId) throw new Error('Pilih kartu tujuan dulu (atau pilih "Kartu baru")');
    if (cardId === 'new') {
      const card = await api('/api/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: M.project.hook.text || 'Video Motion', status: 'review', format: 'Reels' }) });
      cardId = card.id;
    }
    const file = new File([blob], name, { type: blob.type });
    const asset = await S.uploadAsset(Number(cardId), file, (pct) => { $('#mo-save').textContent = `Mengunggah ${pct}%`; });
    M.cardId = Number(cardId);
    await loadCards();
    return { cardId: Number(cardId), asset };
  };
  $('#mo-save').addEventListener('click', async () => {
    try {
      await save();
      $('#mo-save').textContent = 'Tersimpan ✓';
      $('#mo-save').disabled = true;
      toast('Video masuk ke lampiran kartu');
    } catch (ex) { toast(ex.message); $('#mo-save').textContent = 'Simpan ke kartu'; }
  });
  $('#mo-save-post').addEventListener('click', async () => {
    try {
      const { cardId, asset } = await save();
      const card = await api(`/api/content/${cardId}`);
      card.assets.sort((x, y) => (x.id === asset.id ? -1 : y.id === asset.id ? 1 : 0));
      S.composeFrom(card);
    } catch (ex) { toast(ex.message); }
  });
}

// ---------- Event ----------
function bind() {
  $('#mo-mode').addEventListener('click', (e) => {
    if (!e.target.dataset.mode) return;
    M.mode = e.target.dataset.mode;
    stop();
    M.project.captions = [];
    M.project.broll = [];
    M.project.contentDuration = M.mode === 'video' && M.els.main ? M.els.main.duration : 0;
    syncInputs();
    refresh();
  });
  $('#mo-main').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { await setMain(URL.createObjectURL(f), f.name); } catch (ex) { toast(ex.message); }
  });
  $('#mo-card-video').addEventListener('change', async (e) => {
    const card = M.cards.find((c) => c.id === Number(e.target.value));
    const v = card?.assets.find((a) => a.kind === 'video');
    if (!v) return;
    M.cardId = card.id;
    $('#mo-target').value = String(card.id);
    try { await setMain(v.url, v.name); } catch (ex) { toast(ex.message); }
  });
  $('#mo-lines').addEventListener('input', (e) => { M.productLines = e.target.value; });
  $('#mo-transcribe').addEventListener('click', runCaptions);
  $('#mo-styles').addEventListener('click', (e) => {
    const b = e.target.closest('[data-style]');
    if (!b) return;
    M.project.style = b.dataset.style;
    const st = STYLES.find((s) => s.id === M.project.style);
    for (const br of M.project.broll) br.mode = st.broll;
    syncInputs();
    refresh();
  });
  $('#mo-ratio').addEventListener('change', (e) => { M.project.ratio = e.target.value; refresh(); });
  $('#mo-effects').addEventListener('change', (e) => { M.project.effects[e.target.dataset.fx] = e.target.checked; paint(M.t); });
  $('#mo-broll-files').addEventListener('change', async (e) => {
    for (const f of e.target.files) {
      const kind = f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : null;
      if (kind) await addMedia(kind, URL.createObjectURL(f), f.name).catch((ex) => toast(ex.message));
    }
    e.target.value = '';
    refresh();
  });
  $('#mo-card-broll').addEventListener('change', async (e) => {
    const card = M.cards.find((c) => c.id === Number(e.target.value));
    e.target.value = '';
    for (const a of card?.assets || []) if (!M.media.some((m) => m.url === a.url)) await addMedia(a.kind, a.url, a.name).catch((ex) => toast(ex.message));
    refresh();
  });
  $('#mo-place').addEventListener('click', () => {
    if (M.mode === 'produk') return toast('Di mode info produk, foto dipakai langsung jadi latar tiap adegan');
    if (!M.project.captions.length) return toast('Buat caption dulu (langkah 2)');
    if (!M.media.length) return toast('Upload foto/klip b-roll dulu');
    autoPlace();
    paint(M.t);
  });
  $('#mo-media').addEventListener('click', (e) => {
    const id = Number(e.target.dataset.rmMedia);
    if (!id) return;
    M.media = M.media.filter((m) => m.id !== id);
    M.project.broll = M.project.broll.filter((b) => b.media.id !== id);
    refresh();
  });
  $('#mo-broll-list').addEventListener('change', (e) => {
    const row = e.target.closest('[data-broll]');
    const b = M.project.broll.find((x) => x.id === Number(row?.dataset.broll));
    if (!b) return;
    const f = e.target.dataset.bf;
    if (f === 'start' || f === 'dur') b[f] = Math.max(0, Number(e.target.value) || 0);
    if (f === 'media') b.media = M.media.find((m) => m.id === Number(e.target.value)) || b.media;
    if (f === 'mode') b.mode = e.target.value;
    drawMedia();
    seek(b.start + 0.4);
  });
  $('#mo-broll-list').addEventListener('click', (e) => {
    const id = Number(e.target.dataset.rmBroll);
    if (!id) return;
    M.project.broll = M.project.broll.filter((b) => b.id !== id);
    drawMedia();
    paint(M.t);
  });
  $('#mo-music').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    M.musicEl?.pause();
    M.musicEl = new Audio(URL.createObjectURL(f));
    M.musicEl.crossOrigin = 'anonymous';
    $('#mo-music-name').textContent = f.name;
    if (audio) connectMusic();
  });
  $('#mo-volume').addEventListener('input', (e) => { M.project.music.volume = Number(e.target.value); });
  $('#mo-hook').addEventListener('input', (e) => { M.project.hook.text = e.target.value; seek(Math.min(M.t, 1)); });
  $('#mo-cta').addEventListener('input', (e) => { M.project.cta.text = e.target.value; });
  $('#mo-cta-sub').addEventListener('input', (e) => { M.project.cta.sub = e.target.value; });
  $('#mo-cta-dur').addEventListener('change', (e) => { M.project.cta.dur = Math.min(Math.max(Number(e.target.value) || 0, 0), 6); refresh(); });
  $('#mo-play').addEventListener('click', () => (M.playing ? stop() : play()));
  $('#mo-seek').addEventListener('input', (e) => { M.scrubbing = true; seek(Number(e.target.value)); });
  $('#mo-seek').addEventListener('change', () => { M.scrubbing = false; });
  $('#mo-captions').addEventListener('change', (e) => {
    const row = e.target.closest('[data-cap]');
    const cap = M.project.captions.find((c) => c.id === Number(row?.dataset.cap));
    if (!cap) return;
    if (e.target.matches('.mo-cap-text')) { retime(cap, e.target.value); drawCaptions(); }
    if (e.target.matches('.mo-cap-key')) cap.keyword = e.target.value || null;
    seek(cap.start + 0.3);
  });
  $('#mo-captions').addEventListener('click', (e) => {
    if (e.target.dataset.jump) seek(Number(e.target.dataset.jump) + 0.05);
    const id = Number(e.target.dataset.rmCap);
    if (id) {
      M.project.captions = M.project.captions.filter((c) => c.id !== id);
      drawCaptions();
      paint(M.t);
    }
  });
  $('#mo-render').addEventListener('click', () => render().catch((ex) => { toast(ex.message); M.recording = null; $('#mo-render').textContent = '🎬 Render video'; }));
}

// Dibuka dari kartu Planner: video lampiran jadi sumber, foto/klip lain jadi b-roll.
S.motionFromCard = async (card) => {
  M.cardId = card.id;
  S.show('motion');
  await ensureShell();
  const video = card.assets.find((a) => a.kind === 'video');
  try {
    if (video) {
      M.mode = 'video';
      await setMain(video.url, video.name);
    } else {
      M.mode = 'produk';
      M.productLines = [card.title, card.hook, ...(card.caption || '').split('\n').slice(0, 3)].filter((l) => l?.trim()).join('\n');
    }
    for (const a of card.assets) if (a !== video && !M.media.some((m) => m.url === a.url)) await addMedia(a.kind, a.url, a.name);
  } catch (ex) { toast(ex.message); }
  M.project.hook.text = card.hook || card.title;
  syncInputs();
  refresh();
  $('#mo-target').value = String(card.id);
};

// Tampilan dibangun sekali (plus font untuk caption) saat menu pertama dibuka.
let shellReady = null;
function ensureShell() {
  shellReady ??= (async () => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONT_URL;
    document.head.append(l);
    shell();
    await Promise.all(STYLES.map((s) => document.fonts.load(`${s.italic ? 'italic ' : ''}${s.weight || 400} 80px "${s.font}"`).catch(() => {})));
  })();
  return shellReady;
}

S.viewHooks.motion = async () => {
  await ensureShell();
  await loadCards();
  if (M.cardId) $('#mo-target').value = String(M.cardId);
  refresh();
};
window.addEventListener('beforeunload', (e) => { if (M.recording) e.preventDefault(); });
