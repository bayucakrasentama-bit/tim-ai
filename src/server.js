// Menjalankan TIM-AI di komputer sendiri (npm start).
import { bootstrap } from './bootstrap.js';
import { connectors } from './connectors/index.js';
import { startScheduler } from './publisher.js';
import { refreshStale } from './tiktok.js';
import { syncAll } from './inbox/service.js';

const port = Number(process.env.PORT || 4321);
const { app, db } = await bootstrap();
startScheduler(db, connectors, Number(process.env.SIARIN_SCHEDULER_MS || 15000));
// Scraper TikTok: perbarui link yang sudah lewat 6 jam, dicek tiap menit.
setInterval(() => refreshStale(db).catch((err) => console.error(err)), 60_000);
// Inbox CS: tarik chat baru dari marketplace tiap menit (cadangan kalau webhook belum dipasang).
setInterval(() => syncAll(db).catch((err) => console.error(err)), 60_000);

app.listen(port, '127.0.0.1', () => {
  console.log(`TIM-AI jalan di http://localhost:${port}`);
});
