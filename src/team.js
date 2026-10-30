// Multi-brand (workspace) & multi-user.
// Setiap request ke data (akun, post, planner, analitik) berlaku untuk satu brand:
// dipilih lewat header X-Brand-Id, kalau kosong pakai brand pertama yang boleh diakses.
import { now } from './db.js';
import { canManage, googleOnlyHash, hashPassword, TEAMS } from './auth.js';
import { ownerEmail, validEmail } from './google-login.js';

// lead = Lead/Supervisor: lintas divisi & berhak Approve / Request Revision kartu Planner (tidak kelola tim).
const ROLES = ['admin', 'lead', 'member'];
const cleanName = (s) => String(s ?? '').trim();

export async function brandsFor(db, user) {
  if (canManage(user)) return db.all('SELECT * FROM brands ORDER BY id');
  return db.all(`
    SELECT b.* FROM brands b JOIN brand_members m ON m.brand_id = b.id
    WHERE m.user_id = ? ORDER BY b.id
  `, user.id);
}

// Middleware: isi req.brand dari header, tolak kalau user tidak punya akses.
export function brandScope(db) {
  return async (req, res, next) => {
    const brands = await brandsFor(db, req.user);
    const wanted = Number(req.get('x-brand-id') || req.query.brand || 0);
    const brand = wanted ? brands.find((b) => b.id === wanted) : brands[0];
    if (!brand) {
      return res.status(wanted ? 403 : 400).json({
        error: wanted ? 'Kamu tidak punya akses ke brand ini' : 'Kamu belum ditambahkan ke brand mana pun. Minta admin menambahkanmu.',
      });
    }
    req.brand = brand;
    next();
  };
}

const manageOnly = (req, res, next) => (canManage(req.user) ? next() : res.status(403).json({ error: 'Cuma pemilik/admin yang bisa melakukan ini' }));

