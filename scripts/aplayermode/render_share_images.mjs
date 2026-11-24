// Renders A Player Mode's share picture (aplayermode/img/og.png, 1200x630) and the three LinkedIn post
// pictures (aplayermode/img/linkedin/post-{1,2,3}.png, 1200x627) from HTML with Playwright, so they can be
// re-made instead of hand-edited. Run: `node scripts/aplayermode/render_share_images.mjs` (needs network for
// the brand fonts, Outfit and Nunito Sans, from Google Fonts, the same ones aplayermode.com loads).
//
// Why it exists (24 Nov 2026): the old og.png put the phone over the book, hiding "BILLIONAIRE HIGH
// PERFORMANCE COACH"; and the three LinkedIn posts all showed that one picture.
//
// Rule 0: it exits non-zero, and keeps no PNG it doubts, when any picture has a picture that did not load,
// a brand font that did not load, text cut off or running past the edge, two marked parts (data-solo)
// overlapping, the wrong size, or a file over 5 MB (LinkedIn's limit is higher; this is the sanity cap).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMG = path.join(ROOT, 'aplayermode', 'img');
// Inlined as data: URLs so the page needs no file access.
const asset = (f) => `data:image/webp;base64,${fs.readFileSync(path.join(IMG, f)).toString('base64')}`;
const MAX_BYTES = 5 * 1024 * 1024;

const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;700&family=Outfit:wght@600&display=block">';
// Palette and type: aplayermode/aplayermode.css tokens (--apm-bg, --apm-ink, --apm-ink-muted, --apm-accent, --apm-brass).
const BASE = `*{margin:0;padding:0;box-sizing:border-box}
html,body{overflow:hidden;background:#E9E5DE;color:#1E1C19;font-family:'Nunito Sans';-webkit-font-smoothing:antialiased}
.bar{position:absolute;left:0;top:0;right:0;height:10px;background:#3E4B3C}
.kick{font:600 28px/1 Outfit;letter-spacing:.01em;color:#3E4B3C;text-transform:uppercase}
.foot{position:absolute;left:64px;bottom:40px;font:600 24px/1 Outfit;color:#1E1C19}
.phone{position:absolute;background:#1E1C19;border-radius:36px;padding:10px;box-shadow:0 18px 40px #1E1C1933}
.phone img{display:block;width:100%;border-radius:27px}
.book{position:absolute;border-radius:18px;overflow:hidden;background:#141311;box-shadow:0 18px 40px #1E1C1933}
.book img{position:absolute;display:block}
.cap{position:absolute;font:700 15px/1.25 'Nunito Sans';letter-spacing:.08em;text-transform:uppercase;color:#655F57}`;

const page = (w, h, css, body) => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>html,body{width:${w}px;height:${h}px}${BASE}${css}</style></head><body>${body}</body></html>`;

// The book photo is 720x604; the book itself sits at about x 110-485, y 40-575. `bookCard` crops to it.
const bookCard = ({ left, top, width, height, scale, dx, dy }) =>
  `<div class="book" data-solo="book" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px"><img src="${asset('bhpc-book.webp')}" style="width:${720 * scale}px;left:${dx}px;top:${dy}px" alt=""></div>`;
const phone = ({ left, top, width }) =>
  `<div class="phone" data-solo="phone" style="left:${left}px;top:${top}px;width:${width}px"><img src="${asset('app-screen.webp')}" alt=""></div>`;

