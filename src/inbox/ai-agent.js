// Agen AI untuk Inbox CS (ala wacrm): draft balasan dari riwayat chat + template toko.
// Dipakai tombol "Saran Balasan" dan mode auto-reply AI (ai_mode = 'auto' per percakapan).
import { askClaude, brandBlock } from '../ai.js';

// Draft balasan berikutnya untuk satu percakapan. Melempar AiError kalau AI belum aktif.
export async function draftReply(db, brand, conv) {
  const msgs = (await db.all(
    'SELECT direction, sender, text, type FROM chat_messages WHERE conversation_id = ? ORDER BY sent_at DESC LIMIT 20',
    conv.id,
  )).reverse();
  const templates = await db.all('SELECT title, body FROM cs_templates WHERE brand_id = ? ORDER BY uses DESC LIMIT 15', brand.id);
  const answer = await askClaude({
    system: `Kamu CS toko online Indonesia yang ramah, sopan, singkat, dan solutif. Panggil pelanggan "Kak". Jangan menjanjikan hal yang tidak pasti (refund, ongkir gratis) tanpa dasar. Tulis HANYA isi balasan, tanpa pembuka/penjelasan.\n${brandBlock(brand)}\n${templates.length ? `<template_toko>\n${templates.map((t) => `- ${t.title}: ${t.body}`).join('\n')}\n</template_toko>` : ''}`,
    content: `Riwayat chat dengan pelanggan "${conv.customer_name}":\n${msgs.map((m) => `${m.direction === 'in' ? 'Pelanggan' : 'Toko'}: ${m.text || `[${m.type}]`}`).join('\n')}\n\nTulis balasan berikutnya untuk toko.`,
    effort: 'low',
    maxTokens: 2000,
  });
  return String(answer || '').trim();
}