export function teamRoutes(app, db, { ownerUsername, authEnabled, scope }) {
  app.get('/api/me', async (req, res) => {
    // email: akun Google user ini, dipakai tombol Gemini (?authuser=) supaya terbuka di akun yang benar.
    const email = req.user.id === 0 ? await ownerEmail(db) : req.user.email || '';
    res.json({ user: { ...req.user, email }, brands: await brandsFor(db, req.user), authEnabled });
  });

  // ---- Brand ----
  app.get('/api/brands', async (req, res) => res.json(await brandsFor(db, req.user)));

  app.post('/api/brands', manageOnly, async (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Nama brand wajib diisi' });
    const [brand] = await db.run(
      'INSERT INTO brands (name, description, color, created_at) VALUES (?, ?, ?, ?) RETURNING *',
      name, String(req.body?.description || ''), String(req.body?.color || '#7c6cf0'), now(),
    );
    res.status(201).json(brand);
  });

  app.patch('/api/brands/:id', async (req, res) => {
    const brand = (await brandsFor(db, req.user)).find((b) => b.id === Number(req.params.id));
    if (!brand) return res.status(404).json({ error: 'Brand tidak ditemukan' });
    // Member boleh melengkapi profil brand (dipakai AI), tapi ganti nama/warna cuma admin.
    const next = { ...brand };
    if (req.body?.description !== undefined) next.description = String(req.body.description);
    if (canManage(req.user)) {
      if (req.body?.name !== undefined) next.name = cleanName(req.body.name) || brand.name;
      if (req.body?.color !== undefined) next.color = String(req.body.color);
    }
    const [row] = await db.run(
      'UPDATE brands SET name = ?, description = ?, color = ? WHERE id = ? RETURNING *',
      next.name, next.description, next.color, brand.id,
    );
    res.json(row);
  });

  app.delete('/api/brands/:id', manageOnly, async (req, res) => {
    const id = Number(req.params.id);
    const count = (await db.get('SELECT COUNT(*) AS n FROM brands')).n;
    if (Number(count) <= 1) return res.status(400).json({ error: 'Minimal harus ada satu brand' });
    const busy = await db.get("SELECT id FROM posts WHERE brand_id = ? AND status = 'publishing'", id);
    if (busy) return res.status(400).json({ error: 'Ada post brand ini yang sedang dikirim, tunggu sebentar' });
    // Akun & post tidak punya foreign key ke brand (kolom tambahan), jadi dihapus manual.
    await db.run('DELETE FROM posts WHERE brand_id = ?', id);
    await db.run('DELETE FROM accounts WHERE brand_id = ?', id);
    await db.run('DELETE FROM brands WHERE id = ?', id);
    res.status(204).end();
  });

  // ---- Anggota tim ----
  const publicUser = async (u) => ({
    id: u.id,
    username: u.username,
    email: u.email || '',
    role: u.role,
    team: TEAMS.includes(u.team) ? u.team : 'semua',
    created_at: u.created_at,
    brandIds: (await db.all('SELECT brand_id FROM brand_members WHERE user_id = ? ORDER BY brand_id', u.id)).map((r) => r.brand_id),
  });

  async function setBrands(userId, brandIds) {
    await db.run('DELETE FROM brand_members WHERE user_id = ?', userId);
    const valid = new Set((await db.all('SELECT id FROM brands')).map((b) => b.id));
    for (const id of new Set((brandIds || []).map(Number))) {
      if (valid.has(id)) await db.run('INSERT INTO brand_members (brand_id, user_id) VALUES (?, ?)', id, userId);
    }
  }

  app.get('/api/users', manageOnly, async (_req, res) => {
    const users = await db.all('SELECT * FROM users ORDER BY username');
    res.json(await Promise.all(users.map(publicUser)));
  });

  app.post('/api/users', manageOnly, async (req, res) => {
    if (!authEnabled) return res.status(400).json({ error: 'Aktifkan login dulu (set APP_PASSWORD) sebelum menambah anggota tim' });
    const username = cleanName(req.body?.username).toLowerCase();
    const password = String(req.body?.password || '');
    const role = ROLES.includes(req.body?.role) ? req.body.role : 'member';
    const team = TEAMS.includes(req.body?.team) ? req.body.team : 'semua';
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: 'Username 3-32 karakter: huruf kecil, angka, titik, strip, atau garis bawah' });
    if (username === ownerUsername.toLowerCase()) return res.status(400).json({ error: 'Username ini dipakai pemilik' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (email && !validEmail(email)) return res.status(400).json({ error: 'Email Google tidak valid' });
    // Boleh tanpa password kalau anggota login pakai Google.
    if (!email && password.length < 8) return res.status(400).json({ error: 'Isi email Google, atau password minimal 8 karakter' });
    if (password && password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter' });
    if (await db.get('SELECT id FROM users WHERE username = ?', username)) return res.status(400).json({ error: 'Username sudah dipakai' });
    if (email && (await db.get('SELECT id FROM users WHERE LOWER(email) = ?', email))) return res.status(400).json({ error: 'Email ini sudah dipakai anggota lain' });
    const [user] = await db.run(
      'INSERT INTO users (username, password_hash, role, team, email, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
      username, password ? await hashPassword(password) : googleOnlyHash(), role, team, email || null, now(),
    );
    await setBrands(user.id, req.body?.brandIds);
    res.status(201).json(await publicUser(user));
  });

  app.patch('/api/users/:id', manageOnly, async (req, res) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', Number(req.params.id));
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    if (req.body?.password !== undefined && req.body.password !== '') {
      if (String(req.body.password).length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter' });
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(String(req.body.password)), user.id);
    }
    if (req.body?.email !== undefined) {
      const email = String(req.body.email).trim().toLowerCase();
      if (email && !validEmail(email)) return res.status(400).json({ error: 'Email Google tidak valid' });
      if (email && (await db.get('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?', email, user.id))) return res.status(400).json({ error: 'Email ini sudah dipakai anggota lain' });
      await db.run('UPDATE users SET email = ? WHERE id = ?', email || null, user.id);
    }
    if (ROLES.includes(req.body?.role)) await db.run('UPDATE users SET role = ? WHERE id = ?', req.body.role, user.id);
    if (TEAMS.includes(req.body?.team)) await db.run('UPDATE users SET team = ? WHERE id = ?', req.body.team, user.id);
    if (Array.isArray(req.body?.brandIds)) await setBrands(user.id, req.body.brandIds);
    res.json(await publicUser(await db.get('SELECT * FROM users WHERE id = ?', user.id)));
  });

  app.delete('/api/users/:id', manageOnly, async (req, res) => {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
    await db.run('DELETE FROM users WHERE id = ?', Number(req.params.id));
    res.status(204).end();
  });

  // Daftar orang yang bisa ditugaskan di planner (pemilik + anggota brand ini).
  app.get('/api/assignees', scope, async (req, res) => {
    const brandId = req.brand.id;
    const rows = await db.all(`
      SELECT DISTINCT u.id, u.username FROM users u
      LEFT JOIN brand_members m ON m.user_id = u.id
      WHERE u.role = 'admin' OR m.brand_id = ? ORDER BY u.username
    `, brandId);
    res.json([{ id: 0, username: ownerUsername }, ...rows]);
  });
}
