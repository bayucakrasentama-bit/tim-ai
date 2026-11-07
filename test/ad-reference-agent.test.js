import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdReferenceBrief } from '../public/ad-reference.js';

test('builds a transparent reference brief from a supplied Meta Ad Library capture', () => {
  const prompt = buildAdReferenceBrief({
    product: 'Minuman herbal Zestmag', audience: 'Pekerja 25-40', offer: 'Paket 2 botol',
    sourceUrl: 'https://www.facebook.com/ads/library/?id=123',
    reference: 'Hook: sederet tab bikin capek. Demo dashboard bisnis. CTA: lihat cara kerja.',
  }, '## Script konsep terbaik');
  assert.match(prompt, /JANGAN mengaku membuka atau menonton URL/);
  assert.match(prompt, /sederet tab bikin capek/);
  assert.match(prompt, /Paket 2 botol/);
  assert.match(prompt, /aktif di Ads Library bukan bukti iklan menang/);
  assert.match(prompt, /buat konsep baru/);
  assert.match(prompt, /## Script konsep terbaik/);
});

test('marks missing reference evidence instead of pretending to analyze an ad', () => {
  const prompt = buildAdReferenceBrief({ product: 'Produk X', sourceUrl: 'https://example.com/ad' });
  assert.match(prompt, /BELUM ADA BAHAN REFERENSI/);
  assert.match(prompt, /jangan menyimpulkan pola kreatif/);
});
