/**
 * Node-side helpers for aplayermode.com's Pinterest feed. The feed itself is built
 * at request time by the Worker (workers/aplayermode-com/src/pinqueue.js) from
 * aplayermode/data/pinterest/queue.json; launchBlock() derives that file's launch
 * items and channel from config/aplayermode_pinfeed.json, so the build script, the
 * weekly refill and the validator produce the SAME bytes (one definition, no drift).
 */
import fs from 'node:fs';
import path from 'node:path';

export const PIN_WIDTH = 1000;
export const PIN_HEIGHT = 1500;
export const PIN_DIR = 'aplayermode/img/pins';
export const QUEUE_FILE = 'aplayermode/data/pinterest/queue.json';
export const DRIP_DIR = 'aplayermode/img/pins/drip';
export const CONFIG_FILE = 'config/aplayermode_pinfeed.json';
export const PRICES_FILE = 'config/aplayermode_plan_prices.json';

const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;

/** Config with {founding100} filled from the pinned price file (never typed). */
export function loadConfig(root) {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, CONFIG_FILE), 'utf8'));
  const prices = JSON.parse(fs.readFileSync(path.join(root, PRICES_FILE), 'utf8'));
  const vars = { founding100: dollars(prices.intro_offers.founding100.monthlyUsdCents) };
  const fill = (v) => (typeof v === 'string' ? v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
    : Array.isArray(v) ? v.map(fill)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v);
  return fill(cfg);
}

export const pinPath = (item) => `${PIN_DIR}/${item.slug}.png`;
export const pinUrl = (cfg, item) => new URL(`/${pinPath(item)}`, cfg.site).toString();

export function fileSizes(root, cfg) {
  return Object.fromEntries(cfg.items.map((i) => [pinPath(i), fs.statSync(path.join(root, pinPath(i))).size]));
}

/** Width/height from a PNG's IHDR chunk; null when the bytes are not a PNG. */
export function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** The queue's channel + launch items, derived from config/aplayermode_pinfeed.json and the committed pin sizes. */
export function launchBlock(root) {
  const cfg = loadConfig(root);
  const sizes = fileSizes(root, cfg);
  return {
    channel: { title: cfg.channel.title, description: cfg.channel.description },
    launch: cfg.items.map((i) => ({
      slug: i.slug, anchor: i.anchor, pubDate: i.pubDate, title: i.title, description: i.description,
      image: { path: pinPath(i), length: sizes[pinPath(i)], width: PIN_WIDTH, height: PIN_HEIGHT },
    })),
  };
}

/** ids on the aplayermode.com page: the only fragments a pin may link. */
export function pageIds(root) {
  const html = fs.readFileSync(path.join(root, 'aplayermode/index.html'), 'utf8');
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}
