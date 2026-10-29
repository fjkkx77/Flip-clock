// 布局不变量测试：不挑几台设备看截图，而是检查「任何尺寸下都必须成立」的几条规则。
//   ① 看得见的元素两两不重叠  ② 都在屏幕安全区以内  ③ 能点的东西 ≥ 44×44（HIG 最小热区）
//   ④ 卡片在画面正中（±2px）  ⑤ 同一台设备「真横屏」和「强制横屏」卡片一样大
// 两部分：A 设备矩阵（常见机型 × 竖屏/真横屏/强制横屏 × 4 个页面）；B 连续扫尺寸（宽度按步长扫，抓「两台设备之间」的尺寸）。
// 用法：node tests/layout.cjs [仓库目录]       全部通过退出码 0
//   环境变量 OUT=xx.json 导出每个组合的元素几何（改前改后 A/B 比对用）；QUICK=1 只跑矩阵不扫尺寸。
// 缘起：2026-10-28 横屏浮层把子标签/输入框盖住，旧测试只查「卡片不压栏」没查出来（132 个组合错 44 个）。
const http = require('http'), fs = require('fs'), path = require('path');
const { open, sleep } = require('./cdp.js');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, s) => {
  const rel = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  const f = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!f.startsWith(ROOT)) { s.writeHead(403); return s.end(); }
  fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); s.end(d); });
});

// 机型只是常见尺寸的样本（CSS 像素）；安全区是近似值（上/下，竖屏时），横屏时上→左右、底部主屏指示条按 21 算
const DEVICES = [
  ['iPhone SE', 375, 667, 0, 0, true], ['iPhone mini', 375, 812, 50, 34, true], ['iPhone 14 Pro', 393, 852, 59, 34, true],
  ['iPhone Pro Max', 430, 932, 59, 34, true], ['安卓', 412, 915, 0, 0, true], ['小安卓', 360, 640, 0, 0, true],
  ['iPad mini', 744, 1133, 24, 20, true], ['iPad Pro 11', 834, 1194, 24, 20, true], ['iPad Pro 13', 1024, 1366, 24, 20, true],
  ['笔记本', 1280, 800, 0, 0, false], ['1080p', 1920, 1080, 0, 0, false], ['矮窗口', 1280, 600, 0, 0, false],
  ['用户电脑', 1707, 960, 0, 0, false], ['竖窗口', 800, 1000, 0, 0, false], ['很矮窗口', 1000, 400, 0, 0, false],
];
const VIEWS = [['clock'], ['pomodoro'], ['timer', 'up'], ['timer', 'down']];

// 在页面里量：返回违反的规则列表 + 每个元素的矩形（屏幕坐标，强制横屏转过 90° 后也是屏幕上真实的位置）
const PROBE = ins => `(() => {
  document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} });
  const v = document.querySelector('.view-container.active');
  const shown = e => e.offsetParent && !e.closest('.idle-hidden') && (!e.closest('.view-container') || e.closest('.view-container') === v);
  const els = [...document.querySelectorAll('.top-bar .nav-item, .icon-btn, .date-display, .quote, .clock-container')]
    .concat([...v.querySelectorAll('.sub-tab, .time-input, .time-label, .btn-apple')]).filter(shown);
  const R = els.map(e => { const b = e.getBoundingClientRect(); return { n: (e.id || e.className.split(' ')[0]) + ':' + (e.textContent || '').trim().slice(0, 4), l: b.left, t: b.top, r: b.right, b: b.bottom }; });
  const W = innerWidth, H = innerHeight, I = ${JSON.stringify(ins)}, bad = [];
  R.forEach((a, i) => {
    if (a.l < I.left - 1 || a.t < I.top - 1 || a.r > W - I.right + 1 || a.b > H - I.bottom + 1) bad.push('出安全区 ' + a.n);
    const e = els[i];
    if (e.matches('.nav-item, .icon-btn, .sub-tab, .btn-apple') && (a.r - a.l < 43.5 || a.b - a.t < 43.5)) bad.push('热区<44 ' + a.n);
    for (let j = i + 1; j < R.length; j++) { const b = R[j];
      if (e.contains(els[j]) || els[j].contains(e)) continue;
      if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) bad.push('重叠 ' + a.n + ' × ' + b.n); }
  });
  const c = v.querySelector('.clock-container').getBoundingClientRect();
  const fr = document.getElementById('app-wrapper').getBoundingClientRect();
  if (Math.abs((c.left + c.right) / 2 - (fr.left + fr.right) / 2) > 2 || Math.abs((c.top + c.bottom) / 2 - (fr.top + fr.bottom) / 2) > 2) bad.push('卡片不在正中');
  const card = v.querySelector('.clock-group').getBoundingClientRect();
  return { bad, card: [Math.round(card.width), Math.round(card.height)], rects: R.map(a => [a.n, Math.round(a.l), Math.round(a.t), Math.round(a.r), Math.round(a.b)]) };
})()`;

