import simulasi from './simulasi.js';
import facebook from './facebook.js';
import instagram from './instagram.js';
import youtube from './youtube.js';
import tiktok from './tiktok.js';

export const connectors = Object.fromEntries(
  [simulasi, facebook, instagram, youtube, tiktok].map((c) => [c.id, c]),
);

export function platformInfo() {
  return Object.values(connectors).map(({ id, label, color, supports, fields, note }) => ({
    id, label, color, supports, fields, note,
  }));
}
