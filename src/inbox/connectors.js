// Konektor chat resmi: Shopee (SellerChat), TikTok Shop (Customer Service, termasuk pembeli Tokopedia),
// Lazada (IM), WhatsApp (Cloud API), Instagram (Messaging), plus Simulasi untuk latihan.
// Semua butuh app developer yang sudah disetujui platform masing-masing (lihat panduan di tiap konektor).
// Base URL bisa diganti lewat env supaya tes memakai server tiruan.
import { hmacHex, safeEqual, toIso, parseJson, readApi } from './common.js';
import { GRAPH_VERSION } from '../connectors/http.js';

const env = (k, d) => process.env[k] || d;
const base = {
  shopee: () => env('SIARIN_SHOPEE_BASE', 'https://partner.shopeemobile.com'),
  tts: () => env('SIARIN_TTS_BASE', 'https://open-api.tiktokglobalshop.com'),
  ttsAuth: () => env('SIARIN_TTS_AUTH_BASE', 'https://auth.tiktok-shops.com'),
  lazada: () => env('SIARIN_LAZADA_BASE', 'https://api.lazada.co.id/rest'),
  lazadaAuth: () => env('SIARIN_LAZADA_AUTH_BASE', 'https://auth.lazada.com/rest'),
  graph: () => env('SIARIN_GRAPH_BASE', 'https://graph.facebook.com'),
};
const nowSec = () => Math.floor(Date.now() / 1000);
const need = (c, keys, label) => {
  const missing = keys.filter((k) => !c?.[k]);
  if (missing.length) throw new Error(`${label}: kredensial belum lengkap (${missing.join(', ')}). Hubungkan ulang toko di Pengaturan Inbox.`);
};