let total = 0, broken = 0;
const report = (tag, r) => { total++; if (r.bad.length) { broken++; console.log('FAIL', tag, '\n     ' + [...new Set(r.bad)].join('\n     ')); } };
// 把视口改成 w×h（不重新加载，页面自己听 resize 重排），安全区按方向设
async function setSize(c, w, h, touch, st, sb) {
  const land = w > h, ins = land ? { top: 0, bottom: sb ? 21 : 0, left: st, right: st } : { top: st, bottom: sb, left: 0, right: 0 };
  await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: touch, screenWidth: w, screenHeight: h });
  await c.send('Emulation.setTouchEmulationEnabled', touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  const none = { top: 0, bottom: 0, left: 0, right: 0 }, use = touch ? ins : none;
  await c.send('Emulation.setSafeAreaInsetsOverride', { insets: { ...use, topMax: use.top, bottomMax: use.bottom, leftMax: use.left, rightMax: use.right } });
  return use;
}
// 等页面按新尺寸排完：resize → rAF 里的 fitLayout → 再画一帧
const settle = c => c.ev('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))))');
async function load(c, U, force, tab, tm) {
  await c.goto(U);
  await c.ev(`localStorage.clear(); localStorage.setItem('autoImmersive','0'); localStorage.setItem('tab','${tab}'); ${tm ? `localStorage.setItem('timerMode','${tm}');` : ''} localStorage.setItem('forceLandscape','${force ? 1 : 0}')`);
  await c.goto(U); await sleep(500);
}
// 不重新加载就切页面：点导航 / 子标签
const SWITCH = (tab, tm) => `(() => { document.querySelector('[data-tab=${tab}]').click(); ${tm ? `document.querySelector('#timer-tabs [data-mode=${tm}]').click();` : ''} })()`;

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const U = `http://127.0.0.1:${server.address().port}/`;
  const dump = {}, cards = {};

  /* ---------- A. 设备矩阵（一个浏览器跑到底，只换尺寸；每个组合重新加载，从「刚打开」的状态量） ---------- */
  let c = await open(390, 844, 1);
  for (const [name, w, h, st, sb, touch] of DEVICES) {
    const modes = touch ? [['竖屏', w, h, false], ['真横屏', h, w, false], ['强制横屏', w, h, true]] : [['窗口', w, h, false]];
    for (const [mode, vw, vh, force] of modes) {
      const ins = await setSize(c, vw, vh, touch, st, sb);
      for (const [tab, tm] of VIEWS) {
        await load(c, U, force, tab, tm);
        const tag = `${name} ${vw}×${vh} ${mode} ${tab}${tm ? '/' + tm : ''}`;
        const r = await c.ev(PROBE(ins)); dump[tag] = r; report(tag, r);
        if (mode !== '竖屏') (cards[name + tab + (tm || '')] ||= {})[mode] = r.card;
      }
    }
  }
  if (c.errors.length) { broken++; console.log('FAIL 设备矩阵 JS 报错', c.errors); }
  c.close();
  // ⑤ 真横屏和强制横屏卡片一样大（±2，强制横屏量到的是转过 90° 后的宽高，要对调）
  for (const [k, m] of Object.entries(cards)) if (m['真横屏'] && m['强制横屏']) {
    total++;
    const [a, b] = [m['真横屏'], m['强制横屏']];
    if (Math.abs(a[0] - b[1]) > 2 || Math.abs(a[1] - b[0]) > 2) { broken++; console.log('FAIL 真横屏/强制横屏卡片不一样大', k, a, b); }
  }
  console.log(`A 设备矩阵：${total} 项，${broken} 项不通过`);

  /* ---------- B. 连续扫尺寸：手机/平板形状按宽度步进，竖屏、真横屏、强制横屏都扫；电脑窗口宽高交叉 ---------- */
  if (!process.env.QUICK) {
    const t0 = total, b0 = broken;
    const shapes = [];
    // 步长故意不整齐（44/170），扫到的尺寸不和矩阵里的机型重合
    for (let w = 320; w <= 1050; w += 44) for (const ratio of [1.33, 1.78, 2.17]) shapes.push([w, Math.round(w * ratio)]);
    c = await open(390, 844, 1);
    for (const [mode, force] of [['竖屏', false], ['真横屏', false], ['强制横屏', true]]) {
      for (const [tab, tm] of VIEWS) {
        await setSize(c, 390, 844, true, 0, 0);
        await load(c, U, force, tab, tm);
        for (const [pw, ph] of shapes) {
          const notch = ph / pw > 2;   // 全面屏手机形状才有刘海/主屏指示条
          const [w, h] = mode === '真横屏' ? [ph, pw] : [pw, ph];
          const ins = await setSize(c, w, h, true, notch ? 47 : 0, notch ? 34 : 0);
          await settle(c);
          report(`扫 ${w}×${h} ${mode} ${tab}${tm ? '/' + tm : ''}`, await c.ev(PROBE(ins)));
        }
      }
    }
    await setSize(c, 1280, 800, false);
    await load(c, U, false, 'clock');
    for (const [tab, tm] of VIEWS) {
      await c.ev(SWITCH(tab, tm));
      for (let w = 640; w <= 2560; w += 170) for (const h of [360, 480, 640, 800, 1080, 1440]) {
        const ins = await setSize(c, w, h, false);
        await settle(c);
        report(`扫 电脑 ${w}×${h} ${tab}${tm ? '/' + tm : ''}`, await c.ev(PROBE(ins)));
      }
    }
    if (c.errors.length) { broken++; console.log('FAIL 扫尺寸 电脑 JS 报错', c.errors); }
    c.close();
    console.log(`B 连续扫尺寸：${total - t0} 项，${broken - b0} 项不通过`);
  }

  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(dump));
  server.close();
  console.log(`\n布局不变量：${total - broken} 通过，${broken} 失败`);
  process.exit(broken ? 1 : 0);
})().catch(e => { console.error('FAIL 测试脚本异常', e); process.exit(1); });
