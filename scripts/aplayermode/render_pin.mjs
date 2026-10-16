/**
 * Renders one aplayermode.com drip pin (1000x1500 PNG) per queue variant, in
 * A Player Mode's own brand: colours from config/aplayermode_theme_tokens.json (the
 * app's pinned light and dark palettes), the app's Outfit / Nunito Sans type, the AP
 * mark, and the only picture is the real app screenshot (aplayermode/img/app-screen.webp).
 * No people, no stock, no AI faces. $0: Playwright screenshots of template HTML.
 *
 * Layouts (queue.config.layouts): phone, split, checklist, cards, statement, numbered, quote.
 * Palettes (queue.config.palettes): light, dark, sage, stone.
 * A render whose text overflows its frame throws instead of shipping a clipped pin.
 */
import fs from 'node:fs';
import path from 'node:path';

export const W = 1000;
export const H = 1500;
export const LAYOUTS = ['phone', 'split', 'checklist', 'cards', 'statement', 'numbered', 'quote'];
export const PALETTES = ['light', 'dark', 'sage', 'stone'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function palettes(root) {
  const t = JSON.parse(fs.readFileSync(path.join(root, 'config/aplayermode_theme_tokens.json'), 'utf8')).palettes;
  const L = t.light; const D = t.dark;
  return {
    light: { bg: L.bg, surface: L.surface, ink: L.ink, muted: L.inkMuted, line: L.line, accent: L.accent, onAccent: L.onAccent, soft: L.accentSoft, bar: L.accent, mark: L.ink, onMark: L.surface },
    dark: { bg: D.bg, surface: D.surface, ink: D.ink, muted: D.inkMuted, line: D.line, accent: D.accent, onAccent: D.onAccent, soft: D.accentSoft, bar: D.accent, mark: D.ink, onMark: D.bg },
    sage: { bg: L.accentSoft, surface: L.surface, ink: L.ink, muted: L.inkMuted, line: L.line, accent: L.accent, onAccent: L.onAccent, soft: L.surfaceMuted, bar: L.ink, mark: L.accent, onMark: L.onAccent },
    stone: { bg: L.surfaceMuted, surface: L.surface, ink: L.ink, muted: L.inkMuted, line: L.lineStrong, accent: L.accent, onAccent: L.onAccent, soft: L.accentSoft, bar: L.brass, mark: L.ink, onMark: L.surface },
  };
}

export function pinHtml(v, P, shot) {
  const pts = v.points || [];
  const hSize = (base) => (v.headline.length > 38 ? base - 18 : v.headline.length > 30 ? base - 8 : base);
  const phone = (cls = '') => `<div class="phone ${cls}"><img src="${shot}"></div>`;
  let main;
  switch (v.layout) {
    case 'phone':
      main = `<h1 style="font-size:${hSize(92)}px">${esc(v.headline)}</h1><p class="body">${esc(v.body)}</p>
        <div class="fill center">${phone('big')}</div>`;
      break;
    case 'split':
      main = `<h1 style="font-size:${hSize(90)}px">${esc(v.headline)}</h1>
        <div class="fill row"><ul class="dots">${pts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>${phone('side')}</div>`;
      break;
    case 'checklist':
      main = `<h1 style="font-size:${hSize(90)}px">${esc(v.headline)}</h1><p class="body">${esc(v.body)}</p>
        <div class="fill"><ul class="check">${pts.map((p) => `<li><span class="box"></span><span>${esc(p)}</span></li>`).join('')}</ul></div>`;
      break;
    case 'cards':
      main = `<h1 style="font-size:${hSize(90)}px">${esc(v.headline)}</h1>
        <div class="fill"><div class="cards">${pts.map((p) => `<div class="card">${esc(p)}</div>`).join('')}</div></div>
        <p class="body small">${esc(v.body)}</p>`;
      break;
    case 'statement':
      main = `<div class="fill"><div class="rule"></div><h1 class="huge" style="font-size:${hSize(128)}px">${esc(v.headline)}</h1>
        <p class="body big">${esc(v.body)}</p></div>`;
      break;
    case 'numbered':
      main = `<h1 style="font-size:${hSize(90)}px">${esc(v.headline)}</h1>
        <div class="fill"><ol class="nums">${pts.map((p, i) => `<li><span class="n">${String(i + 1).padStart(2, '0')}</span><span>${esc(p)}</span></li>`).join('')}</ol></div>`;
      break;
    case 'quote':
      main = `<div class="q">&ldquo;</div><h1 class="quoted" style="font-size:${hSize(96)}px">${esc(v.headline)}</h1>
        <p class="body">${esc(v.body)}</p>
        <div class="fill"><div class="chips">${pts.map((p) => `<span class="chip">${esc(p)}</span>`).join('')}</div></div>`;
      break;
    default: throw new Error(`unknown layout ${v.layout}`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700&family=Outfit:wght@500;600&display=block');
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px}
body{background:${P.bg};color:${P.ink};font-family:'Nunito Sans',sans-serif;position:relative;overflow:hidden}
.bar{position:absolute;top:0;left:0;right:0;height:18px;background:${P.bar}}
.wrap{position:absolute;top:18px;left:0;right:0;bottom:150px;padding:76px 76px 56px;display:flex;flex-direction:column;overflow:hidden}
.kicker{font-family:'Outfit',sans-serif;font-weight:600;font-size:30px;letter-spacing:.06em;text-transform:uppercase;color:${P.accent};margin-bottom:26px}
h1{font-family:'Outfit',sans-serif;font-weight:600;letter-spacing:-.01em;line-height:1.04;margin-bottom:32px}
.body{font-size:36px;line-height:1.38;color:${P.muted};margin-bottom:36px}
.body.small{font-size:32px;margin:30px 0 0}
.body.big{font-size:42px;margin-top:40px}
.fill{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center}
.center{align-items:center}
.row{flex-direction:row;align-items:center;gap:44px}
.phone{border-radius:56px;background:${P.mark};padding:16px;box-shadow:0 30px 60px rgba(0,0,0,.25)}
.phone img{display:block;width:100%;border-radius:42px}
.phone.big{width:400px;max-height:100%;overflow:hidden}
.phone.side{flex:none;width:360px}
.dots{list-style:none;flex:1}
.dots li{font-size:38px;line-height:1.3;font-weight:600;padding:26px 0 26px 40px;border-bottom:2px solid ${P.line};position:relative}
.dots li:before{content:'';position:absolute;left:0;top:44px;width:18px;height:18px;border-radius:50%;background:${P.accent}}
.check{list-style:none}
.check li{display:flex;align-items:center;gap:30px;background:${P.surface};color:${P.ink};border:2px solid ${P.line};border-radius:26px;padding:36px 40px;margin-bottom:26px;font-size:38px;font-weight:600;line-height:1.25}
.check li:last-child{background:${P.soft};color:${P.ink};border-color:${P.accent}}
.box{flex:none;width:50px;height:50px;border-radius:12px;border:4px solid ${P.accent}}
.cards{display:flex;flex-direction:column;gap:24px}
.card{background:${P.surface};color:${P.ink};border:2px solid ${P.line};border-left:14px solid ${P.accent};border-radius:26px;padding:34px 40px;font-family:'Outfit',sans-serif;font-weight:500;font-size:42px;line-height:1.2}
.rule{width:140px;height:14px;background:${P.accent};border-radius:7px;margin-bottom:56px}
h1.huge{line-height:1.0}
.nums{list-style:none}
.nums li{display:flex;align-items:baseline;gap:34px;padding:30px 0;border-top:3px solid ${P.line};font-size:40px;font-weight:600;line-height:1.25}
.nums .n{flex:none;font-family:'Outfit',sans-serif;font-weight:600;font-size:64px;color:${P.accent};width:90px}
.q{font-family:'Outfit',sans-serif;font-size:220px;line-height:.7;color:${P.accent};height:110px}
.chips{display:flex;flex-wrap:wrap;gap:20px}
.chip{background:${P.accent};color:${P.onAccent};border-radius:999px;padding:20px 32px;font-size:34px;font-weight:700}
.foot{position:absolute;left:0;right:0;bottom:0;height:150px;background:${P.surface};color:${P.ink};border-top:2px solid ${P.line};display:flex;align-items:center;gap:26px;padding:0 76px}
.mark{display:inline-flex;align-items:center;justify-content:center;width:84px;height:84px;border-radius:18px;background:${P.mark};color:${P.onMark};font-family:'Outfit',sans-serif;font-weight:500;font-size:40px}
.name{font-family:'Outfit',sans-serif;font-weight:600;font-size:36px}
.url{margin-left:auto;font-size:32px;font-weight:700;color:${P.accent}}
</style></head><body><div class="bar"></div>
<div class="wrap"><div class="kicker">${esc(v.kicker)}</div>${main}</div>
<div class="foot"><span class="mark">AP</span><span class="name">A Player Mode</span><span class="url">aplayermode.com</span></div>
</body></html>`;
}

/** Renders `variants` to <root>/<dir>/<id>.png; returns { [id]: bytes }. */
export async function renderVariants(root, variants, dir) {
  const pal = palettes(root);
  const shot = `data:image/webp;base64,${fs.readFileSync(path.join(root, 'aplayermode/img/app-screen.webp')).toString('base64')}`;
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const sizes = {};
  try {
    for (const v of variants) {
      if (!pal[v.palette]) throw new Error(`${v.id}: unknown palette ${v.palette}`);
      const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      await page.setContent(pinHtml(v, pal[v.palette], shot), { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
      if (!fonts.some((f) => /Outfit/.test(f))) throw new Error(`${v.id}: Outfit did not load (network?); refusing to ship a fallback font`);
      const overflow = await page.evaluate(() => {
        const wrap = document.querySelector('.wrap');
        const box = wrap.getBoundingClientRect();
        const out = [...wrap.querySelectorAll('h1,p,li,.card,.chip,.phone')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.bottom > box.bottom - 40 + 1 || r.right > box.right + 1;
        });
        return wrap.scrollHeight > wrap.clientHeight + 1 || out.length ? out.map((el) => el.textContent.slice(0, 30) || el.className) : null;
      });
      if (overflow) throw new Error(`${v.id} (${v.layout}): text overflows the pin: ${JSON.stringify(overflow)}`);
      const rel = path.join(dir, `${v.id}.png`);
      fs.mkdirSync(path.join(root, dir), { recursive: true });
      await page.screenshot({ path: path.join(root, rel), type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
      await page.close();
      sizes[v.id] = fs.statSync(path.join(root, rel)).size;
    }
  } finally {
    await browser.close();
  }
  return sizes;
}
