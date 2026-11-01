// 独立窗口（电脑上「安装成应用」）的画框回归测试。单独跑：node tests/window.cjs；退出码 1 = 有失败。
// 2026-11-01 用户报：Windows 上最小化再打开，界面瞬间缩在左上角。实测（有界面 Chrome --app，真最小化）：
// 最小化时 outerWidth×outerHeight = 159×27，而 focusout 50ms 后的 syncFrame 把它写进了画框。
// headless 没有真最小化，这里模拟 outer 和 document.hidden；真窗口的复现方法见 PROJECT_STATUS「测试」节。
const http = require('http'), fs = require('fs'), path = require('path');
const { open, sleep } = require('./cdp.js');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, s) => {
  const rel = decodeURIComponent(new URL(q.url, 'http://x').pathname), f = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!f.startsWith(ROOT)) { s.writeHead(403); return s.end(); }
  fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); s.end(d); });
});
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d === undefined ? '' : '  → ' + JSON.stringify(d))); };

// 假装成独立窗口：display-mode 命中、outer 和 hidden 由测试控制
const fake = (coarse, standalone) => `(() => {
  window.__o = null; window.__hidden = false;
  const mm = window.matchMedia.bind(window);
  window.matchMedia = q => {
    if (/display-mode/.test(q)) return { matches: /standalone/.test(q), addEventListener() {}, removeEventListener() {}, media: q };
    if (/pointer:\\s*coarse/.test(q)) return { matches: ${coarse}, addEventListener() {}, removeEventListener() {}, media: q };
    return mm(q); };
  ${standalone ? "Object.defineProperty(navigator, 'standalone', { get: () => true });" : ''}
  const size = (k, inner) => Object.defineProperty(window, k, { configurable: true, get: () => window.__o ? window.__o[k] : inner() });
  size('outerWidth', () => innerWidth); size('outerHeight', () => innerHeight);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__hidden ? 'hidden' : 'visible' });
})()`;
const BOX = `(() => { const r = document.getElementById('app-wrapper').getBoundingClientRect(), c = document.querySelector('.view-container.active .clock-container').getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, cx: Math.round((c.left + c.right) / 2), cy: Math.round((c.top + c.bottom) / 2), src: frame.src }; })()`;

