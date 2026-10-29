// 待机显示：各种屏幕尺寸、像素密度、浏览器缩放下，画面内容要一模一样（2026-10-29 用户要求：
// 「不管放大放小、什么比例、什么平台什么尺寸的设备都要显示一致，不能只在我的手机/电脑上没事」）。
// 做法：同一个时刻在一串设备上打开，把每段字、每个漂浮数字框的屏幕位置换算回 852×393 核心区坐标，
// 跟 iPhone 14 Pro 横屏（852×393@3，核心区 1:1）比，任何一项差超过 0.5pt 就算失败。
// 量的是屏幕上真实的位置（getBoundingClientRect），所以画板缩放、转 90°、居中这些都算在内。
// 用法：node tests/consistency.cjs     run.cjs 最后也会调用它
const http = require('http'), fs = require('fs'), path = require('path');
const { open, sleep } = require('./cdp.js');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const server = http.createServer((q, s) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!f.startsWith(ROOT)) { s.writeHead(403); return s.end(); }
  fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); s.end(d); });
});
// [名字, 宽, 高, 像素密度]；浏览器缩放 z = 视口变成 宽/z × 高/z、密度 × z（Chrome 的页面缩放就是这么变的）
const zoom = (name, w, h, dpr, z) => [`${name} 缩放${Math.round(z * 100)}%`, Math.round(w / z), Math.round(h / z), dpr * z];
const DEVICES = [
  ['iPhone 14 Pro 横（基准）', 852, 393, 3], ['iPhone 14 Pro 竖', 393, 852, 3], ['iPhone SE 竖', 375, 667, 2], ['iPhone SE 横', 667, 375, 2],
  ['iPhone 15 Pro Max 横', 932, 430, 3], ['iPhone XS 竖', 375, 812, 3], ['安卓 360×800 竖', 360, 800, 3], ['安卓 915×412 横', 915, 412, 2.625],
  ['iPad 竖', 820, 1180, 2], ['iPad 横', 1180, 820, 2], ['iPad Pro 横', 1366, 1024, 2],
  ['电脑 1366×768', 1366, 768, 1], ['电脑 1920×1080', 1920, 1080, 1], ['电脑 1707×1067（16:10）', 1707, 1067, 1.5], ['电脑 2560×1080（21:9）', 2560, 1080, 1],
  ['电脑 1024×768（4:3）', 1024, 768, 1], ['电脑 1280×1024（5:4）', 1280, 1024, 1], ['窗口很窄 600×900', 600, 900, 1],
  zoom('电脑 1707×1067', 1707, 1067, 1.5, 0.5), zoom('电脑 1707×1067', 1707, 1067, 1.5, 0.67), zoom('电脑 1707×1067', 1707, 1067, 1.5, 1.25),
  zoom('电脑 1707×1067', 1707, 1067, 1.5, 2), zoom('电脑 1920×1080', 1920, 1080, 1, 3),
];
// 页面里：所有有字的 svg text + 漂浮数字框 + 漂浮冒号框，换算到核心区坐标。核心区转了 90° 时（竖着拿），核心区的 x 朝屏幕下、y 朝屏幕左
const GEO = `(() => {
  const out = {};
  document.querySelectorAll('.core').forEach((core, ci) => {
    const page = core.closest('.page'), key = (page.className.match(/face-\\w+/) || [page.parentElement.id + page.style.top])[0];
    const cr = core.getBoundingClientRect(), rot = __sb.view.rot, s = (rot ? cr.height : cr.width) / 852;
    const map = (X, Y) => rot ? [(Y - cr.top) / s, (cr.right - X) / s] : [(X - cr.left) / s, (Y - cr.top) / s];
    const box = el => { const r = el.getBoundingClientRect(), a = map(r.left, r.top), b = map(r.right, r.bottom);
      return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
    let n = 0;
    core.querySelectorAll('svg text, .fl').forEach(el => { if (el.tagName === 'text' && !el.textContent) return; out[key + '#' + (n++) + ' ' + (el.textContent || el.className)] = box(el); });
  });
  return out;
})()`;
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const U = `http://127.0.0.1:${server.address().port}/${process.env.SB_PAGE || 'standby.html'}?t=2026-10-26T14:54:10&page=1&face=4&freeze=1`;
  let ref = null, fails = 0, worstAll = 0;
  for (const [name, w, h, dpr] of DEVICES) {
    const c = await open(w, h, dpr);
    await c.goto(U); await sleep(1200);
    const g = await c.ev(GEO); c.close();
    if (!ref) { ref = g; console.log(`基准 ${name}：${Object.keys(g).length} 项`); continue; }
    let worst = 0, what = '', missing = 0;
    for (const k in ref) {
      if (!g[k]) { missing++; continue; }
      g[k].forEach((v, i) => { const d = Math.abs(v - ref[k][i]); if (d > worst) { worst = d; what = k; } });
    }
    const ok = worst <= 0.5 && missing === 0 && Object.keys(g).length === Object.keys(ref).length;
    if (!ok) fails++;
    worstAll = Math.max(worstAll, worst);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}（${w}×${h}@${dpr}）最大差 ${worst.toFixed(3)}pt${what ? '（' + what + '）' : ''}${missing ? ' 缺 ' + missing + ' 项' : ''}`);
  }
  console.log(`显示一致性：${DEVICES.length - 1} 种设备/缩放，${fails} 种不一致，全体最大差 ${worstAll.toFixed(3)}pt`);
  server.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