export const PICTURES = [
  {
    out: 'og.png', w: 1200, h: 630,
    html: page(1200, 630, `
      .copy{position:absolute;left:64px;top:76px;width:540px}
      h1{font:600 62px/1.16 Outfit;letter-spacing:-.01em;margin:26px 0 20px}
      .sub{font:400 24px/1.5 'Nunito Sans';color:#655F57}`,
      `<div class="bar"></div>
       <div class="copy" data-solo="copy"><p class="kick">A Player Mode</p>
         <h1>Your five-person executive team. Two ways to get it.</h1>
         <p class="sub">The app runs your day for you, or install the same five roles into the AI you use.</p></div>
       ${phone({ left: 626, top: 64, width: 232 })}
       ${bookCard({ left: 880, top: 132, width: 286, height: 384, scale: 0.75, dx: -74, dy: -22 })}
       <p class="foot" data-solo="foot">aplayermode.com</p>`),
  },
  {
    // Post 1: the app. Headline from the post; the five roles it names.
    out: 'linkedin/post-1.png', w: 1200, h: 627,
    html: page(1200, 627, `
      .copy{position:absolute;left:64px;top:72px;width:640px}
      h1{font:600 60px/1.12 Outfit;letter-spacing:-.01em;margin:24px 0 28px}
      ul{list-style:none;display:flex;flex-wrap:wrap;gap:10px;width:600px}
      li{font:700 19px/1 'Nunito Sans';color:#3E4B3C;background:#E3E6DC;border-radius:999px;padding:11px 16px}`,
      `<div class="bar"></div>
       <div class="copy" data-solo="copy"><p class="kick">A Player Mode</p>
         <h1>Billionaires have an executive team. Now you do too.</h1>
         <ul><li>Executive Coach</li><li>Executive Assistant</li><li>Chief of Staff</li><li>Accountability Partner</li><li>Cognitive Behavioral Mindset Coach</li></ul></div>
       ${phone({ left: 846, top: 58, width: 236 })}
       <p class="foot" data-solo="foot">aplayermode.com</p>`),
  },
  {
    // Post 2: follow-through across days; the Radar; the book (the one-time OS for the AI you already use).
    out: 'linkedin/post-2.png', w: 1200, h: 627,
    html: page(1200, 627, `
      .copy{position:absolute;left:64px;top:72px;width:700px}
      h1{font:600 56px/1.12 Outfit;letter-spacing:-.01em;margin:24px 0 30px}
      .said{border:2px solid #1E1C1926;border-radius:18px;padding:18px 24px;width:640px}
      .card{background:#1E1C19;border-radius:18px;padding:18px 24px;width:640px;margin-top:14px}
      .h{font:700 15px/1 'Nunito Sans';letter-spacing:.08em;text-transform:uppercase;color:#3E4B3C;margin-bottom:10px}
      .card .h{color:#A39780}
      .said p:last-child{font:600 26px/1.25 Outfit}
      .card p:last-child{font:600 26px/1.25 Outfit;color:#F6F4F0}`,
      `<div class="bar"></div>
       <div class="copy" data-solo="copy"><p class="kick">Across days, not one chat</p>
         <h1>You said Thursday.<br>Your team remembered.</h1>
         <div class="said"><p class="h">Monday</p><p>"I'll send the investor follow-up by Thursday."</p></div>
         <div class="card"><p class="h">Thursday · on your Radar</p><p>Investor follow-up: due today.</p></div></div>
       ${bookCard({ left: 820, top: 96, width: 316, height: 424, scale: 0.83, dx: -88, dy: -24 })}
       <p class="cap" data-solo="cap" style="left:820px;top:536px;width:316px">Or the one-time OS, for the AI you already use</p>
       <p class="foot" data-solo="foot">aplayermode.com</p>`),
  },
  {
    // Post 3: plain type card. The five ways it handles a bad day, by the names the site uses.
    out: 'linkedin/post-3.png', w: 1200, h: 627,
    html: page(1200, 627, `
      .copy{position:absolute;left:64px;top:100px;width:1072px}
      h1{font:600 62px/1.1 Outfit;letter-spacing:-.01em;margin:24px 0 36px}
      .grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px}
      .tile{background:#F6F4F0;border:2px solid #D4CEC4;border-radius:20px;padding:22px 16px;min-height:200px}
      .tile b{display:block;font:600 25px/1.15 Outfit;margin-bottom:12px}
      .tile b .nw{display:inline;white-space:nowrap;font:inherit;color:inherit}
      .tile > span{display:block;font:400 20px/1.4 'Nunito Sans';color:#655F57}`,
      `<div class="bar"></div>
       <div class="copy" data-solo="copy"><p class="kick">Built for the days that don't go to plan</p>
         <h1>A bad week shouldn't break the plan.</h1>
         <div class="grid">
           <div class="tile"><b>Never Miss Twice</b><span>One missed day doesn't turn into drift.</span></div>
           <div class="tile"><b>Minimum day</b><span>After a miss, tomorrow shrinks. No catch-up.</span></div>
           <div class="tile"><b>Recovery mode</b><span>One tap in a low season. No guilt.</span></div>
           <div class="tile"><b>Executive Review</b><span>Organizes the 3 to 7 things in your head.</span></div>
           <div class="tile"><b><span class="nw">High-Pressure</span> mode</b><span>Cuts the noise. Ends with one clear directive.</span></div>
         </div></div>
       <p class="foot" data-solo="foot">aplayermode.com</p>`),
  },
];

