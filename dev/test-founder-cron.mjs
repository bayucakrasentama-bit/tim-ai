// Uji runFounderBriefs di database lokal: brand dengan jadwal aktif & jam sudah lewat → ditandai terkirim sekali saja.
import { bootstrap } from '../src/bootstrap.js';
import { runFounderBriefs, loadFounder } from '../src/founder.js';
import { setSetting } from '../src/db.js';
const { db } = await bootstrap();
const brand = await db.get('SELECT * FROM brands ORDER BY id LIMIT 1');
await setSetting(db, `founder:${brand.id}`, JSON.stringify({ enabled: true, hour: 0, days: 1, teams: ['adv', 'cs'], last_sent: null }));
await runFounderBriefs(db);
const a = await loadFounder(db, brand.id);
await runFounderBriefs(db); // kedua kali: tidak boleh kirim lagi
const b = await loadFounder(db, brand.id);
await setSetting(db, `founder:${brand.id}`, JSON.stringify({ enabled: false, hour: 6, days: 1, teams: ['adv', 'mp', 'medsos', 'cs'], last_sent: null }));
console.log(JSON.stringify({ brand: brand.name, last_sent_after_first: a.last_sent, same_after_second: a.last_sent === b.last_sent }));
process.exit(0);
