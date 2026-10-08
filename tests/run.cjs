// 翻页时钟回归测试：真 headless Chrome + 真实移动/桌面视口，零依赖（Node 18+）。
// 用法：node tests/run.cjs        全部通过退出码 0，任何一条失败退出码 1
// cdp.js 来自浏览器验证脚手架（Chrome 路径写死在里面第 30 行左右，换机器可能要改）。
const http = require('http'), fs = require('fs'), path = require('path');
const { open, sleep } = require('./cdp.js');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const server = http.createServer((q, s) => {
  let rel = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  const f = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!f.startsWith(ROOT)) { s.writeHead(403); return s.end(); }
  fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end('404'); }
    s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); s.end(d); });
});

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  → ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}

// 页面里用的几何量：各块矩形 + 画框中心
const GEO = `(() => {
  // 切标签的淡入动画还在播时 translateY 没归零，量到的位置会偏 15px；先把它播完再量，并记下当时有几个动画在跑
  const running = document.getAnimations().filter(a => a.playState === 'running' && a.animationName === 'fadeIn').length;
  document.getAnimations().filter(a => a.animationName === 'fadeIn').forEach(a => a.finish());
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const v = document.querySelector('.view-container.active');
  return { fadeRunning: running, vw: innerWidth, vh: innerHeight, clock: r(v.querySelector('.clock-container')), above: r(v.querySelector('.v-above')),
    below: r(v.querySelector('.v-below')), top: r(document.querySelector('.top-bar')), bottom: r(document.querySelector('.bottom-bar-wrap')),
    fit: +getComputedStyle(v).getPropertyValue('--fit'), btns: [...v.querySelectorAll('.btn-apple')].filter(b => b.offsetParent).map(r),
    icons: [...document.querySelectorAll('.icon-btn')].filter(b => b.offsetParent).map(r) };
})()`;
const overlap = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
const inside = (a, g) => a.l >= -0.5 && a.t >= -0.5 && a.r <= g.vw + 0.5 && a.b <= g.vh + 0.5;