/** Problems on the rendered page: missing pictures or fonts, text cut off or off the edge, marked parts overlapping. */
async function problems(pg, w, h) {
  return pg.evaluate(([W, H]) => {
    const out = [];
    for (const i of document.images) if (!i.complete || i.naturalWidth === 0) out.push(`picture did not load: ${i.src}`);
    for (const fam of ['Outfit', 'Nunito Sans']) if (![...document.fonts].some((f) => f.family.replace(/"/g, '') === fam && f.status === 'loaded')) out.push(`font did not load: ${fam}`);
    for (const e of document.body.querySelectorAll('*')) {
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (e.scrollWidth > e.clientWidth + 1) out.push(`text cut off: "${e.textContent.trim().slice(0, 40)}"`);
      const r = e.getBoundingClientRect();
      if (r.left < 24 || r.top < 10 || r.right > W - 24 || r.bottom > H - 16) out.push(`text too near or past the edge: "${e.textContent.trim().slice(0, 40)}"`);
    }
    const solo = [...document.querySelectorAll('[data-solo]')].map((e) => ({ n: e.dataset.solo, r: e.getBoundingClientRect() }));
    for (const s of solo) if (s.r.left < 0 || s.r.top < 0 || s.r.right > W || s.r.bottom > H) out.push(`${s.n} runs past the edge`);
    for (let a = 0; a < solo.length; a++) for (let b = a + 1; b < solo.length; b++) {
      const [x, y] = [solo[a].r, solo[b].r];
      if (x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom) out.push(`${solo[a].n} overlaps ${solo[b].n}`);
    }
    return out;
  }, [w, h]);
}

export async function render({ pictures = PICTURES, outDir = IMG, log = console.log } = {}) {
  const browser = await chromium.launch();
  let bad = 0;
  try {
    for (const p of pictures) {
      const pg = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 1 });
      await pg.setContent(p.html, { waitUntil: 'networkidle' });
      await pg.evaluate(() => document.fonts.ready);
      const found = await problems(pg, p.w, p.h);
      const file = path.join(outDir, p.out);
      if (found.length) { bad++; log(`FAIL ${p.out}: ${found.join('; ')}`); await pg.close(); continue; }
      const png = await pg.screenshot({ clip: { x: 0, y: 0, width: p.w, height: p.h } });
      await pg.close();
      if (png.length > MAX_BYTES) { bad++; log(`FAIL ${p.out}: ${png.length} bytes is over 5 MB`); continue; }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, png);
      log(`wrote ${path.relative(ROOT, file)} (${p.w}x${p.h}, ${Math.round(png.length / 1024)} KB)`);
    }
  } finally { await browser.close(); }
  log(`OUTPUT: rendered ${pictures.length - bad} of ${pictures.length}, failed ${bad}`);
  return bad;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  render().then((bad) => process.exit(bad ? 1 : 0), (e) => { console.error(e); process.exit(1); });
}
