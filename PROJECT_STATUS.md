# Flip-clock 项目现状（交接文档）

> 改这个仓库前先读这份。最后更新：2026-10-19（打开不再从 00 翻、签名改动确认）

## 一句话
单文件 `index.html` 的翻页时钟（时钟 / 番茄钟 / 计时器），GitHub Pages 部署：push 到 `main` 即上线
（https://fjkkx77.github.io/Flip-clock/ ）。改完先跑 `node tests/run.cjs`，必须全绿再推。

## 结构上不能动错的几处
1. **布局**：`.view-container` 三行网格 `上附属 | 卡片 | 下附属`，上下行等高 → 卡片永远在正中。
   新内容放进 `.v-above` / `.v-below`，别给 `.clock-container` 加上下 margin。
   卡片大小 = CSS 里的"最大期望尺寸" × JS `fitLayout()` 实测出来的 `--fit`(≤1)。
2. **画框**：居中参照是 `getFrame()` 实测（无浏览器界面用 outer 尺寸，否则 visualViewport），
   别改回 `top:50%` / `innerHeight`。输入框获得焦点时画框锁住不重量（防键盘把时钟压小）。
3. **CSS 变量继承坑**：`--card-h` / `--font-sz` 是从 `--card-w` 推出来的，
   **在哪个选择器里改了 `--card-w`，就要在同一个选择器里把这两条也重写一遍**
   （var() 在声明它的元素上就算好了，子元素继承的是算好的值）。`body.force-landscape` 就是这么写的。
4. **计时一律按真实时间**：番茄钟/倒计时存 `endAt`，正计时存 `startAt + baseMs`，显示时用 `Date.now()` 推。
   不许改回 `setInterval` 每次 ±1 秒（iPhone 锁屏/切后台会停表）。状态存在 localStorage 的
   `pomoState` / `swState` / `cdState`。
5. **翻页动画**：`flipSingleDigit` 每次新翻页先 `clearTimeout` 掉上一次的两个回调，否则连翻会闪错数字。
   视图没显示时传 `animate=false` 直接换字。
6. **农历**：用内嵌的香港天文台数据表（1901–2100），**不要换回 `Intl` 的 chinese 历法**
   （2027-02-06 等 12 段会算错）。来源和自检见记忆库 `references/组件_农历换算/`。
7. **刚打开 / 从后台回来不播翻页**：`updateClock(false)`、`catchUp` 里都直接换字。以前打开时 6 位从 00 一起翻，
   翻到一半上半张是新数字、下半张是 0，看着像卡住（用户截图报过）。打开时视图的淡入动画也直接播完。
8. **签名**：编辑中不落盘；结束编辑且内容变了才弹底部操作表（保存 / 放弃修改 / 继续编辑），
   Esc = 直接放弃。判断"切走窗口不算结束"用 `activeElement === 签名`，**别用 `document.hasFocus()`**
   （没拿到窗口焦点时恒为 false，会永远不弹、改动白丢）。操作表底色必须完全不透明，否则后面的大数字透出虚影。
9. **强制横屏**：包装器顺时针转 90°，安全区映射 上→右、右→下、下→左、左→上。

## localStorage 键
`theme`（light/缺省=暗）、`savedQuote`（存过就用，空字符串也算；只在操作表点"保存"时写）、`forceLandscape`（1/0）、
`tab`、`timerMode`（up/down）、`focusMin`、`breakMin`、`pomoState`、`swState`、`cdState`。

## 排查
连点数字卡片 5 下（或地址加 `?debug`）出诊断面板：视口/安全区/画框/fit/常亮状态，点一下面板关闭。

## 只能真机确认、自动测试覆盖不了的
- iPhone 主屏幕模式下屏幕常亮是否生效（WebKit 曾有 bug 254545，MDN 标注 iOS 18.4 前主屏幕模式不可用，之后的版本未核实）
- 提示音：iPhone 静音键打开时 Web Audio 不出声；锁屏期间 JS 被挂起，提醒要等回到页面才响
- 签名操作表：iPhone 上点键盘「完成」/ ✓ / 点空白处都应弹出；"继续编辑"要能把键盘弹回来
- 弹出键盘时画框锁定的实际效果；强制横屏下系统键盘仍按竖屏方向弹出（系统行为，改不了）

## 测试
`node tests/run.cjs`：起本地服务 + headless Chrome（路径在 `tests/cdp.js`），87 条。
截图输出到 `tests/shots/`（已 gitignore）。冻结页面的用例必须单独开浏览器跑——
**headless 页面没有窗口焦点时不触发 focus/blur 事件**，测签名之类要先 `Emulation.setFocusEmulationEnabled` 或先发一次真键盘输入。
headless 里冻结恢复后 CSS 动画时钟会停，留在同一页会让后面量位置的用例失真。
