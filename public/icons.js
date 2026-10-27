// Ikon garis seragam (gaya Lucide, 24×24, stroke 1.8) menggantikan emoji di UI: tombol, tab, judul, label, kartu, sidebar.
// Bekerja terpusat lewat MutationObserver, jadi modul lama tidak perlu diubah. Isi buatan pengguna/AI (hasil AI, chat,
// pesan WhatsApp, textarea, kode) tidak disentuh. Emoji yang belum punya ikon dihapus dari label.
const P = {
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10" r="1"/><path d="M12 21c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  trending: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  message: '<path d="M4 4h16v12H8l-4 4z"/>',
  bot: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6"/>',
  branch: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 8v8M18 10a6 6 0 0 1-6 6H8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  building: '<path d="M3 21h18M5 21V5l7-3 7 3v16"/><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4"/>',
  rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2m6.5-12.5a6 6 0 0 1 4 4L13 15l-4-4z"/><circle cx="15" cy="9" r="1.5"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  megaphone: '<path d="M3 10v4h3l6 4V6L6 10z"/><path d="M16 8a5 5 0 0 1 0 8"/>',
  cart: '<path d="M4 8h16l-1.5 12h-13z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  star: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  clip: '<path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-6.5 0-3.5-2.5-5.5-3.5-8.5-.5 2-1.5 3-3 3.5C13 7 12 4 9 2c0 4-4 6.5-4 11.5C5 19.3 8 22 12 22z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  truck: '<path d="M1 4h14v12H1zM15 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  gift: '<rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  video: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 10l4-2v8l-4-2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4L3.4 17a2 2 0 0 1 2.8-2.8L8 16"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
};
const EMOJI = {
  '🔔': 'bell', '📷': 'camera', '📸': 'camera', '✨': 'sparkles', '🎨': 'palette', '🧲': 'layout', '🎣': 'zap', '⚡': 'zap', '🧠': 'heart', '💡': 'bulb',
  '⚙': 'gear', '🛠': 'gear', '🔧': 'gear', '📈': 'trending', '📊': 'chart', '📉': 'chart', '🔁': 'repeat', '🔄': 'refresh', '🧩': 'box', '📦': 'box', '📘': 'book', '📖': 'book', '📚': 'book',
  '🔍': 'search', '🔎': 'search', '✒': 'pen', '✍': 'pen', '✏': 'pen', '📝': 'file', '💬': 'message', '🗨': 'message', '🤖': 'bot', '🎼': 'branch', '👤': 'user', '👥': 'user', '🧑': 'user',
  '🏢': 'building', '🏬': 'building', '🚀': 'rocket', '📱': 'phone', '📞': 'phone', '📣': 'megaphone', '📢': 'megaphone', '🛒': 'cart', '🛍': 'cart', '⭐': 'star', '🌟': 'star', '🔗': 'link',
  '⏰': 'clock', '⏱': 'clock', '🕒': 'clock', '⏳': 'clock', '📌': 'pin', '📍': 'pin', '🧾': 'receipt', '✅': 'check', '☑': 'check', '✔': 'check', '🎉': 'check', '⚠': 'alert', '❗': 'alert', '🚨': 'alert',
  '📎': 'clip', '🗑': 'trash', '📥': 'download', '⬇': 'download', '📤': 'upload', '⬆': 'upload', '🎬': 'film', '🎞': 'film', '🎙': 'mic', '🎤': 'mic', '🖼': 'image', '🌄': 'image', '📅': 'calendar', '🗓': 'calendar', '📆': 'calendar',
  '💰': 'coin', '💸': 'coin', '💵': 'coin', '🔥': 'flame', '🎯': 'target', '🏆': 'trophy', '🥇': 'trophy', '📄': 'file', '📋': 'file', '🗂': 'file', '💳': 'card', '🚚': 'truck', '🎁': 'gift',
  '↗': 'external', '☀': 'sun', '🚩': 'flag', '🎥': 'video', '📹': 'video', '▶': 'video', '🔑': 'key', '🔐': 'lock', '🔒': 'lock', '🌐': 'globe', '📧': 'mail', '✉': 'mail', '🎵': 'music', '🔊': 'music',
  '👀': 'eye', '👁': 'eye', '👋': 'hand', '🙏': 'hand', '🟢': 'dot', '🔴': 'dot', '🟡': 'dot',
};
export const icon = (name, cls = 'ui-ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.dot}</svg>`;

const RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*️?/gu;
// Elemen "chrome" UI yang emojinya diganti ikon. Isi buatan pengguna/AI dikecualikan.
const SEL = 'button, .btn, a.btn, label.btn, .tabs > *, .tab-menu > button, h1, h2, h3, h4, .label, .kpi-label, .hint, .tag, .ag-ic, .ag-card b, .vo-avatar, .vo-room-head, .td-head, .org-th, .org-agent, .mbcs-title, .fo-step b, .check .head, .row-between > b, summary, option, .empty, .td-title, .td-dot, .ub-name';
const SKIP = '.md, .msg, .chat, .fo-wa, pre, code, textarea, input, [contenteditable], .tt-cap, .script, .md-code, .studio-frame, .lp-canvas, .cs-media-wrap, .td-body .hint, .vo-log';

function fix(el) {
  if (el.closest(SKIP)) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (RE.test(n.nodeValue) && !n.parentElement.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    RE.lastIndex = 0;
    const text = n.nodeValue;
    if (n.parentElement.tagName === 'OPTION') { n.nodeValue = text.replace(RE, '').replace(/^\s+/, ''); continue; }
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(RE)) {
      frag.append(text.slice(last, m.index));
      const base = m[0].replace(/[️‍]/g, '');
      const name = EMOJI[base] || EMOJI[[...base][0]];
      if (name) { const t = document.createElement('template'); t.innerHTML = icon(name); frag.append(t.content); }
      last = m.index + m[0].length;
    }
    frag.append(text.slice(last).replace(/^\s{2,}/, ' '));
    n.replaceWith(frag);
  }
}
RE.test = function test(s) { this.lastIndex = 0; return RegExp.prototype.test.call(this, s); };

let queued = false;
function run() {
  queued = false;
  const roots = [document.querySelector('.view.active'), document.getElementById('modal'), document.getElementById('sidebar'), document.querySelector('.cmdk'), document.querySelector('.hub-tabs'), document.querySelector('.asst')].filter(Boolean);
  for (const r of roots) {
    if (r.matches(SEL)) fix(r);
    r.querySelectorAll(SEL).forEach(fix);
  }
  obs.takeRecords();
}
const obs = new MutationObserver(() => { if (!queued) { queued = true; setTimeout(run, 0); } });
obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
run();
window.timIcon = icon;