async function page(w, h, coarse, standalone, file, title) {
  const c = await open(w, h, 1);
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: coarse, maxTouchPoints: coarse ? 5 : 1 });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: fake(coarse, standalone) + (title ? '' : '') });
  return c;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';

  /* ---------- 电脑上的独立窗口：有标题栏，outer 比页面大 ---------- */
  let c = await page(1000, 700, false, false);
  await c.goto(base); await c.ev(`window.__o = { outerWidth: 1016, outerHeight: 738 }; dispatchEvent(new Event('resize'))`); await sleep(300);
  let b = await c.ev(BOX);
  check('电脑独立窗口：画框 = 页面可视区，不算标题栏', b.w === b.vw && b.h === b.vh, b);
  check('电脑独立窗口：卡片在页面正中(±2)', Math.abs(b.cx - b.vw / 2) <= 2 && Math.abs(b.cy - b.vh / 2) <= 2, b);

  /* ---------- 用户报的路径：按钮有焦点 → 最小化（outer=159×27）→ 失焦 → 再打开 ---------- */
  await c.ev(`document.querySelector('.view-container.active .btn-apple, .btn-apple').focus()`);
  await c.ev(`window.__o = { outerWidth: 159, outerHeight: 27 }; window.__hidden = true; document.activeElement.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))`);
  await sleep(150);
  b = await c.ev(BOX);
  check('最小化后失焦：画框没被 159×27 写坏', b.w === b.vw && b.h === b.vh, b);
  await c.ev(`dispatchEvent(new Event('resize'))`); await sleep(100);
  b = await c.ev(BOX);
  check('最小化期间来 resize：画框也没被写坏', b.w === b.vw && b.h === b.vh, b);
  await c.ev(`window.__o = { outerWidth: 1016, outerHeight: 738 }; window.__hidden = false; document.dispatchEvent(new Event('visibilitychange'))`); await sleep(200);
  b = await c.ev(BOX);
  check('恢复后界面正常', b.w === b.vw && b.h === b.vh && Math.abs(b.cy - b.vh / 2) <= 2, b);
  c.close();

  /* ---------- 触屏平板也走 outer 分支的情况：隐藏时一样不能量 ---------- */
  c = await page(1000, 700, true, false);
  await c.goto(base); await c.ev(`window.__o = { outerWidth: 1000, outerHeight: 700 }; dispatchEvent(new Event('resize'))`); await sleep(200);
  await c.ev(`window.__o = { outerWidth: 159, outerHeight: 27 }; window.__hidden = true; dispatchEvent(new Event('resize'))`); await sleep(150);
  b = await c.ev(BOX);
  check('触屏窗口隐藏时：画框不变', b.w === 1000 && b.h === 700, b);
  c.close();

  /* ---------- iPhone 主屏幕模式：outer 才是真屏幕，不能被这次改动影响 ---------- */
  c = await page(393, 793, true, true);
  await c.goto(base); await c.ev(`window.__o = { outerWidth: 393, outerHeight: 852 }; dispatchEvent(new Event('resize'))`); await sleep(200);
  b = await c.ev(BOX);
  check('iPhone 主屏幕模式仍按 outer（852）', b.src === 'outer' && b.h === 852, b);
  // 切后台时转了方向：回前台要补量
  await c.ev(`window.__hidden = true; window.__o = { outerWidth: 852, outerHeight: 393 }; dispatchEvent(new Event('resize'))`); await sleep(100);
  await c.ev(`window.__hidden = false; document.dispatchEvent(new Event('visibilitychange'))`); await sleep(200);
  b = await c.ev(BOX);
  check('iPhone 回前台补量画框', b.w === 852 && b.h === 393, b);
  c.close();

  /* ---------- 待机页同一个函数 ---------- */
  c = await page(1000, 700, false, false);
  await c.goto(base + 'standby.html'); await c.ev(`window.__o = { outerWidth: 1016, outerHeight: 738 }; dispatchEvent(new Event('resize'))`); await sleep(300);
  const BOARD = `document.getElementById('board').style.transform`;   // 含 translate(宽/2, 高/2) 和缩放比例，画框一变它就变
  let f = await c.ev(BOARD);
  check('待机页电脑独立窗口：画框 = 页面可视区', f.startsWith('translate(500px, 350px)'), f);
  await c.ev(`window.__o = { outerWidth: 159, outerHeight: 27 }; window.__hidden = true; dispatchEvent(new Event('resize'))`); await sleep(150);
  check('待机页最小化时画板没被写坏', (await c.ev(BOARD)) === f, await c.ev(BOARD));
  c.close();
  c = await page(1000, 700, true, false);
  await c.goto(base + 'standby.html'); await c.ev(`window.__o = { outerWidth: 1000, outerHeight: 700 }; dispatchEvent(new Event('resize'))`); await sleep(300);
  const s0 = await c.ev(BOARD);
  await c.ev(`window.__o = { outerWidth: 159, outerHeight: 27 }; window.__hidden = true; dispatchEvent(new Event('resize'))`); await sleep(150);
  check('待机页触屏窗口隐藏时画板不变', (await c.ev(BOARD)) === s0, s0);
  await c.ev(`window.__o = { outerWidth: 1000, outerHeight: 700 }; window.__hidden = false; document.dispatchEvent(new Event('visibilitychange'))`); await sleep(150);
  check('待机页无 JS 报错', c.errors.length === 0, c.errors);
  c.close();

  /* ---------- 图标：电脑用带透明边的 any 版（跟 Chrome 自动生成的同尺寸），手机裁形状用铺满的 maskable 版 ---------- */
  const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  const by = p => mf.icons.filter(i => i.purpose === p).map(i => i.src);
  check('manifest：any 和 maskable 各两张且文件都在', by('any').length === 2 && by('maskable').length === 2 && mf.icons.every(i => fs.existsSync(path.join(ROOT, i.src))), mf.icons);
  c = await open(1000, 700, 1); await c.goto(base);
  const alpha = await c.ev(`Promise.all(${JSON.stringify(by('any').concat(by('maskable')))}.map(u => new Promise(res => { const m = new Image(); m.onload = () => { const k = document.createElement('canvas'); k.width = m.width; k.height = m.height; const g = k.getContext('2d'); g.drawImage(m, 0, 0); res(g.getImageData(0, 0, 1, 1).data[3]); }; m.src = u; })))`);
  check('any 版四角透明、maskable 版四角不透明', alpha[0] === 0 && alpha[1] === 0 && alpha[2] === 255 && alpha[3] === 255, alpha);
  c.close();

  server.close();
  console.log(`独立窗口：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL 测试脚本异常', e); process.exit(1); });
