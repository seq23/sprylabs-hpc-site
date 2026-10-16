#!/usr/bin/env node
/**
 * Builds aplayermode.com's Pinterest assets, in A Player Mode's own brand (never Spry):
 *   aplayermode/img/pins/<slug>.png      1000x1500 pins, one per feed item
 *   aplayermode/img/pinterest/avatar.png  square profile image
 *   aplayermode/img/pinterest/banner.png  16:9 profile cover
 *   aplayermode/pinfeed.xml               RSS 2.0, served at https://aplayermode.com/pinfeed.xml
 *
 * Colours come from config/aplayermode_theme_tokens.json (the app's pinned palette),
 * type is the app's Outfit / Nunito Sans, and the only picture is the real app
 * screenshot (aplayermode/img/app-screen.webp). No people, no stock, no AI faces.
 * Output is committed; the validator (validate_aplayermode_pinterest.mjs) checks it.
 *
 *   node scripts/aplayermode/build_pinterest_assets.mjs            # images + feed
 *   node scripts/aplayermode/build_pinterest_assets.mjs --feed-only
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, buildFeedXml, fileSizes, pinPath, PIN_WIDTH, PIN_HEIGHT, FEED_FILE } from './pinfeed_lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cfg = loadConfig(root);
const feedOnly = process.argv.includes('--feed-only');

const P = JSON.parse(fs.readFileSync(path.join(root, 'config/aplayermode_theme_tokens.json'), 'utf8')).palettes.light;
const shot = `data:image/webp;base64,${fs.readFileSync(path.join(root, 'aplayermode/img/app-screen.webp')).toString('base64')}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700&family=Outfit:wght@500;600&display=block');
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%}
body{background:${P.bg};color:${P.ink};font-family:'Nunito Sans',sans-serif;position:relative;overflow:hidden}
.bar{position:absolute;top:0;left:0;right:0;height:18px;background:${P.accent}}
.kicker{font-family:'Outfit',sans-serif;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${P.accent}}
h1{font-family:'Outfit',sans-serif;font-weight:600;letter-spacing:-.01em;line-height:1.04}
.mark{display:inline-flex;align-items:center;justify-content:center;background:${P.ink};color:${P.surface};font-family:'Outfit',sans-serif;font-weight:500;letter-spacing:-.01em}
.phone{border-radius:56px;background:${P.ink};padding:16px;box-shadow:0 30px 60px rgba(30,28,25,.25)}
.phone img{display:block;width:100%;border-radius:42px}
`;

function pinHtml(item) {
  const im = item.image;
  let main = '';
  if (im.layout === 'phone') {
    main = `<p class="body">${esc(im.body)}</p>
      <div class="phonewrap"><div class="phone"><img src="${shot}"></div></div>
      ${im.badge ? `<div class="badge">${esc(im.badge)}</div>` : ''}`;
  } else if (im.layout === 'steps') {
    main = `<ol class="steps">${im.steps.map((s, i) => `<li><span class="n">${i + 1}</span><span>${esc(s)}</span></li>`).join('')}</ol>
      <div class="phonewrap small"><div class="phone"><img src="${shot}"></div></div>`;
  } else if (im.layout === 'checklist') {
    main = `<p class="body">${esc(im.body)}</p>
      <div class="fill"><ul class="check">${im.steps.map((s) => `<li><span class="box"></span><span>${esc(s)}</span></li>`).join('')}</ul></div>`;
  } else if (im.layout === 'modes') {
    main = `${im.body ? `<p class="body">${esc(im.body)}</p>` : ''}
      <div class="fill"><div class="cards">${im.modes.map(([t, d]) => `<div class="card"><div class="ct">${esc(t)}</div><div class="cd">${esc(d)}</div></div>`).join('')}</div></div>`;
  } else throw new Error(`unknown layout ${im.layout}`);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
.wrap{position:absolute;top:18px;left:0;right:0;bottom:150px;padding:80px 76px 0;display:flex;flex-direction:column}
.fill{flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:60px}
.kicker{font-size:30px;margin-bottom:26px}
h1{font-size:${im.headline.length > 30 ? 88 : 100}px;margin-bottom:34px}
.body{font-size:36px;line-height:1.38;color:${P.inkMuted};margin-bottom:44px}
.phonewrap{position:absolute;left:50%;transform:translateX(-50%);width:440px;top:${im.layout === 'phone' ? 690 : 840}px}
.phonewrap.small{width:380px;left:auto;right:76px;transform:none;top:auto;bottom:-260px}
.badge{position:absolute;left:76px;top:1120px;background:${P.accent};color:${P.onAccent};font-family:'Outfit',sans-serif;font-weight:600;font-size:34px;padding:22px 30px;border-radius:999px;box-shadow:0 10px 24px rgba(30,28,25,.2)}
.steps{list-style:none;width:${im.layout === 'steps' ? 470 : 840}px}
.steps li{display:flex;gap:22px;font-size:33px;line-height:1.35;margin-bottom:36px}
.steps .n{flex:none;width:54px;height:54px;border-radius:50%;background:${P.ink};color:${P.surface};display:flex;align-items:center;justify-content:center;font-family:'Outfit',sans-serif;font-size:28px;margin-top:-4px}
.check{list-style:none}
.check li{display:flex;align-items:center;gap:30px;background:${P.surface};border:2px solid ${P.line};border-radius:26px;padding:44px 40px;margin-bottom:30px;font-size:42px;font-weight:600}
.check li:last-child{background:${P.accentSoft};border-color:${P.accent}}
.box{flex:none;width:52px;height:52px;border-radius:12px;border:4px solid ${P.accent}}
.cards{display:flex;flex-direction:column;gap:30px}
.card{background:${P.surface};border:2px solid ${P.line};border-left:12px solid ${P.accent};border-radius:26px;padding:42px 44px}
.ct{font-family:'Outfit',sans-serif;font-weight:600;font-size:50px;margin-bottom:12px}
.cd{font-size:35px;line-height:1.35;color:${P.inkMuted}}
.foot{position:absolute;left:0;right:0;bottom:0;height:150px;background:${P.surface};border-top:2px solid ${P.line};display:flex;align-items:center;gap:26px;padding:0 76px}
.foot .mark{width:84px;height:84px;font-size:40px;border-radius:18px}
.foot .name{font-family:'Outfit',sans-serif;font-weight:600;font-size:36px}
.foot .url{margin-left:auto;font-size:32px;font-weight:700;color:${P.accent}}
</style></head><body><div class="bar"></div>
<div class="wrap"><div class="kicker">${esc(im.kicker)}</div><h1>${esc(im.headline)}</h1>${main}</div>
<div class="foot"><span class="mark">AP</span><span class="name">A Player Mode</span><span class="url">aplayermode.com</span></div>
</body></html>`;
}

const avatarHtml = () => `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
body{background:${P.ink};display:flex;align-items:center;justify-content:center}
.ap{font-family:'Outfit',sans-serif;font-weight:500;font-size:400px;color:${P.surface};letter-spacing:-.01em;line-height:1}
</style></head><body><div class="ap">AP</div></body></html>`;

const bannerHtml = () => `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
.bar{height:22px}
.left{position:absolute;left:120px;top:190px;width:1060px}
.kicker{font-size:40px;margin-bottom:30px}
h1{font-size:112px;margin-bottom:40px}
p{font-size:42px;line-height:1.4;color:${P.inkMuted}}
.url{position:absolute;left:120px;bottom:90px;font-size:40px;font-weight:700}
.phonewrap{position:absolute;right:170px;top:120px;width:470px}
</style></head><body><div class="bar"></div>
<div class="left"><div class="kicker">A Player Mode</div><h1>Your day, planned for you.</h1>
<p>Daily and weekly planning that runs itself: one priority, a short start, then the day. Bad days shrink automatically.</p></div>
<div class="url">aplayermode.com</div>
<div class="phonewrap"><div class="phone"><img src="${shot}"></div></div>
</body></html>`;

async function render(browser, html, width, height, rel) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
  if (!fonts.some((f) => /Outfit/.test(f))) throw new Error(`${rel}: Outfit did not load (network?); refusing to ship a fallback font`);
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  await page.screenshot({ path: path.join(root, rel), type: 'png', clip: { x: 0, y: 0, width, height } });
  await page.close();
  console.log(`[pinterest] wrote ${rel} ${width}x${height}`);
}

if (!feedOnly) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    for (const item of cfg.items) await render(browser, pinHtml(item), PIN_WIDTH, PIN_HEIGHT, pinPath(item));
    const { avatar, banner } = cfg.profile;
    await render(browser, avatarHtml(), avatar.width, avatar.height, avatar.path);
    await render(browser, bannerHtml(), banner.width, banner.height, banner.path);
  } finally {
    await browser.close();
  }
}
fs.writeFileSync(path.join(root, FEED_FILE), buildFeedXml(cfg, fileSizes(root, cfg)));
console.log(`[pinterest] wrote ${FEED_FILE} with ${cfg.items.length} items`);
