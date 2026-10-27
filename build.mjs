// Build frontend untuk deploy (dijalankan Vercel lewat "npm run build"): satu file JS + satu file CSS, diminify.
// Hasil di public/dist/ (tidak di-commit). index.html memakai hasil ini kalau ada, kalau tidak memuat modul satu per satu.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Modul memakai path absolut (mis. '/motion-engine.js'); arahkan ke public/. /vendor/* tetap dimuat terpisah saat runtime.
const publicRoot = { name: 'public-root', setup(b) { b.onResolve({ filter: /^\/[^/].*\.js$/ }, (a) => (a.path.startsWith('/vendor/') ? { path: a.path, external: true } : { path: resolve('public', a.path.slice(1)) })); } };

const t0 = Date.now();
mkdirSync('public/dist', { recursive: true });
await build({
  entryPoints: ['public/main.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  external: ['/vendor/*'],
  plugins: [publicRoot],
  outfile: 'public/dist/app.min.js',
  logLevel: 'warning',
});
// CSS: urutan sama dengan <link> di index.html (yang belakangan menimpa yang depan).
const css = ['style.css', 'ds.css', 'agents.css', 'focus.css'].map((f) => readFileSync(`public/${f}`, 'utf8')).join('\n');
writeFileSync('public/dist/_all.css', css);
await build({ entryPoints: ['public/dist/_all.css'], bundle: true, minify: true, outfile: 'public/dist/app.min.css', logLevel: 'warning', external: ['/*'] });
rmSync('public/dist/_all.css');
const size = (f) => `${Math.round(readFileSync(f).length / 1024)} KB`;
console.log(`build selesai ${Date.now() - t0} ms · app.min.js ${size('public/dist/app.min.js')} · app.min.css ${size('public/dist/app.min.css')}`);
