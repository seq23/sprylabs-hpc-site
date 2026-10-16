/**
 * Pure builder for aplayermode.com's Pinterest RSS feed (aplayermode/pinfeed.xml).
 * No I/O beyond reading the repo's own config files, so the build script and the
 * validator produce the SAME bytes: the validator rebuilds the feed in memory and
 * fails when the committed file differs (one definition, no drift).
 */
import fs from 'node:fs';
import path from 'node:path';

export const PIN_WIDTH = 1000;
export const PIN_HEIGHT = 1500;
export const PIN_DIR = 'aplayermode/img/pins';
export const FEED_FILE = 'aplayermode/pinfeed.xml';
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
export const itemLink = (cfg, item) => `${cfg.site}?${cfg.utm}&utm_content=${item.slug}#${item.anchor}`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** RSS 2.0 with media:content. sizes: { [pinPath]: bytes } for enclosure length. */
export function buildFeedXml(cfg, sizes) {
  const items = [...cfg.items].sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate));
  const latest = new Date(Math.max(...items.map((i) => Date.parse(i.pubDate)))).toUTCString();
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">',
    '<channel>',
    `<title>${esc(cfg.channel.title)}</title>`,
    `<link>${esc(cfg.site)}</link>`,
    `<description>${esc(cfg.channel.description)}</description>`,
    '<language>en-us</language>',
    `<lastBuildDate>${latest}</lastBuildDate>`,
  ];
  for (const item of items) {
    const img = pinUrl(cfg, item);
    const len = sizes[pinPath(item)];
    if (!Number.isInteger(len) || len <= 0) throw new Error(`no size for ${pinPath(item)}`);
    out.push(
      '<item>',
      `<title>${esc(item.title)}</title>`,
      `<link>${esc(itemLink(cfg, item))}</link>`,
      `<guid isPermaLink="false">aplayermode-pin-${esc(item.slug)}</guid>`,
      `<description>${esc(item.description)}</description>`,
      `<pubDate>${new Date(item.pubDate).toUTCString()}</pubDate>`,
      `<enclosure url="${esc(img)}" length="${len}" type="image/png"/>`,
      `<media:content url="${esc(img)}" type="image/png" medium="image" width="${PIN_WIDTH}" height="${PIN_HEIGHT}"/>`,
      '</item>',
    );
  }
  out.push('</channel>', '</rss>', '');
  return out.join('\n');
}

export function fileSizes(root, cfg) {
  return Object.fromEntries(cfg.items.map((i) => [pinPath(i), fs.statSync(path.join(root, pinPath(i))).size]));
}

/** Width/height from a PNG's IHDR chunk; null when the bytes are not a PNG. */
export function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
