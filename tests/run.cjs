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

  // 刚打开那一帧：数字要直接是当前时间（以前 6 位从 00 一起翻，上半张新、下半张 0，卡半秒），视图也不该还在淡入
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__first = null; (function f() {
    const ds = [...document.querySelectorAll('#clock-dom .flip-digit')];
    if (!ds.length || !document.body) return requestAnimationFrame(f);
    const v = document.querySelector('.view-container.active');
    window.__first = { top: ds.map(d => d.querySelector('.top.static span').textContent).join(''), bot: ds.map(d => d.querySelector('.bottom.static span').textContent).join(''),
      flipping: document.querySelectorAll('#clock-dom .flip-anim-top, #clock-dom .flip-anim-bottom').length,
      fading: v.getAnimations().filter(a => a.playState === 'running').length };
  })();` });
  await c.goto(U);
  const first = await c.ev('window.__first');
  check('刚打开第一帧：数字就是当前时间、没有在翻、没有在淡入', first && first.top === first.bot && first.top !== '000000' && first.flipping === 0 && first.fading === 0, first);

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

  // 竖屏不自动沉浸：放着 5 秒以上按钮栏还在（只有横屏/点了沉浸键才隐藏）
  await sleep(5600);
  check('竖屏放着不动：按钮栏不隐藏', await c.ev("![...document.querySelectorAll('.top-bar')].some(b => b.classList.contains('idle-hidden'))"));

  // 番茄钟按真实时间走：冻结页面 5 秒（相当于 iPhone 锁屏/切后台）
  await c.ev("document.querySelector('[data-tab=pomodoro]').click()"); await sleep(300);
  // 假的 Wake Lock：验证"计时中申请、暂停后释放"的逻辑（headless 里真的申请不到）。
  // 这一段测的是"常亮开关关掉时"的行为，所以先把开关关了（默认是开）
  await c.ev("localStorage.setItem('keepAwake', '0'); screenPref.awake = false; syncWakeLock()"); await sleep(100);
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
  check('签名边打边不存（没确认前存储里还是旧的）', (await c.ev("localStorage.getItem('savedQuote')")) === null);
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(400);
  check('签名按回车结束编辑', await c.ev("document.activeElement !== document.getElementById('quote-text')"));
  const SHEET = "document.getElementById('quote-sheet').classList.contains('active')";
  check('改过签名 → 弹出保存/放弃/继续编辑操作表，且回车那一下没被顺手算成保存',
    (await c.ev(SHEET)) && (await c.ev("localStorage.getItem('savedQuote')")) === null && /x{40}/.test(await c.ev("document.getElementById('quote-sheet-text').textContent")));
  const sheetBox = await c.ev("(() => { const b = document.querySelector('#quote-sheet .sheet').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, vw: innerWidth, vh: innerHeight, btnH: document.getElementById('quote-save').offsetHeight }; })()");
  check('操作表在屏幕内、贴底、按钮够高', sheetBox.l >= 0 && sheetBox.r <= sheetBox.vw && sheetBox.b <= sheetBox.vh && sheetBox.vh - sheetBox.b < 60 && sheetBox.btnH >= 44, sheetBox);
  await c.vshot(path.join(__dirname, 'shots', 'p390-quote-sheet.png'));
  await c.ev("document.getElementById('quote-continue').click()"); await sleep(400);
  check('继续编辑：操作表收起、回到签名输入、内容还在', !(await c.ev(SHEET)) && await c.ev("document.activeElement === document.getElementById('quote-text') && document.getElementById('quote-text').textContent === 'x'.repeat(40)"));
  await c.ev("document.getElementById('quote-text').blur()"); await sleep(400);
  await c.ev("document.getElementById('quote-discard').click()"); await sleep(400);
  check('放弃修改：恢复成原来那句、不写存储', !(await c.ev(SHEET)) && (await c.ev("document.getElementById('quote-text').textContent")) === '心态代表风水' && (await c.ev("localStorage.getItem('savedQuote')")) === null);
  await c.ev("{ const q = document.getElementById('quote-text'); q.focus(); q.blur(); }"); await sleep(300);
  check('没改动就结束编辑 → 不弹', !(await c.ev(SHEET)));
  await c.ev("{ const q = document.getElementById('quote-text'); q.focus(); q.textContent = 'abc'; q.dispatchEvent(new Event('input')); }");
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(300);
  check('改签名时按 Esc = 直接放弃、不弹', !(await c.ev(SHEET)) && (await c.ev("document.getElementById('quote-text').textContent")) === '心态代表风水');
  await c.ev("{ const q = document.getElementById('quote-text'); q.focus(); q.textContent = ''; q.dispatchEvent(new Event('input')); q.blur(); }"); await sleep(400);
  check('清空也会问，提示"会被清空"', (await c.ev(SHEET)) && /清空/.test(await c.ev("document.getElementById('quote-sheet-text').textContent")));
  await c.ev("document.getElementById('quote-save').click()"); await sleep(400);
  check('保存：存进存储', !(await c.ev(SHEET)) && (await c.ev("localStorage.getItem('savedQuote')")) === '');

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

  /* ---------- 真横屏手机 844×390：默认常亮、横屏自动沉浸、闲置进待机显示 ---------- */
  c = await open(844, 390, 3);
  const FAKE_WL = `window.__wl = { req: 0, rel: 0 }; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { __wl.req++;
    const t = new EventTarget(); t.release = async () => { __wl.rel++; t.dispatchEvent(new Event('release')); }; return t; } } });`;
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_WL });
  await c.goto(U); await fresh(c);
  check('默认：一打开就申请常亮（停在时钟页、没点沉浸键也要常亮）', await c.ev('__wl.req >= 1 && !!wakeLock'), await c.ev('__wl'));
  await c.ev('wakeLock.release()'); await sleep(100);   // 系统收回（切后台/锁屏）
  await c.ev("document.dispatchEvent(new Event('visibilitychange'))"); await sleep(100);
  check('常亮被系统收回后，回到前台重新申请', await c.ev('__wl.req >= 2 && !!wakeLock'), await c.ev('__wl'));
  const HIDDEN = "[...document.querySelectorAll('.top-bar')].every(b => b.classList.contains('idle-hidden'))";
  check('横屏刚打开时按钮栏可见', !(await c.ev(HIDDEN)));
  await sleep(5600);
  check('横屏放着 5 秒不动：自动沉浸（按钮栏隐藏）', await c.ev(HIDDEN));
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 420, y: 200 }] });
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(200);
  check('碰一下屏幕按钮栏回来', !(await c.ev(HIDDEN)));
  await c.ev("document.getElementById('settings-btn').click()"); await sleep(5600);
  check('设置开着时不自动隐藏', !(await c.ev(HIDDEN)));
  const sw0 = await c.ev("[...document.querySelectorAll('.switch-row input')].map(i => i.checked)");
  check('设置里三个开关默认：常亮开、自动沉浸开、自动待机关', JSON.stringify(sw0) === '[true,true,false]', sw0);
  const swBox = await c.ev("[...document.querySelectorAll('.switch-row')].map(r => Math.round(r.getBoundingClientRect().height))");
  check('开关行高 ≥ 44', swBox.every(h => h >= 44), swBox);
  await c.ev("document.getElementById('set-autoimm').click()"); await sleep(100);
  await c.ev("document.getElementById('settings-btn').click()"); await sleep(300);
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(5800);
  check('关掉"横屏自动沉浸"后横屏也不隐藏、开关记住了', !(await c.ev(HIDDEN)) && (await c.ev("localStorage.getItem('autoImmersive')")) === '0');
  await c.ev("document.getElementById('set-awake').click()"); await sleep(200);
  check('关掉"保持屏幕常亮"→ 释放常亮', await c.ev('!wakeLock && __wl.rel >= 2'), await c.ev('__wl'));
  await c.ev("document.getElementById('set-awake').click(); document.getElementById('set-autosb').click()"); await sleep(200);
  check('打开自动待机后记住', (await c.ev("localStorage.getItem('autoStandby')")) === '1');
  await c.ev("idleSince = Date.now() - 61000"); await sleep(5600);
  check('横屏闲置 1 分钟 → 自动进入待机显示', /standby\.html$/.test(await c.ev('location.pathname')), await c.ev('location.pathname'));
  c.close();

  /* ---------- 两种横屏（真横过来 / 点旋转按钮）卡片一样大：iPhone 14 Pro 实测安全区 ----------
     以前真横屏 106×143、强制横屏 137×185（用户截图），差的 42pt 正好是底部主屏指示条 21pt × 上下对称 */
  const CARD = "(() => { const b = document.querySelector('.view-container.active .clock-group').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })()";
  c = await open(852, 393, 3);
  await c.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, topMax: 0, bottom: 21, bottomMax: 21, left: 59, leftMax: 59, right: 59, rightMax: 59 } });
  await c.goto(U); await c.ev("localStorage.clear(); localStorage.setItem('autoImmersive', '0')"); await c.goto(U); await sleep(900);
  const physCard = await c.ev(CARD), physIcons = await c.ev("[...document.querySelectorAll('#top-left .icon-btn')].filter(b => b.offsetParent).length");
  // 横屏按钮浮在上层不占位（用户 2026-10-26 看效果图选的）：卡片从 137×185 放大，且按钮出现/隐藏时卡片不跳（HIG：切换别突兀）
  check('横屏卡片比以前大（以前 137×185，现在 ≥170×229）', physCard[0] >= 170 && physCard[1] >= 229, physCard);
  await c.ev("document.querySelectorAll('.top-bar').forEach(b => b.classList.add('idle-hidden'))"); await sleep(900);
  check('按钮隐藏/出现时卡片大小不变', JSON.stringify(await c.ev(CARD)) === JSON.stringify(physCard), [physCard, await c.ev(CARD)]);
  await c.ev("document.querySelectorAll('.top-bar').forEach(b => b.classList.remove('idle-hidden'))"); await sleep(400);
  const ovl = await c.ev("(() => { const t = document.querySelector('.top-bar').getBoundingClientRect(), d = document.getElementById('date-display').getBoundingClientRect(), g = document.querySelector('#view-clock .clock-group').getBoundingClientRect(); return { barBottom: t.bottom, dateTop: d.top, cardTop: g.top, barLeft: t.left }; })()");
  check('浮起来的按钮栏不压卡片和日期、不压灵动岛那侧', ovl.barBottom <= ovl.dateTop + 1 && ovl.barBottom <= ovl.cardTop && ovl.barLeft >= 58, ovl);
  layoutChecks('真横屏(安全区)/时钟', await c.ev(GEO));
  const navC = await c.ev("(() => { const b = document.querySelector('.nav-menu').getBoundingClientRect(); return (b.left + b.right) / 2; })()");
  check('横屏：图标并到顶行左边、导航仍在正中(±2)', physIcons >= 3 && Math.abs(navC - 426) <= 2, { physIcons, navC });
  check('页面无 JS 报错', c.errors.length === 0, c.errors);
  c.close();
  c = await open(393, 852, 3);
  await c.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, topMax: 59, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } });
  await c.goto(U); await c.ev("localStorage.clear(); localStorage.setItem('autoImmersive', '0'); localStorage.setItem('forceLandscape', '1')"); await c.goto(U); await sleep(900);
  const forcedCard = await c.ev(CARD);
  check('真横屏和强制横屏卡片一样大(±2)', Math.abs(physCard[0] - forcedCard[1]) <= 2 && Math.abs(physCard[1] - forcedCard[0]) <= 2, { physCard, forcedCard });
  await c.ev("document.getElementById('rotate-btn').click()"); await sleep(700);
  check('转回竖屏：图标回到底栏', await c.ev("document.querySelector('.bottom-bar-wrap .icon-group') !== null && getComputedStyle(document.querySelector('.bottom-bar-wrap')).display !== 'none'"));
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
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: false });   // 电脑：主输入是鼠标（不关的话会被当成触屏）
    await c.goto(U); await fresh(c);
    const g = await c.ev(GEO);
    check(`桌面 ${w}×${h}：鼠标设备不用横屏浮层（用户要电脑保持原样）`, await c.ev("!document.body.classList.contains('land-overlay') && getComputedStyle(document.querySelector('.top-bar')).position !== 'absolute'"));
    layoutChecks(`桌面 ${w}×${h}`, g);
    if (w >= 1920) check(`桌面 ${w}×${h} 时钟宽度 ≥ 屏宽 50%`, g.clock.w / w >= 0.5, (g.clock.w / w).toFixed(2));
    await c.vshot(path.join(__dirname, 'shots', `d${w}.png`));
    check('页面无 JS 报错', c.errors.length === 0, c.errors);
    c.close();
  }

  /* ---------- 待机显示 standby.html：iPhone 14 Pro 横屏 852×393 ---------- */
  c = await open(852, 393, 3);
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_WL });
  const SB = U + 'standby.html';
  await c.goto(SB); await c.ev('localStorage.clear()');
  await c.goto(SB + '?t=2026-10-26T14:54:10&page=1&face=0'); await sleep(700);
  check('待机显示：打开就申请屏幕常亮', await c.ev('__wl.req >= 1'), await c.ev('__wl'));
  check('待机显示：画板 852×393 在 iPhone 14 Pro 横屏下 1:1（缩放 1、不转）', await c.ev('__sb.view.s === 1 && !__sb.view.rot'), await c.ev('__sb.view'));
  check('数字样式显示 14:54', (await c.ev("[...document.querySelectorAll('.face-digital text')].slice(0, 4).map(t => t.textContent).join('')")) === '1454');
  const cal = await c.ev(`(() => { const cs = [...document.querySelectorAll('#stack-r circle')]; const r = [...document.querySelectorAll('#stack-r rect')].filter(e => +e.getAttribute('width') > 30);
    return { today: cs.map(e => [+(+e.getAttribute('cx')).toFixed(1), +(+e.getAttribute('cy')).toFixed(1)]), lines: r.map(e => +(+e.getAttribute('x') + 15.35).toFixed(1)) }; })()`);
  check('月历：26 号红圈在第 5 行第 1 列（实测 478.5,341.8）、10 号（调休上班）下面有红线',
    cal.today.length === 1 && Math.abs(cal.today[0][0] - 478.3) < 1 && Math.abs(cal.today[0][1] - 342) < 1 && cal.lines.length === 1 && Math.abs(cal.lines[0] - 708.3) < 1, cal);
  const bj = await c.ev("(() => { const c = [...document.querySelectorAll('.face-world circle')].find(e => +e.getAttribute('r') > 8); return c && [+c.getAttribute('cx'), +c.getAttribute('cy')]; })()");
  check('世界时钟：北京定位点在截图位置（687.4,140）±1', bj && Math.abs(bj[0] - 687.4) < 1 && Math.abs(bj[1] - 140) < 1.5, bj);
  check('白天 14:54 不是夜间模式', !(await c.ev("document.getElementById('board').classList.contains('night')")));
  const drag = async (x0, y0, x1, y1, steps = 8, ms = 16) => {
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }] }); await sleep(ms); }
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(900);
  };
  await drag(426, 200, 426, 60);
  check('时钟页上滑 → 换到下一个样式（指针）', (await c.ev('__sb.pagers.facePager.idx')) === 1);
  await drag(426, 120, 426, 140, 4, 60);
  check('慢慢拖一点点就松手 → 弹回原样式', (await c.ev('__sb.pagers.facePager.idx')) === 1);
  await drag(300, 200, 700, 200);
  check('右滑 → 回到小组件页', (await c.ev('__sb.pagers.hPager.idx')) === 0);
  await drag(200, 300, 200, 80);
  const stk = await c.ev("({ idx: __sb.pagers.stackLPager.idx, dots: document.getElementById('dots-l').classList.contains('show'), on: [...document.querySelectorAll('#dots-l b')].findIndex(b => b.classList.contains('on')) })");
  check('左边叠放上滑 → 换到下一个小组件，旁边出现位置圆点', stk.idx === 1 && stk.dots && stk.on === 1, stk);
  await sleep(1700);
  check('停下 1 秒多后圆点淡出', !(await c.ev("document.getElementById('dots-l').classList.contains('show')")));
  await drag(640, 300, 640, 80);
  check('右边月历上滑：只有一项，弹回不动', (await c.ev('__sb.pagers.stackRPager.idx')) === 0 && (await c.ev('__sb.pagers.stackLPager.idx')) === 1);
  await drag(100, 200, -200, 200, 8, 16);
  await drag(700, 200, 300, 200);
  check('左滑 → 回到时钟页、样式还是刚才那个', (await c.ev('__sb.pagers.hPager.idx')) === 1 && (await c.ev('__sb.pagers.facePager.idx')) === 1);
  // 连甩两下（第二下在第一下的弹簧动画还没停时按下）：两下都要算
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 426, y: 300 }] });
  for (let i = 1; i <= 4; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 426, y: 300 - 40 * i }] }); await sleep(10); }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(80);
  await drag(426, 300, 426, 140, 4, 10);
  check('动画半路再甩一下不被吞（连甩两下走两格）', (await c.ev('__sb.pagers.facePager.idx')) === 3, await c.ev('__sb.pagers.facePager.idx'));
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 426, y: 200 }] }); await sleep(800);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300);
  check('长按 → 弹出设置（夜间模式 / 颜色 / 退出）', await c.ev("document.getElementById('sheet').classList.contains('open') && getComputedStyle(document.getElementById('grp-color')).display !== 'none'"));
  const segH = await c.ev("[...document.querySelectorAll('#seg-night button, .btns button')].map(b => Math.round(b.getBoundingClientRect().height))");
  check('设置面板按钮高度：分段 ≥30、底部按钮 ≥44', segH.slice(0, 3).every(h => h >= 30) && segH.slice(3).every(h => h >= 44), segH);
  await c.ev("document.querySelector('#seg-night [data-v=on]').click()"); await sleep(200);
  check('夜间模式「打开」→ 整屏变红、记住设置', await c.ev("document.getElementById('board').classList.contains('night') && localStorage.getItem('sbNight') === 'on'"));
  await c.ev("document.querySelector('#seg-night [data-v=auto]').click()"); await sleep(200);
  check('「自动」在 14:54 → 不是夜间', !(await c.ev("document.getElementById('board').classList.contains('night')")));
  await c.ev("document.querySelectorAll('#swatches button')[1].click()"); await sleep(200);
  check('换颜色生效并记住（日光样式）', (await c.ev("localStorage.getItem('sbColor_solar')")) === '1');
  await c.ev("document.querySelectorAll('#swatches button')[0].click(); document.getElementById('btn-done').click()"); await sleep(300);
  check('点「完成」收起设置', !(await c.ev("document.getElementById('sheet').classList.contains('open')")));
  const tap = async (x, y) => { await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(40); await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const NIGHT = "document.getElementById('board').classList.contains('night')";
  await sleep(500); await tap(426, 200); await sleep(500); await tap(426, 200); await sleep(300);
  check('隔 0.5 秒点两下不算双击（不切换）', !(await c.ev(NIGHT)));
  await sleep(500); await tap(426, 200); await sleep(120); await tap(430, 205); await sleep(300);
  const ov = await c.ev("JSON.parse(localStorage.getItem('sbNightOverride'))");
  check('「自动」下白天双击 → 临时切到夜间，管到 22:30', (await c.ev(NIGHT)) && ov && ov.on === true && new Date(ov.until).getHours() === 22 && new Date(ov.until).getMinutes() === 30 && (await c.ev("localStorage.getItem('sbNight')")) === 'auto', ov);
  await sleep(500); await tap(426, 200); await sleep(120); await tap(426, 200); await sleep(300);
  check('再双击 → 回到白天、临时切换清掉', !(await c.ev(NIGHT)) && (await c.ev("localStorage.getItem('sbNightOverride')")) === 'null');
  check('双击没有误触发翻页/样式切换', (await c.ev('[__sb.pagers.hPager.idx, __sb.pagers.facePager.idx]')).join() === '1,3');
  await c.goto(SB + '?t=2026-10-26T02:30:00'); await sleep(600);
  check('「自动」在凌晨 2:30 → 夜间模式', await c.ev("document.getElementById('board').classList.contains('night')"));
  // 夜间时段 22:30–6:00（用户 2026-10-26 改的）：边界前后一分钟各测一下
  const edges = [];
  for (const [t, want] of [['22:29', false], ['22:30', true], ['05:59', true], ['06:00', false]]) {
    await c.goto(SB + `?t=2026-10-26T${t}:10`); await sleep(400);
    edges.push([t, (await c.ev("document.getElementById('board').classList.contains('night')")) === want]);
  }
  check('夜间时段 22:30–6:00：22:29 白天、22:30 夜间、5:59 夜间、6:00 白天', edges.every(e => e[1]), edges);
  check('设置里写的时段跟着改了', (await c.ev("document.getElementById('night-range').textContent")) === '22:30–6:00');
  await c.goto(SB + '?t=2026-10-26T02:30:00'); await sleep(400);
  check('重开后记住上次停在哪一页、哪个样式', (await c.ev('[__sb.pagers.hPager.idx, __sb.pagers.facePager.idx]')).join() === '1,3');
  const lunarSb = await c.ev("Array.from({ length: 800 }, (_, i) => __sb.lunarText(new Date(2025, 0, 1 + i * 3)))");
  check('待机显示页没有 JS 报错', c.errors.length === 0, c.errors);
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(700);
  check('Esc → 退出待机显示，回到时钟主页', /\/$/.test(await c.ev('location.pathname')), await c.ev('location.pathname'));
  const lunarIdx = await c.ev("Array.from({ length: 800 }, (_, i) => lunarText(new Date(2025, 0, 1 + i * 3)))");
  check('两个页面的农历换算结果逐日一致（2025 起 800 个日期）', JSON.stringify(lunarSb) === JSON.stringify(lunarIdx) && lunarIdx[0] === '腊月初二');
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83 }); await sleep(700);
  check('主页按 S → 进入待机显示', /standby\.html$/.test(await c.ev('location.pathname')));
  await c.vshot(path.join(__dirname, 'shots', 'sb852-clock.png'));
  c.close();

  /* ---------- 待机显示：电脑 1707×1067（16:10，不是 852:393）→ 不能有黑边 ---------- */
  c = await open(1707, 1067, 1.5);
  await c.goto(SB); await c.ev('localStorage.clear()');
  await c.goto(SB + '?t=2026-10-26T21:23:10&page=1&face=3'); await sleep(700);
  const dk = await c.ev(`(() => { const b = document.getElementById('board').getBoundingClientRect(), bg = document.querySelector('.face-solar > .abs').getBoundingClientRect();
    return { b: [b.left, b.top, b.right, b.bottom].map(Math.round), bg: [bg.left, bg.top, bg.right, bg.bottom].map(Math.round), scroll: document.scrollingElement.scrollHeight - innerHeight }; })()`);
  check('电脑 16:10：画板铺满窗口、日光背景铺满（以前上下各一条黑边）、页面不能滚',
    dk.b.join() === '0,0,1707,1067' && dk.bg.join() === '0,0,1707,1067' && dk.scroll === 0, dk);
  check('电脑上有「全屏」入口（F 键 / 设置里的按钮）', await c.ev("getComputedStyle(document.getElementById('btn-fs')).display !== 'none'"));
  const anFrame = await c.ev(`(() => { const pg = document.querySelector('.face-analog').getBoundingClientRect(), ls = [...document.querySelectorAll('.face-analog > svg line')].map(l => l.getBoundingClientRect());
    return { top: Math.round(Math.min(...ls.map(r => r.top)) - pg.top), bottom: Math.round(Math.max(...ls.map(r => r.bottom)) - pg.top), left: Math.round(Math.min(...ls.map(r => r.left)) - pg.left), right: Math.round(Math.max(...ls.map(r => r.right)) - pg.left), s: __sb.view.s }; })()`);
  check('电脑 16:10：指针表盘外框贴着屏幕边（离边 24/49pt × 缩放，不再上下空一大块）',
    Math.abs(anFrame.top - 24 * anFrame.s) <= 4 && Math.abs(1067 - anFrame.bottom - 24 * anFrame.s) <= 4 && Math.abs(anFrame.left - 49 * anFrame.s) <= 4, anFrame);
  check('页面无 JS 报错', c.errors.length === 0, c.errors);
  c.close();

  /* ---------- 待机显示：竖着拿（开了竖排锁定）390×844 → 整块转 90°，手势方向跟着换算 ---------- */
  c = await open(390, 844, 3);
  await c.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, topMax: 59, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } });
  await c.goto(SB); await c.ev("localStorage.clear(); localStorage.setItem('sbPage', '0')");
  await c.goto(SB + '?t=2026-10-26T14:54:10'); await sleep(700);
  const pv = await c.ev("(() => { const b = document.getElementById('board').getBoundingClientRect(), k = document.querySelector('#stack-l .core').getBoundingClientRect(); return { rot: __sb.view.rot, s: __sb.view.s, l: b.left, t: b.top, r: b.right, b: b.bottom, coreTop: k.top, coreBottom: k.bottom }; })()");
  check('竖屏：画板转 90° 铺满整个屏幕', pv.rot && Math.abs(pv.l) < 0.5 && Math.abs(pv.t) < 0.5 && Math.abs(pv.r - 390) < 0.5 && Math.abs(pv.b - 844) < 0.5, pv);
  check('竖屏：内容让开顶部 59pt 状态栏（状态栏网页藏不掉），不被它压住', pv.coreTop >= 58.5 && pv.coreBottom <= 844.5 && pv.s > 0.9, pv);
  // 转过来后，画面的「向左滑」= 手指在屏幕上往上划
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 650 }] });
  for (let i = 1; i <= 8; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 650 - 50 * i }] }); await sleep(16); }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(900);
  check('竖屏：手指往上划 = 画面里向左滑 → 翻到时钟页', (await c.ev('__sb.pagers.hPager.idx')) === 1);
  check('竖着进来的，不会因为「是竖屏」就自动退出', /standby\.html$/.test(await c.ev('location.pathname')));
  await c.vshot(path.join(__dirname, 'shots', 'sb390-rotated.png'));
  check('页面无 JS 报错', c.errors.length === 0, c.errors);
  c.close();

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