function layoutChecks(tag, g) {
  check(`${tag} 卡片不压导航栏/按钮栏`, !overlap(g.clock, g.top) && !overlap(g.clock, g.bottom), { clock: g.clock, top: g.top, bottom: g.bottom });
  check(`${tag} 卡片不压上下附属内容`, !overlap(g.clock, g.above) && !overlap(g.clock, g.below));
  check(`${tag} 卡片、按钮、图标都在屏幕内`, [g.clock, ...g.btns, ...g.icons].every(x => inside(x, g)));
  const cx = (g.clock.l + g.clock.r) / 2, cy = (g.clock.t + g.clock.b) / 2;
  check(`${tag} 卡片在画面正中(±2px)`, Math.abs(cx - g.vw / 2) <= 2 && Math.abs(cy - g.vh / 2) <= 2, { cx, cy, vw: g.vw, vh: g.vh, fadeRunning: g.fadeRunning });
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const U = `http://127.0.0.1:${server.address().port}/`;
  const fresh = async c => { await c.ev('localStorage.clear()'); await c.goto(U); await sleep(800); };

  /* ---------- 竖屏手机 390×844 ---------- */
  let c = await open(390, 844, 3);
  await c.goto(U); await fresh(c);

  const res = await c.ev("performance.getEntriesByType('resource').map(e => e.name)");
  check('不再请求 Google Fonts', !res.some(n => /googleapis|gstatic/.test(n)), res.filter(n => /font/.test(n)));
  check('数字字体(本地 Oswald)已加载', await c.ev("document.fonts.ready.then(() => document.fonts.check('600 50px Oswald'))"));
  layoutChecks('竖屏/时钟', await c.ev(GEO));

  const hits = await c.ev(`[...document.querySelectorAll('.nav-item, .icon-btn')].map(e => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)])`);
  check('导航与图标按钮热区 ≥ 44×44', hits.every(([w, h]) => w >= 44 && h >= 44), hits);

  const lunar = await c.ev(`[lunarText(new Date(2027,1,6)), lunarText(new Date(2030,1,3)), lunarText(new Date(2026,9,8)), lunarText(new Date(2025,6,25)), lunarText(new Date(2101,2,1))]`);
  check('农历：2027/2030 春节正确（浏览器内置历法在这两天算错）、闰月、超范围不外推',
    JSON.stringify(lunar) === JSON.stringify(['正月初一', '正月初一', '八月廿八', '闰六月初一', '']), lunar);
  const dateTxt = await c.ev("document.getElementById('date-display').textContent");
  check('日期行带农历和星期', /^\d{4}年\d{1,2}月\d{1,2}日 .+月.+ 周./.test(dateTxt), dateTxt);

  const hoverOutside = await c.ev(`(() => { let n = []; for (const ss of document.styleSheets) for (const r of ss.cssRules) if (r.selectorText && r.selectorText.includes(':hover')) n.push(r.selectorText); return n; })()`);
  check(':hover 全部包在 (hover:hover) 里（触屏不粘连）', hoverOutside.length === 0, hoverOutside);
  check('静态半片不再常驻 will-change', await c.ev(`[...document.querySelectorAll('.half.static')].every(e => getComputedStyle(e).willChange === 'auto')`));
  check('Safari 用的 -webkit-user-select 也是 none', await c.ev(`getComputedStyle(document.body).webkitUserSelect === 'none'`));

  // 翻页竞态：500ms 内同一位连变两次，第二次的上半片动画不能被第一次的回调掐断，最后上下两半一致
  const race = await c.ev(`new Promise(res => { const el = document.getElementById('t-s2'), log = {};
    flipSingleDigit('t-s2', '7', true); setTimeout(() => flipSingleDigit('t-s2', '8', true), 100);
    setTimeout(() => { log.topAnimAt300 = el.querySelector('.top.flip').classList.contains('flip-anim-top'); }, 300);
    setTimeout(() => { log.top = el.querySelector('.top.static span').textContent; log.bottom = el.querySelector('.bottom.static span').textContent;
      log.anims = el.querySelectorAll('.flip-anim-top, .flip-anim-bottom').length; res(log); }, 700); })`);
  check('翻页连翻不打架', race.topAnimAt300 && race.top === '8' && race.bottom === '8' && race.anims === 0, race);
  await c.ev("flipSingleDigit('t-s2', '0', false)");

  // 番茄钟按真实时间走：冻结页面 5 秒（相当于 iPhone 锁屏/切后台）
  await c.ev("document.querySelector('[data-tab=pomodoro]').click()"); await sleep(300);
  // 假的 Wake Lock：验证"计时中申请、暂停后释放"的逻辑（headless 里真的申请不到）
  await c.ev(`window.__wl = { req: 0, rel: 0 }; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { __wl.req++;
    const t = new EventTarget(); t.release = async () => { __wl.rel++; t.dispatchEvent(new Event('release')); }; return t; } } });`);
  await c.ev("document.getElementById('pomodoro-btn').click()"); await sleep(300);
  check('开始番茄钟后申请了屏幕常亮', (await c.ev('__wl.req')) === 1);
  check('标签页标题显示剩余时间', /^\d\d:\d\d 专注/.test(await c.ev('document.title')), await c.ev('document.title'));
  await sleep(1200);
  check('卡片显示与剩余时间一致', await c.ev(`(() => { const s = Math.ceil(pomoLeft() / 1000), d = [...document.querySelectorAll('#pomo-dom .top.static span')].map(x => x.textContent).join('');
    return Math.abs(+d.slice(0, 2) * 60 + +d.slice(2) - s) <= 1; })()`));
  await c.ev("document.getElementById('pomodoro-btn').click()"); await sleep(300);
  check('暂停后释放屏幕常亮', (await c.ev('__wl.rel')) === 1, await c.ev('__wl'));
  check('暂停后按钮是"继续专注"', (await c.ev("document.getElementById('pomodoro-btn').textContent")) === '继续专注');

  // 空格键 = 开始/暂停
  await c.ev("document.activeElement && document.activeElement.blur()");
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }); await sleep(200);
  check('空格键开始/暂停', await c.ev('pomo.running'));

  // 番茄钟结束：切到休息、按钮复位、有提醒
  await c.ev('pomo.endAt = Date.now() + 800'); await sleep(1500);
  const end = await c.ev(`({ phase: pomo.phase, running: pomo.running, btn: document.getElementById('pomodoro-btn').textContent,
    ring: document.getElementById('pomo-dom').classList.contains('ring'), toast: document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent : '',
    title: document.title, digits: [...document.querySelectorAll('#pomo-dom .top.static span')].map(x => x.textContent).join('') })`);
  check('番茄钟结束 → 切到休息、按钮"开始休息"、卡片闪、有提示', end.phase === 'break' && !end.running && end.btn === '开始休息' && end.ring && /专注.*完成/.test(end.toast) && end.digits === '0500', end);
  check('结束后标题提示"时间到"', /时间到/.test(end.title), end.title);
  check('计时都停了以后释放常亮', (await c.ev('__wl.req')) === (await c.ev('__wl.rel')), await c.ev('__wl'));
  check('计时进行中不能切专注/休息', await c.ev(`(() => { document.getElementById('pomodoro-btn').click(); document.querySelector('[data-phase=focus]').click();
    const r = pomo.phase === 'break'; document.getElementById('pomodoro-reset').click(); return r; })()`));

  // 计时器：倒计时输入即生效 / 不填直接开始 / 非法输入
  await c.ev("document.querySelector('[data-tab=timer]').click()"); await sleep(200);
  await c.ev("document.querySelector('[data-mode=down]').click()"); await sleep(300);
  layoutChecks('竖屏/倒计时', await c.ev(GEO));
  await c.ev("document.getElementById('timer-btn').click()"); await sleep(200);
  check('没填时长就点开始 → 不开始，提示先填写', !(await c.ev('cd.running')) && /先填写/.test(await c.ev("document.getElementById('toast').textContent")));
  await c.ev("{ const m = document.getElementById('cd-m'); m.value = '1'; m.dispatchEvent(new Event('input')); }"); await sleep(700);
  check('填了分钟不用点"设定"，卡片直接变 00:01:00', (await c.ev("[...document.querySelectorAll('#timer-dom .top.static span')].map(x => x.textContent).join('')")) === '000100');
  await c.ev("document.getElementById('timer-btn').click()"); await sleep(1400);
  check('倒计时在走', await c.ev("cd.running && [...document.querySelectorAll('#timer-dom .top.static span')].map(x => x.textContent).join('') === '000059'"));
  check('倒计时中输入框锁定', await c.ev("document.getElementById('cd-m').disabled"));
  await c.ev('cd.endAt = Date.now() + 500'); await sleep(1200);
  check('倒计时结束 → "时间到"，再点一下回到设定时长', await c.ev(`(() => { const b = document.getElementById('timer-btn'); const a = b.textContent === '时间到' && cd.done;
    b.click(); return a && b.textContent === '开始' && cd.remainMs === 60000; })()`));
  await c.ev(`for (const [id, v] of [['cd-h', '150'], ['cd-m', '-5'], ['cd-s', '75']]) { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }`);
  await sleep(700);
  const norm = await c.ev("[['cd-h','cd-m','cd-s'].map(i => document.getElementById(i).value).join(','), [...document.querySelectorAll('#timer-dom .top.static span')].map(x => x.textContent).join('')]");
  check('非法输入(150时/-5分/75秒)被规范成 99/0/59', norm[0] === '99,0,59' && norm[1] === '990059', norm);

  // 正计时、倒计时各跑各的
  await c.ev("document.querySelector('[data-mode=up]').click()"); await c.ev("document.getElementById('timer-btn').click()"); await sleep(1200);
  await c.ev("document.querySelector('[data-mode=down]').click()"); await sleep(200); await c.ev("document.querySelector('[data-mode=up]').click()"); await sleep(200);
  check('切换正/倒计时不会清零正在跑的正计时', await c.ev('sw.running && swElapsed() >= 1000'), await c.ev('[sw.running, swElapsed()]'));
  await c.ev('sw.baseMs = MAX_MS; sw.running = false; ensureTicker()'); await sleep(700);
  check('正计时到 99:59:59 上限不会显示成错数', (await c.ev("[...document.querySelectorAll('#timer-dom .top.static span')].map(x => x.textContent).join('')")) === '995959');
  await c.ev("document.getElementById('timer-reset').click()");
  await c.ev("document.getElementById('timer-btn').click()"); await sleep(1100);

  // 签名：回车结束编辑、限 40 字、清空能保存
  await c.ev("document.querySelector('[data-tab=clock]').click()"); await sleep(200);
  await c.ev("{ const q = document.getElementById('quote-text'); q.focus(); q.textContent = 'x'.repeat(60); q.dispatchEvent(new Event('input')); }");
  check('签名限 40 字', (await c.ev("document.getElementById('quote-text').textContent.length")) === 40);
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(100);
  check('签名按回车结束编辑', await c.ev("document.activeElement !== document.getElementById('quote-text')"));
  await c.ev("{ const q = document.getElementById('quote-text'); q.textContent = ''; q.dispatchEvent(new Event('input')); }");

  // 设置：主题、横屏、标签页都要记住；弹窗淡入、Esc 关闭
  await c.ev("document.getElementById('settings-btn').click()"); await sleep(400);
  check('设置弹窗打开(淡入完成)', await c.ev("getComputedStyle(document.getElementById('theme-modal')).opacity === '1'"));
  await c.ev("document.querySelector('.theme-card[data-theme=light]').click()"); await sleep(400);
  const contrast = await c.ev(`(() => { const L = h => { const v = [1,3,5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126*v[0] + 0.7152*v[1] + 0.0722*v[2]; };
    const cs = getComputedStyle(document.documentElement), a = L(cs.getPropertyValue('--ui-text').trim()), b = L(cs.getPropertyValue('--bg-color').trim());
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); })()`);
  check('浅色主题次要文字对比度 ≥ 4.5', contrast >= 4.5, contrast.toFixed(2));
  await c.vshot(path.join(__dirname, 'shots', 'p390-light.png'));
  await c.ev("document.getElementById('settings-btn').click()"); await sleep(300);
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(400);
  check('Esc 关闭设置', await c.ev("getComputedStyle(document.getElementById('theme-modal')).visibility === 'hidden'"));
  await c.ev("document.getElementById('rotate-btn').click()"); await sleep(900);
  layoutChecks('强制横屏/时钟', await c.ev(GEO));
  check('强制横屏下卡片按 220px 设计高度放(fit 合理)', (await c.ev(GEO)).fit > 0.6, (await c.ev(GEO)).fit);
  await c.vshot(path.join(__dirname, 'shots', 'p390-force-landscape.png'));
  await c.ev("document.querySelector('[data-tab=timer]').click()"); await sleep(300);
  await c.goto(U); await sleep(900);
  const kept = await c.ev(`({ theme: document.documentElement.dataset.theme, quote: document.getElementById('quote-text').textContent,
    land: document.body.classList.contains('force-landscape'), tab: document.querySelector('.view-container.active').id, sw: sw.running && swElapsed() >= 1000 })`);
  check('刷新后：浅色主题、空签名、强制横屏、当前标签、正在跑的正计时都还在',
    kept.theme === 'light' && kept.quote === '' && kept.land && kept.tab === 'view-timer' && kept.sw, kept);
  layoutChecks('强制横屏/计时器', await c.ev(GEO));
  check('页面无 JS 报错', c.errors.length === 0, c.errors);
  c.close();

  /* ---------- 真横屏手机 844×390：倒计时输入框在场时卡片别缩太小 ---------- */
  c = await open(844, 390, 3);
  await c.goto(U); await c.ev("localStorage.clear(); localStorage.setItem('tab','timer'); localStorage.setItem('timerMode','down')"); await c.goto(U); await sleep(900);
  const lg = await c.ev(GEO);
  layoutChecks('横屏/倒计时', lg);
  check('横屏倒计时 fit ≥ 0.7（子标签和输入框并成一行）', lg.fit >= 0.7, lg.fit);
  await c.vshot(path.join(__dirname, 'shots', 'l844-countdown.png'));
  check('页面无 JS 报错', c.errors.length === 0, c.errors);
  c.close();

  /* ---------- 桌面大屏：时钟不再被像素上限卡小 ---------- */
  for (const [w, h] of [[1920, 1080], [2560, 1440], [1280, 600]]) {
    c = await open(w, h, 1);
    await c.goto(U); await fresh(c);
    const g = await c.ev(GEO);
    layoutChecks(`桌面 ${w}×${h}`, g);
    if (w >= 1920) check(`桌面 ${w}×${h} 时钟宽度 ≥ 屏宽 50%`, g.clock.w / w >= 0.5, (g.clock.w / w).toFixed(2));
    await c.vshot(path.join(__dirname, 'shots', `d${w}.png`));
    check('页面无 JS 报错', c.errors.length === 0, c.errors);
    c.close();
  }

  /* ---------- 冻结页面 5 秒（相当于 iPhone 锁屏/切后台）：单独开一个浏览器跑 ----------
     headless 里冻结再恢复后，CSS 动画/过渡的时钟会停住，留在同一页里会让后面量位置的用例失真 */
  c = await open(390, 844, 3);
  await c.goto(U); await fresh(c);
  await c.ev("document.querySelector('[data-tab=pomodoro]').click()"); await sleep(300);
  await c.ev("document.getElementById('pomodoro-btn').click()"); await sleep(300);
  const left0 = await c.ev('pomoLeft()'), t0 = Date.now();
  await c.send('Page.setWebLifecycleState', { state: 'frozen' }); await sleep(5000);
  await c.send('Page.setWebLifecycleState', { state: 'active' }); await sleep(600);
  const walked = (left0 - await c.ev('pomoLeft()')) / 1000, wall = (Date.now() - t0) / 1000;
  check('页面被冻结后番茄钟仍按真实时间走', Math.abs(walked - wall) < 1, { walked, wall });
  const catchUp = await c.ev(`(() => { const s = Math.ceil(pomoLeft() / 1000), d = [...document.querySelectorAll('#pomo-dom .top.static span')].map(x => x.textContent).join('');
    return { left: s, shown: +d.slice(0, 2) * 60 + +d.slice(2), ticker: !!ticker }; })()`);
  check('冻结恢复后卡片立刻追上', Math.abs(catchUp.shown - catchUp.left) <= 1, catchUp);
  check('页面无 JS 报错', c.errors.length === 0, c.errors);
  c.close();

  server.close();
  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL 测试脚本异常', e); process.exit(1); });
