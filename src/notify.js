// Notifikasi alur kerja per brand: Telegram (bot) dan/atau webhook (mis. gateway WhatsApp seperti Fonnte/Wablas,
// Zapier, Make, n8n). Dipicu saat kartu Planner masuk Review / Siap / diminta revisi / di-approve,
// dan saat post gagal terkirim (supaya admin medsos posting manual pakai Publishing Kit).
import { getSetting, setSetting, now } from './db.js';

export const NOTIFY_EVENTS = {
  review: 'Kartu masuk Review',
  siap: 'Kartu Siap dijadwalkan',
  revision: 'Kartu diminta revisi',
  approve: 'Kartu di-approve',
  post_failed: 'Post gagal / sebagian gagal',
  founder_brief: 'Laporan pagi (Kantor AI)',
};
const key = (brandId) => `notify:${brandId}`;

export async function loadNotify(db, brandId) {
  return JSON.parse((await getSetting(db, key(brandId))) || '{}');
}
export async function saveNotify(db, brandId, cfg) {
  await setSetting(db, key(brandId), JSON.stringify(cfg));
}

// Kirim ke semua kanal yang aktif. Tidak pernah melempar error (notifikasi tidak boleh menggagalkan aksi utama).
export async function notify(db, brandId, event, text, data = {}) {
  let cfg;
  try { cfg = await loadNotify(db, brandId); } catch { return { sent: 0 }; }
  if (cfg.events && cfg.events[event] === false) return { sent: 0 };
  const jobs = [];
  if (cfg.telegram_token && cfg.telegram_chat) {
    jobs.push(fetch(`https://api.telegram.org/bot${cfg.telegram_token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.telegram_chat, text: `TIM-AI · ${text}`, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(6000),
    }).then(async (r) => { if (!r.ok) throw new Error(`Telegram: ${(await r.json().catch(() => ({}))).description || r.status}`); }));
  }
  if (cfg.webhook_url) {
    jobs.push(fetch(cfg.webhook_url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(cfg.webhook_secret ? { 'X-TIM-AI-Secret': cfg.webhook_secret } : {}), ...(cfg.webhook_auth ? { Authorization: cfg.webhook_auth } : {}) },
      body: JSON.stringify({ event, text: `TIM-AI · ${text}`, brand_id: brandId, at: now(), data, ...(cfg.webhook_target ? { target: cfg.webhook_target, message: `TIM-AI · ${text}` } : {}) }),
      signal: AbortSignal.timeout(6000),
    }).then((r) => { if (!r.ok) throw new Error(`Webhook: HTTP ${r.status}`); }));
  }
  const res = await Promise.allSettled(jobs);
  return { sent: res.filter((x) => x.status === 'fulfilled').length, errors: res.filter((x) => x.status === 'rejected').map((x) => x.reason.message) };
}

// Dipanggil Planner setiap status kartu berubah: catat di log revisi + kirim notifikasi kalau relevan.
export async function onContentStatus(db, item, from, to, user, note = '') {
  if (from === to) return;
  const LABEL = { ide: 'Ide', draft: 'Draft', review: 'Review', siap: 'Siap', terjadwal: 'Terjadwal', tayang: 'Tayang' };
  await db.run('INSERT INTO content_comments (content_id, author, kind, body, created_at) VALUES (?, ?, ?, ?, ?)',
    item.id, user?.username || 'sistem', 'status', `${LABEL[from] || from} → ${LABEL[to] || to}${note ? ` · ${note}` : ''}`, now());
  if (to === 'review' || to === 'siap') {
    await notify(db, item.brand_id, to, `${to === 'review' ? '👀 Perlu review' : '✅ Siap dijadwalkan'}: "${item.title}" (oleh ${user?.username || '-'})`, { content_id: item.id, title: item.title, status: to });
  }
}