// =====================================================================
// SIMULASI: buat latihan & tes. Pesan pembeli dibuat dari tombol "Simulasikan pesan masuk".
// =====================================================================
const simulasi = {
  id: 'simulasi', label: 'Simulasi', color: '#64748b', fields: [],
  guide: { intro: 'Channel pura-pura untuk mencoba inbox, auto-reply, dan laporan tanpa akun marketplace.', steps: [] },
  async listConversations() { return { conversations: [] }; },
  async listMessages() { return { messages: [] }; },
  async sendMessage(c, conv, msg) {
    if (/#gagal/.test(msg.text || '')) throw new Error('Simulasi: pesan gagal terkirim (mengandung #gagal)');
    return { external_id: `sim_out_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, sent_at: new Date().toISOString() };
  },
  async markRead() {},
  async listOrders() { return { orders: [] }; },
};

// =====================================================================
// SHOPEE Open Platform v2 (SellerChat). Tanda tangan: HMAC-SHA256(partner_key, partner_id + path + timestamp [+ access_token + shop_id]).
// =====================================================================
const SHOPEE_STATUS = { UNPAID: 'unpaid', READY_TO_SHIP: 'paid', PROCESSED: 'paid', SHIPPED: 'shipped', TO_CONFIRM_RECEIVE: 'delivered', COMPLETED: 'completed', IN_CANCEL: 'cancelled', CANCELLED: 'cancelled', TO_RETURN: 'failed' };

function shopeeUrl(c, path, query = {}, withShop = true) {
  const ts = nowSec();
  const signBase = `${c.partnerId}${path}${ts}${withShop ? `${c.accessToken}${c.shopId}` : ''}`;
  const q = new URLSearchParams({ partner_id: String(c.partnerId), timestamp: String(ts), sign: hmacHex(c.partnerKey, signBase), ...(withShop ? { access_token: c.accessToken, shop_id: String(c.shopId) } : {}), ...query });
  return `${base.shopee()}${path}?${q}`;
}

async function shopeeToken(c) {
  if (c.accessToken && c.expireAt && Date.now() < c.expireAt - 5 * 60_000) return { c, changed: false };
  need(c, ['partnerId', 'partnerKey', 'shopId', 'refreshToken'], 'Shopee');
  const path = '/api/v2/auth/access_token/get';
  const res = await fetch(shopeeUrl(c, path, {}, false), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: c.refreshToken, shop_id: Number(c.shopId), partner_id: Number(c.partnerId) }),
  });
  const b = await readApi(res, 'Shopee (token)');
  return { c: { ...c, accessToken: b.access_token, refreshToken: b.refresh_token || c.refreshToken, expireAt: Date.now() + (b.expire_in || 14400) * 1000 }, changed: true };
}

async function shopeeCall(c0, method, path, { query = {}, body, form } = {}) {
  const { c, changed } = await shopeeToken(c0);
  const res = await fetch(shopeeUrl(c, path, query), {
    method,
    headers: form ? undefined : { 'Content-Type': 'application/json' },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const b = await readApi(res, `Shopee (${path.split('/').pop()})`);
  return { data: b.response ?? b, credentials: changed ? c : null };
}

function shopeeMessage(m, shopId) {
  const t = String(m.message_type || 'text').toLowerCase();
  const content = parseJson(m.content, {});
  const type = t === 'text' ? 'text' : t === 'image' ? 'image' : t === 'video' ? 'video' : t === 'item' || t === 'product' ? 'product' : t === 'order' ? 'order' : t === 'sticker' ? 'sticker' : 'other';
  return {
    external_id: String(m.message_id),
    direction: String(m.from_shop_id || '') === String(shopId) ? 'out' : 'in',
    sender: m.from_user_name || '',
    type,
    text: content.text || (type === 'order' ? `Pesanan ${content.order_sn || ''}` : type === 'product' ? `Produk ${content.item_id || ''}` : ''),
    media_url: content.url || content.image_url || content.thumb_url || null,
    sent_at: toIso(m.created_timestamp),
    meta: { content },
  };
}

const shopee = {
  id: 'shopee', label: 'Shopee', color: '#ee4d2d',
  fields: [
    { key: 'partnerId', label: 'Partner ID (app Shopee Open Platform)' },
    { key: 'partnerKey', label: 'Partner Key', secret: true },
  ],
  guide: {
    intro: 'Shopee Open Platform: daftar sebagai pemilik toko (Seller In-house System), buat app, ajukan izin modul SellerChat & Order, tunggu Go Live.',
    steps: [
      'Daftar di open.shopee.com → Console → Create App → kategori "Seller In-house System".',
      'Isi Redirect URL: {{REDIRECT}}. Setelah app Go Live, salin Partner ID & Partner Key (Live).',
      'Ajukan izin API SellerChat (chat pembeli) dan Order. Tanpa izin SellerChat, Shopee menolak akses chat.',
      'Isi Partner ID & Key di sini, klik Hubungkan, login sebagai pemilik toko, lalu pilih tokonya.',
      'Opsional: daftarkan Push URL {{WEBHOOK}} di Console supaya chat baru masuk seketika (tanpa itu, TIM-AI mengecek tiap menit).',
    ],
    links: [['Shopee Open Platform', 'https://open.shopee.com']],
  },
  oauth: {
    start(c, redirect) {
      need(c, ['partnerId', 'partnerKey'], 'Shopee');
      const path = '/api/v2/shop/auth_partner';
      const ts = nowSec();
      return `${base.shopee()}${path}?${new URLSearchParams({ partner_id: String(c.partnerId), timestamp: String(ts), sign: hmacHex(c.partnerKey, `${c.partnerId}${path}${ts}`), redirect })}`;
    },
    async finish(c, q) {
      if (!q.code || !q.shop_id) throw new Error('Shopee tidak mengirim code/shop_id');
      const path = '/api/v2/auth/token/get';
      const res = await fetch(shopeeUrl(c, path, {}, false), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: q.code, shop_id: Number(q.shop_id), partner_id: Number(c.partnerId) }),
      });
      const b = await readApi(res, 'Shopee (hubungkan)');
      return { ...c, shopId: String(q.shop_id), accessToken: b.access_token, refreshToken: b.refresh_token, expireAt: Date.now() + (b.expire_in || 14400) * 1000 };
    },
  },
  async listConversations(c) {
    const { data, credentials } = await shopeeCall(c, 'GET', '/api/v2/sellerchat/get_conversation_list', { query: { direction: 'latest', type: 'all', page_size: '25' } });
    return {
      credentials,
      conversations: (data.conversations || []).map((x) => ({
        external_id: String(x.conversation_id), customer_name: x.to_name || '', customer_id: String(x.to_id || ''), customer_avatar: x.to_avatar || null,
        unread: Number(x.unread_count || 0), last_message_at: toIso(x.last_message_timestamp), last_preview: x.latest_message_content?.text || '',
        can_reply: true, meta: {},
      })),
    };
  },
  async listMessages(c, conv) {
    const { data, credentials } = await shopeeCall(c, 'GET', '/api/v2/sellerchat/get_message', { query: { conversation_id: conv.external_id, page_size: '25' } });
    return { credentials, messages: (data.messages || []).map((m) => shopeeMessage(m, (credentials || c).shopId)).reverse() };
  },
  async sendMessage(c0, conv, msg) {
    let c = c0;
    let content = { text: msg.text };
    let type = 'text';
    let updated = null;
    if (msg.image) {
      const form = new FormData();
      form.set('file', new Blob([msg.image.buffer], { type: msg.image.mime }), msg.image.name || 'image.jpg');
      const up = await shopeeCall(c, 'POST', '/api/v2/sellerchat/upload_image', { form });
      if (up.credentials) c = updated = up.credentials;
      content = { image_url: up.data.url };
      type = 'image';
    }
    const r = await shopeeCall(c, 'POST', '/api/v2/sellerchat/send_message', { body: { to_id: Number(conv.customer_id), message_type: type, content } });
    return { external_id: String(r.data.message_id), sent_at: toIso(r.data.created_timestamp), credentials: r.credentials || updated };
  },
  async markRead(c, conv, lastId) {
    if (!lastId) return {};
    const r = await shopeeCall(c, 'POST', '/api/v2/sellerchat/read_conversation', { body: { conversation_id: Number(conv.external_id), last_read_message_id: String(lastId) } });
    return { credentials: r.credentials };
  },
  async listOrders(c0, { since }) {
    const now = nowSec();
    const list = await shopeeCall(c0, 'GET', '/api/v2/order/get_order_list', { query: { time_range_field: 'update_time', time_from: String(Math.max(Math.floor(since / 1000), now - 14 * 86400)), time_to: String(now), page_size: '50' } });
    const c = list.credentials || c0;
    const sns = (list.data.order_list || []).map((o) => o.order_sn);
    if (!sns.length) return { orders: [], credentials: list.credentials };
    const det = await shopeeCall(c, 'GET', '/api/v2/order/get_order_detail', { query: { order_sn_list: sns.join(','), response_optional_fields: 'buyer_user_id,buyer_username,total_amount,item_list' } });
    return {
      credentials: det.credentials || list.credentials,
      orders: (det.data.order_list || []).map((o) => ({
        external_id: o.order_sn, buyer_id: String(o.buyer_user_id || ''), buyer_name: o.buyer_username || '', raw_status: o.order_status,
        status: SHOPEE_STATUS[o.order_status] || 'paid', total: o.total_amount != null ? `Rp${Number(o.total_amount).toLocaleString('id-ID')}` : '',
        items: (o.item_list || []).map((i) => ({ name: i.item_name, qty: i.model_quantity_purchased || 1 })), ordered_at: toIso(o.create_time),
      })),
    };
  },
  webhook: {
    // Push Shopee: Authorization = HMAC-SHA256(partner_key, url + '|' + body).
    verify(req, c, url) { return safeEqual(req.headers.authorization, hmacHex(c.partnerKey || '', `${url}|${req.rawBody}`)); },
  },
};

// =====================================================================
// TIKTOK SHOP (Customer Service API 202309). Pembeli Tokopedia ikut di sini (buyer_platform = TOKOPEDIA).
// Tanda tangan: HMAC-SHA256(app_secret, app_secret + path + {key}{value} terurut + body + app_secret).
// =====================================================================
const TTS_STATUS = { UNPAID: 'unpaid', ON_HOLD: 'paid', AWAITING_SHIPMENT: 'paid', PARTIALLY_SHIPPING: 'shipped', AWAITING_COLLECTION: 'paid', IN_TRANSIT: 'shipped', DELIVERED: 'delivered', COMPLETED: 'completed', CANCELLED: 'cancelled' };

export function ttsSign(secret, path, query, body = '') {
  const keys = Object.keys(query).filter((k) => k !== 'sign' && k !== 'access_token').sort();
  const input = `${secret}${path}${keys.map((k) => `${k}${query[k]}`).join('')}${body}${secret}`;
  return hmacHex(secret, input);
}

async function ttsToken(c) {
  if (c.accessToken && c.accessExpireAt && Date.now() < c.accessExpireAt - 10 * 60_000) return { c, changed: false };
  need(c, ['appKey', 'appSecret', 'refreshToken'], 'TikTok Shop');
  const res = await fetch(`${base.ttsAuth()}/api/v2/token/refresh?${new URLSearchParams({ app_key: c.appKey, app_secret: c.appSecret, refresh_token: c.refreshToken, grant_type: 'refresh_token' })}`);
  const b = await readApi(res, 'TikTok Shop (token)', { okCode: 0 });
  const d = b.data;
  return { c: { ...c, accessToken: d.access_token, refreshToken: d.refresh_token || c.refreshToken, accessExpireAt: d.access_token_expire_in * 1000 }, changed: true };
}

async function ttsCall(c0, method, path, { query = {}, body, form, shop = true } = {}) {
  const { c, changed } = await ttsToken(c0);
  const q = { app_key: c.appKey, timestamp: String(nowSec()), ...(shop ? { shop_cipher: c.shopCipher } : {}), ...query };
  const raw = body ? JSON.stringify(body) : '';
  q.sign = ttsSign(c.appSecret, path, q, form ? '' : raw);
  const res = await fetch(`${base.tts()}${path}?${new URLSearchParams(q)}`, {
    method,
    headers: { 'x-tts-access-token': c.accessToken, ...(form ? {} : { 'Content-Type': 'application/json' }) },
    body: form || (body ? raw : undefined),
  });
  const b = await readApi(res, `TikTok Shop (${path.split('/').slice(3).join('/')})`, { okCode: 0 });
  return { data: b.data || {}, credentials: changed ? c : null };
}

function ttsMessage(m) {
  const content = parseJson(m.content, {});
  const t = m.type;
  const type = t === 'TEXT' || t === 'EMOTICONS' ? 'text' : t === 'IMAGE' ? 'image' : t === 'VIDEO' ? 'video'
    : ['PRODUCT_CARD', 'BUYER_ENTER_FROM_PRODUCT'].includes(t) ? 'product' : ['ORDER_CARD', 'BUYER_ENTER_FROM_ORDER', 'LOGISTICS_CARD', 'RETURN_REFUND_CARD'].includes(t) ? 'order'
      : ['NOTIFICATION', 'ALLOCATED_SERVICE', 'BUYER_ENTER_FROM_TRANSFER'].includes(t) ? 'system' : 'other';
  const role = m.sender?.role;
  return {
    external_id: String(m.id),
    direction: role === 'BUYER' ? 'in' : 'out',
    sender: role === 'BUYER' ? m.sender?.nickname || '' : role === 'SYSTEM' || role === 'ROBOT' ? 'Sistem' : m.sender?.nickname || 'Toko',
    type,
    text: content.content || (content.order_id ? `Pesanan ${content.order_id}` : content.product_id ? `Produk ${content.product_id}` : ''),
    media_url: content.url || null,
    sent_at: toIso(m.create_time),
    meta: { raw_type: t, content, visible: m.is_visible !== false, role },
  };
}

const tiktokshop = {
  id: 'tiktokshop', label: 'TikTok Shop / Tokopedia', color: '#111111',
  fields: [
    { key: 'appKey', label: 'App Key (TikTok Shop Partner Center)' },
    { key: 'appSecret', label: 'App Secret', secret: true },
    { key: 'serviceId', label: 'Service ID (untuk link otorisasi)' },
  ],
  guide: {
    intro: 'TikTok Shop Partner Center: buat app (Custom/In-house untuk toko sendiri) dengan izin Customer Service (seller.customer_service) dan Order. Pembeli Tokopedia ikut masuk lewat sini.',
    steps: [
      'Daftar di partner.tiktokshop.com sebagai developer, buat app untuk pasar Indonesia.',
      'Aktifkan scope Customer Service dan Order. Customer Service termasuk API khusus yang perlu disetujui TikTok.',
      'Isi Redirect URL app: {{REDIRECT}}. Salin App Key, App Secret, dan Service ID.',
      'Isi di sini, klik Hubungkan, login sebagai pemilik toko, setujui akses.',
      'Opsional: di Partner Center daftarkan webhook "New message" ke {{WEBHOOK}} supaya chat masuk seketika.',
    ],
    links: [['TikTok Shop Partner Center', 'https://partner.tiktokshop.com'], ['Customer Service API', 'https://partner.tiktokshop.com/docv2/page/customer-service-api-overview']],
  },
  oauth: {
    start(c, redirect, state) {
      need(c, ['appKey', 'appSecret', 'serviceId'], 'TikTok Shop');
      return `https://services.tiktokshop.com/open/authorize?${new URLSearchParams({ service_id: c.serviceId, state })}`;
    },
    async finish(c, q) {
      const code = q.code || q.auth_code;
      if (!code) throw new Error('TikTok Shop tidak mengirim kode otorisasi');
      const res = await fetch(`${base.ttsAuth()}/api/v2/token/get?${new URLSearchParams({ app_key: c.appKey, app_secret: c.appSecret, auth_code: code, grant_type: 'authorized_code' })}`);
      const d = (await readApi(res, 'TikTok Shop (hubungkan)', { okCode: 0 })).data;
      const next = { ...c, accessToken: d.access_token, refreshToken: d.refresh_token, accessExpireAt: d.access_token_expire_in * 1000, shopName: d.seller_name || '' };
      const { data } = await ttsCall(next, 'GET', '/authorization/202309/shops', { shop: false });
      const shop = (data.shops || []).find((s) => s.region === 'ID') || data.shops?.[0];
      if (!shop) throw new Error('Tidak ada toko yang diotorisasi untuk app ini');
      return { ...next, shopCipher: shop.cipher, shopId: shop.id, shopName: shop.name };
    },
  },
  async listConversations(c) {
    const { data, credentials } = await ttsCall(c, 'GET', '/customer_service/202309/conversations', { query: { page_size: '20', locale: 'id-ID' } });
    return {
      credentials,
      conversations: (data.conversations || []).map((x) => {
        const buyer = (x.participants || []).find((p) => p.role === 'BUYER') || {};
        const last = x.latest_message ? ttsMessage(x.latest_message) : null;
        return {
          external_id: String(x.id), customer_name: buyer.nickname || '', customer_id: String(buyer.user_id || ''), customer_avatar: buyer.avatar || null,
          customer_platform: buyer.buyer_platform === 'TOKOPEDIA' ? 'tokopedia' : 'tiktok',
          unread: Number(x.unread_count || 0), last_message_at: last ? last.sent_at : toIso(x.create_time), last_preview: last?.text || '',
          can_reply: x.can_send_message !== false, meta: {},
        };
      }),
    };
  },
  async listMessages(c, conv) {
    const { data, credentials } = await ttsCall(c, 'GET', `/customer_service/202309/conversations/${encodeURIComponent(conv.external_id)}/messages`, { query: { page_size: '10', locale: 'id-ID', sort_order: 'DESC' } });
    return { credentials, messages: (data.messages || []).map(ttsMessage).filter((m) => m.meta.visible).reverse() };
  },
  async sendMessage(c0, conv, msg) {
    let c = c0;
    let updated = null;
    let body = { type: 'TEXT', content: JSON.stringify({ content: msg.text }) };
    if (msg.image) {
      const form = new FormData();
      form.set('data', new Blob([msg.image.buffer], { type: msg.image.mime }), msg.image.name || 'image.jpg');
      const up = await ttsCall(c, 'POST', '/customer_service/202309/images/upload', { form });
      if (up.credentials) c = updated = up.credentials;
      body = { type: 'IMAGE', content: JSON.stringify({ url: up.data.url, width: up.data.width, height: up.data.height }) };
    }
    const r = await ttsCall(c, 'POST', `/customer_service/202309/conversations/${encodeURIComponent(conv.external_id)}/messages`, { body });
    return { external_id: String(r.data.message_id || `tts_${Date.now()}`), sent_at: new Date().toISOString(), credentials: r.credentials || updated };
  },
  async markRead(c, conv) {
    const r = await ttsCall(c, 'POST', `/customer_service/202309/conversations/${encodeURIComponent(conv.external_id)}/messages/read`, { body: {} });
    return { credentials: r.credentials };
  },
  async listOrders(c, { since }) {
    const { data, credentials } = await ttsCall(c, 'POST', '/order/202309/orders/search', { query: { page_size: '50', sort_field: 'update_time', sort_order: 'DESC' }, body: { update_time_ge: Math.floor(since / 1000) } });
    return {
      credentials,
      orders: (data.orders || []).map((o) => ({
        external_id: String(o.id), buyer_id: String(o.user_id || ''), buyer_name: o.recipient_address?.name || '', raw_status: o.status,
        status: TTS_STATUS[o.status] || 'paid', total: o.payment?.total_amount ? `Rp${Number(o.payment.total_amount).toLocaleString('id-ID')}` : '',
        items: (o.line_items || []).map((i) => ({ name: i.product_name, qty: 1 })), ordered_at: toIso(o.create_time),
      })),
    };
  },
  webhook: {
    // Webhook TikTok Shop: Authorization = HMAC-SHA256(app_secret, app_key + body).
    verify(req, c) { return safeEqual(req.headers.authorization, hmacHex(c.appSecret || '', `${c.appKey}${req.rawBody}`)); },
  },
};

// =====================================================================
// LAZADA Open Platform (IM). Tanda tangan: HMAC-SHA256(app_secret, api_path + {key}{value} terurut), hex huruf besar.
// =====================================================================
const LAZADA_STATUS = { unpaid: 'unpaid', pending: 'paid', packed: 'paid', ready_to_ship: 'paid', shipped: 'shipped', delivered: 'delivered', confirmed: 'completed', canceled: 'cancelled', failed_delivery: 'failed', returned: 'failed' };

export function lazadaSign(secret, apiPath, params) {
  const s = apiPath + Object.keys(params).filter((k) => k !== 'sign').sort().map((k) => `${k}${params[k]}`).join('');
  return hmacHex(secret, s).toUpperCase();
}

async function lazadaToken(c) {
  if (c.accessToken && c.expireAt && Date.now() < c.expireAt - 60 * 60_000) return { c, changed: false };
  need(c, ['appKey', 'appSecret', 'refreshToken'], 'Lazada');
  const p = { app_key: c.appKey, timestamp: String(Date.now()), sign_method: 'sha256', refresh_token: c.refreshToken };
  p.sign = lazadaSign(c.appSecret, '/auth/token/refresh', p);
  const b = await readApi(await fetch(`${base.lazadaAuth()}/auth/token/refresh?${new URLSearchParams(p)}`, { method: 'POST' }), 'Lazada (token)', { okCode: 0 });
  return { c: { ...c, accessToken: b.access_token, refreshToken: b.refresh_token || c.refreshToken, expireAt: Date.now() + (b.expires_in || 0) * 1000 }, changed: true };
}

async function lazadaCall(c0, method, apiPath, params = {}) {
  const { c, changed } = await lazadaToken(c0);
  const p = { app_key: c.appKey, timestamp: String(Date.now()), sign_method: 'sha256', access_token: c.accessToken, ...params };
  p.sign = lazadaSign(c.appSecret, apiPath, p);
  const url = `${base.lazada()}${apiPath}`;
  const res = method === 'GET' ? await fetch(`${url}?${new URLSearchParams(p)}`) : await fetch(url, { method: 'POST', body: new URLSearchParams(p) });
  const b = await readApi(res, `Lazada (${apiPath})`, { okCode: 0 });
  return { data: b.data || b, credentials: changed ? c : null };
}

function lazadaMessage(m) {
  const content = parseJson(m.content, {});
  const tpl = String(m.template_id);
  const type = tpl === '1' ? 'text' : tpl === '3' ? 'image' : tpl === '6' ? 'video' : tpl === '4' ? 'sticker' : tpl === '10006' ? 'product' : tpl === '10007' ? 'order' : 'other';
  return {
    external_id: String(m.message_id),
    direction: String(m.from_account_type) === '1' ? 'in' : 'out',
    sender: String(m.auto_reply) === 'true' ? 'Auto-reply Lazada' : '',
    type,
    text: content.txt || content.title || '',
    media_url: content.imgUrl || content.img_url || null,
    sent_at: toIso(m.send_time),
    meta: { content },
  };
}

const lazada = {
  id: 'lazada', label: 'Lazada', color: '#0f146d',
  fields: [
    { key: 'appKey', label: 'App Key (Lazada Open Platform)' },
    { key: 'appSecret', label: 'App Secret', secret: true },
  ],
  guide: {
    intro: 'Lazada Open Platform: buat app kategori "In-House IM Chat" dan masukkan Seller ID toko ke whitelist.',
    steps: [
      'Masuk open.lazada.com → App Management → Create App → pilih "In-House IM Chat".',
      'Setelah disetujui, tambahkan Seller ID toko di "Authorized Seller Whitelist".',
      'Isi Callback URL: {{REDIRECT}}. Salin App Key & App Secret.',
      'Isi di sini, klik Hubungkan, login akun penjual Lazada.',
    ],
    links: [['Lazada Open Platform', 'https://open.lazada.com']],
  },
  oauth: {
    start(c, redirect, state) {
      need(c, ['appKey', 'appSecret'], 'Lazada');
      return `https://auth.lazada.com/oauth/authorize?${new URLSearchParams({ response_type: 'code', force_auth: 'true', redirect_uri: redirect, client_id: c.appKey, state })}`;
    },
    async finish(c, q) {
      if (!q.code) throw new Error('Lazada tidak mengirim code');
      const p = { app_key: c.appKey, timestamp: String(Date.now()), sign_method: 'sha256', code: q.code };
      p.sign = lazadaSign(c.appSecret, '/auth/token/create', p);
      const b = await readApi(await fetch(`${base.lazadaAuth()}/auth/token/create?${new URLSearchParams(p)}`, { method: 'POST' }), 'Lazada (hubungkan)', { okCode: 0 });
      return { ...c, accessToken: b.access_token, refreshToken: b.refresh_token, expireAt: Date.now() + (b.expires_in || 0) * 1000, account: b.account || '' };
    },
  },
  async listConversations(c) {
    const { data, credentials } = await lazadaCall(c, 'GET', '/im/session/list', { start_time: String(Date.now()), page_size: '20' });
    return {
      credentials,
      conversations: (data.session_list || []).map((x) => ({
        external_id: String(x.session_id), customer_name: x.title || '', customer_id: String(x.buyer_id || ''), customer_avatar: x.head_url || null,
        unread: Number(x.unread_count || 0), last_message_at: toIso(x.last_message_time), last_preview: x.summary || '', can_reply: true,
        meta: { last_message_id: x.last_message_id },
      })),
    };
  },
  async listMessages(c, conv) {
    const { data, credentials } = await lazadaCall(c, 'GET', '/im/message/list', { session_id: conv.external_id, start_time: String(Date.now()), page_size: '20' });
    return { credentials, messages: (data.message_list || []).map(lazadaMessage).reverse() };
  },
  async sendMessage(c0, conv, msg) {
    let params = { session_id: conv.external_id, template_id: '1', txt: msg.text };
    let c = c0;
    let updated = null;
    if (msg.image) {
      // Gambar harus di-host Lazada dulu.
      const { c: cc, changed } = await lazadaToken(c);
      c = cc;
      if (changed) updated = cc;
      const p = { app_key: c.appKey, timestamp: String(Date.now()), sign_method: 'sha256', access_token: c.accessToken };
      p.sign = lazadaSign(c.appSecret, '/image/upload', p);
      const form = new FormData();
      for (const [k, v] of Object.entries(p)) form.set(k, v);
      form.set('image', new Blob([msg.image.buffer], { type: msg.image.mime }), msg.image.name || 'image.jpg');
      const up = await readApi(await fetch(`${base.lazada()}/image/upload`, { method: 'POST', body: form }), 'Lazada (upload gambar)', { okCode: 0 });
      params = { session_id: conv.external_id, template_id: '3', img_url: up.data?.image?.url, width: '800', height: '800' };
    }
    const r = await lazadaCall(c, 'POST', '/im/message/send', params);
    return { external_id: String(r.data.message_id || `lzd_${Date.now()}`), sent_at: toIso(r.data.current_time), credentials: r.credentials || updated };
  },
  async markRead(c, conv, lastId) {
    if (!lastId) return {};
    const r = await lazadaCall(c, 'POST', '/im/session/read', { session_id: conv.external_id, last_read_message_id: String(lastId) });
    return { credentials: r.credentials };
  },
  async listOrders(c, { since }) {
    const { data, credentials } = await lazadaCall(c, 'GET', '/orders/get', { update_after: new Date(since).toISOString().replace(/\.\d+Z$/, '+00:00'), limit: '50', sort_direction: 'DESC' });
    return {
      credentials,
      orders: (data.orders || []).map((o) => {
        const st = String(o.statuses?.[0] || '').toLowerCase();
        return {
          external_id: String(o.order_id), buyer_id: String(o.customer_id || ''), buyer_name: `${o.customer_first_name || ''} ${o.customer_last_name || ''}`.trim(),
          raw_status: st, status: LAZADA_STATUS[st] || 'paid', total: o.price ? `Rp${Number(String(o.price).replace(/,/g, '')).toLocaleString('id-ID')}` : '',
          items: [{ name: `${o.items_count || 1} barang`, qty: Number(o.items_count || 1) }], ordered_at: toIso(o.created_at),
        };
      }),
    };
  },
  webhook: {
    verify(req, c) { return safeEqual(req.headers.authorization, hmacHex(c.appSecret || '', `${c.appKey}${req.rawBody}`)); },
  },
};

// =====================================================================
// META: WhatsApp Cloud API & Instagram Messaging. Webhook: X-Hub-Signature-256 = sha256=HMAC(app_secret, body).
// Balasan bebas hanya dalam 24 jam sejak pesan terakhir pelanggan (aturan Meta).
// =====================================================================
const metaVerify = (req, c) => safeEqual(req.headers['x-hub-signature-256'], `sha256=${hmacHex(c.appSecret || '', req.rawBody)}`);
const metaChallenge = (req, c) => (req.query['hub.mode'] === 'subscribe' && c.verifyToken && safeEqual(req.query['hub.verify_token'], c.verifyToken) ? req.query['hub.challenge'] : null);
const within24h = (conv) => !conv.last_in_at || Date.now() - new Date(conv.last_in_at).getTime() < 24 * 3600_000;

async function graph(c, method, path, body) {
  const res = await fetch(`${base.graph()}/${GRAPH_VERSION}${path}`, {
    method,
    headers: { Authorization: `Bearer ${c.accessToken}`, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return readApi(res, 'Meta');
}

const whatsapp = {
  id: 'whatsapp', label: 'WhatsApp', color: '#25d366',
  fields: [
    { key: 'phoneNumberId', label: 'Phone Number ID' },
    { key: 'accessToken', label: 'Access Token (System User, permanen)', secret: true },
    { key: 'appSecret', label: 'App Secret (verifikasi webhook)', secret: true },
    { key: 'verifyToken', label: 'Verify Token (bebas, samakan di Meta)' },
  ],
  guide: {
    intro: 'WhatsApp Business Cloud API (Meta). Nomor WA bisnis didaftarkan di Meta Business, bukan WA di HP.',
    steps: [
      'developers.facebook.com → Create App (Business) → tambah produk WhatsApp → hubungkan nomor bisnis.',
      'Buat System User di Business Settings, beri aset WhatsApp, generate token permanen (izin whatsapp_business_messaging).',
      'Salin Phone Number ID (WhatsApp → API Setup) dan App Secret (App Settings → Basic).',
      'Webhook: Callback URL {{WEBHOOK}}, Verify Token sama dengan yang diisi di sini, subscribe field "messages".',
      'Aturan Meta: balasan bebas cuma dalam 24 jam sejak pesan terakhir pelanggan.',
    ],
    links: [['Meta for Developers', 'https://developers.facebook.com/apps']],
  },
  async listConversations() { return { conversations: [] }; }, // WhatsApp tidak punya API daftar chat: semua masuk lewat webhook.
  async listMessages() { return { messages: [] }; },
  async sendMessage(c, conv, msg) {
    need(c, ['phoneNumberId', 'accessToken'], 'WhatsApp');
    if (!within24h(conv)) throw new Error('WhatsApp: lewat 24 jam sejak pesan terakhir pelanggan. Meta hanya mengizinkan template resmi.');
    let payload = { messaging_product: 'whatsapp', to: conv.customer_id, type: 'text', text: { body: msg.text } };
    if (msg.image) {
      const form = new FormData();
      form.set('messaging_product', 'whatsapp');
      form.set('file', new Blob([msg.image.buffer], { type: msg.image.mime }), msg.image.name || 'image.jpg');
      const up = await graph(c, 'POST', `/${c.phoneNumberId}/media`, form);
      payload = { messaging_product: 'whatsapp', to: conv.customer_id, type: 'image', image: { id: up.id, caption: msg.text || undefined } };
    }
    const b = await graph(c, 'POST', `/${c.phoneNumberId}/messages`, payload);
    return { external_id: b.messages?.[0]?.id || `wa_${Date.now()}`, sent_at: new Date().toISOString() };
  },
  async markRead(c, conv, lastId) {
    if (lastId && !String(lastId).startsWith('wa_')) await graph(c, 'POST', `/${c.phoneNumberId}/messages`, { messaging_product: 'whatsapp', status: 'read', message_id: lastId }).catch(() => {});
    return {};
  },
  webhook: {
    verify: metaVerify,
    challenge: metaChallenge,
    // Pesan masuk dibaca langsung dari payload.
    parse(body) {
      const out = [];
      for (const e of body.entry || []) {
        for (const ch of e.changes || []) {
          const v = ch.value || {};
          const names = Object.fromEntries((v.contacts || []).map((x) => [x.wa_id, x.profile?.name]));
          for (const m of v.messages || []) {
            const type = m.type === 'text' ? 'text' : m.type === 'image' ? 'image' : m.type === 'video' ? 'video' : m.type === 'sticker' ? 'sticker' : 'other';
            out.push({
              conversation: { external_id: m.from, customer_name: names[m.from] || m.from, customer_id: m.from, can_reply: true },
              message: { external_id: m.id, direction: 'in', sender: names[m.from] || m.from, type, text: m.text?.body || m.image?.caption || m.button?.text || '', media_url: null, sent_at: toIso(m.timestamp), meta: { media_id: m[m.type]?.id || null } },
            });
          }
        }
      }
      return out;
    },
  },
};

const instagram = {
  id: 'instagram', label: 'Instagram DM', color: '#e1306c',
  fields: [
    { key: 'pageId', label: 'Facebook Page ID (tertaut ke akun IG bisnis)' },
    { key: 'igUserId', label: 'Instagram Business Account ID (opsional)', optional: true },
    { key: 'accessToken', label: 'Page Access Token', secret: true },
    { key: 'appSecret', label: 'App Secret (verifikasi webhook)', secret: true },
    { key: 'verifyToken', label: 'Verify Token (bebas, samakan di Meta)' },
  ],
  guide: {
    intro: 'Instagram Messaging lewat Messenger Platform. Akun IG harus profesional dan tertaut ke Facebook Page.',
    steps: [
      'developers.facebook.com → app Business → tambah produk Messenger & Instagram.',
      'Izin: instagram_basic, instagram_manage_messages, pages_manage_metadata, pages_messaging. App harus Live (lolos App Review) untuk akun selain admin.',
      'Ambil Page Access Token (bisa pakai "Ambil token otomatis" di menu Akun → Instagram).',
      'Webhook: Callback URL {{WEBHOOK}}, Verify Token sama dengan di sini, subscribe "messages" untuk object Instagram.',
      'Di aplikasi Instagram: Pengaturan → Pesan → izinkan akses ke pesan (Connected tools).',
    ],
    links: [['Meta for Developers', 'https://developers.facebook.com/apps']],
  },
  async listConversations(c) {
    need(c, ['pageId', 'accessToken'], 'Instagram');
    const b = await graph(c, 'GET', `/${c.pageId}/conversations?platform=instagram&fields=id,updated_time,unread_count,participants,messages.limit(1){message,from,created_time}`);
    return {
      conversations: (b.data || []).map((x) => {
        const other = (x.participants?.data || []).find((p) => p.id !== c.igUserId) || {};
        const last = x.messages?.data?.[0];
        return {
          external_id: other.id || x.id, customer_name: other.username || other.name || '', customer_id: other.id || '',
          unread: Number(x.unread_count || 0), last_message_at: toIso(x.updated_time), last_preview: last?.message || '', can_reply: true, meta: { thread_id: x.id },
        };
      }),
    };
  },
  async listMessages(c, conv) {
    if (!conv.meta?.thread_id) return { messages: [] };
    const b = await graph(c, 'GET', `/${conv.meta.thread_id}?fields=messages.limit(25){id,message,from,created_time,attachments}`);
    return {
      messages: (b.messages?.data || []).map((m) => ({
        external_id: m.id, direction: m.from?.id === conv.customer_id ? 'in' : 'out', sender: m.from?.username || '',
        type: m.attachments?.data?.length ? 'image' : 'text', text: m.message || '', media_url: m.attachments?.data?.[0]?.image_data?.url || null,
        sent_at: toIso(m.created_time), meta: {},
      })).reverse(),
    };
  },
  async sendMessage(c, conv, msg) {
    need(c, ['pageId', 'accessToken'], 'Instagram');
    if (!within24h(conv)) throw new Error('Instagram: lewat 24 jam sejak pesan terakhir pelanggan, Meta tidak mengizinkan balasan biasa.');
    const message = msg.image && msg.imageUrl ? { attachment: { type: 'image', payload: { url: msg.imageUrl } } } : { text: msg.text };
    const b = await graph(c, 'POST', `/${c.pageId}/messages`, { recipient: { id: conv.customer_id }, messaging_type: 'RESPONSE', message });
    return { external_id: b.message_id || `ig_${Date.now()}`, sent_at: new Date().toISOString() };
  },
  async markRead() { return {}; },
  webhook: {
    verify: metaVerify,
    challenge: metaChallenge,
    parse(body) {
      const out = [];
      for (const e of body.entry || []) {
        for (const ev of e.messaging || []) {
          if (!ev.message || ev.message.is_echo) continue;
          const att = ev.message.attachments?.[0];
          out.push({
            conversation: { external_id: ev.sender.id, customer_name: ev.sender.id, customer_id: ev.sender.id, can_reply: true },
            message: { external_id: ev.message.mid, direction: 'in', sender: '', type: att ? (att.type === 'image' ? 'image' : 'other') : 'text', text: ev.message.text || '', media_url: att?.payload?.url || null, sent_at: toIso(ev.timestamp), meta: {} },
          });
        }
      }
      return out;
    },
  },
};

export const chatConnectors = Object.fromEntries([simulasi, shopee, tiktokshop, lazada, whatsapp, instagram].map((c) => [c.id, c]));

export function chatPlatformInfo() {
  return Object.values(chatConnectors).map(({ id, label, color, fields, guide, oauth }) => ({ id, label, color, fields, guide, oauth: !!oauth }));
}
