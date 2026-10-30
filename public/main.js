// Daftar modul frontend, urutannya penting (app.js dulu karena memasang window.siarin; focus.js & icons.js sebelum
// shell.js; assistant.js terakhir). Saat deploy, build.mjs mem-bundle file ini jadi /dist/app.min.js.
// Tanpa build (jalan lokal), index.html memuat file ini langsung sebagai ES module biasa.
import './app.js';
import './suite.js';
import './motion.js';
import './teams.js';
import './inbox.js';
import './team-ai.js';
import './ads.js';
import './partner-tools.js';
import './partners.js';
import './lp-builder.js';
import './integrations.js';
import './ai-hub.js';
import './ops.js';
import './growth.js';
import './bento.js';
import './planner-views.js';
import './divisions.js';
import './medsos.js';
import './studio-ai.js';
import './store.js';
import './agents.js';
import './cs-closer.js';
import './today.js';
import './free-tools.js';
import './google.js'; // setelah suite.js: membungkus hook menu Tim
import './focus.js';
import './icons.js';
import './shell.js';
import './assistant.js';
