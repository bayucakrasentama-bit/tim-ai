// Produk yang sudah terpasang di Mac mini (Olimex, G-Binahong, Prolambung, Zestmag, Gurahfit, …).
// Agen melaporkan statistiknya lewat heartbeat (`products`); user/Hermes bisa minta "tambah N video" tanpa link footage
// (job dengan kolom mac_product, product_id 0, footage_url '').
import { now } from '../db.js';

export const CTAS = ['kerkun', 'awareness', 'campur'];
const SLUG = /^[a-z0-9_-]{1,40}$/;
const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

// Dipakai di WHERE/CASE factory_jobs: job produk Mac tidak butuh profil yang disetujui.
export const JOB_READY_SQL = "(factory_jobs.mac_product IS NOT NULL OR (SELECT status FROM factory_products WHERE id = factory_jobs.product_id) = 'approved')";

// Stok video di folder Drive produk: total .mp4, yang sudah ditandai dipakai tim ("Sudah dipakai…"), sisa siap posting.
const iso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v.slice(0, 40) : null);
function cleanDrive(d) {
  if (!d || typeof d !== 'object') return null;
  const videos = int(d.videos); const used = Math.min(int(d.used), videos);
  return { videos, used, ready: videos - used, last_activity: iso(d.last_activity), checked_at: iso(d.checked_at) };
}

// Isi heartbeat dari agen → daftar produk yang aman ditampilkan (data dari luar, jadi divalidasi ketat).
export function cleanMacProducts(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const p of list.slice(0, 50)) {
    if (!p || typeof p !== 'object' || typeof p.slug !== 'string' || !SLUG.test(p.slug)) continue;
    out.push({
      slug: p.slug,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 80) : p.slug,
      brand_id: Number.isInteger(p.brand_id) ? p.brand_id : null,
      done: int(p.done), quota: int(p.quota), total: int(p.total), today: int(p.today),
      failed: int(p.failed), in_progress: int(p.in_progress),
      last_at: typeof p.last_at === 'string' ? p.last_at.slice(0, 40) : null,
      folder_url: typeof p.folder_url === 'string' && p.folder_url.startsWith('https://drive.google.com/') ? p.folder_url.slice(0, 300) : null,
      drive: cleanDrive(p.drive),
    });
  }
  return out;
}

export const macName = (products, slug) => products.find((p) => p.slug === slug)?.name || slug;

// Validasi + insert request "tambah video produk Mac". brandId null = brand diambil dari pemetaan agen (Hermes).
// Return { job_id } atau { status, error }.
export async function createMacJob(db, products, { brandId = null, slug, target, cta, by }) {
  const t = typeof target === 'string' && target.trim() !== '' ? Number(target) : target;
  if (!Number.isInteger(t) || t < 1 || t > 20000) return { status: 400, error: 'Target harus bilangan bulat 1 sampai 20.000' };
  if (!CTAS.includes(cta)) return { status: 400, error: 'CTA harus kerkun, awareness, atau campur' };
  const p = products.find((x) => x.slug === slug);
  if (!p || (brandId !== null && p.brand_id !== brandId)) return { status: 404, error: 'Produk Mac nggak ketemu (atau bukan milik brand ini)' };
  if (!Number.isInteger(p.brand_id)) return { status: 400, error: `Produk ${p.name} belum dipetakan ke brand TIM-AI (config/timai.json di Mac)` };
  const ts = now();
  const [row] = await db.run(
    'INSERT INTO factory_jobs (brand_id, product_id, mac_product, target, cta, footage_url, options, status, created_by, created_at, updated_at) VALUES (?, 0, ?, ?, ?, \'\', \'{}\', \'antre\', ?, ?, ?) RETURNING id',
    p.brand_id, p.slug, t, cta, String(by || '').slice(0, 80) || null, ts, ts,
  );
  return { job_id: row.id };
}
