# Flip Clock ⏳
> 复古风格的翻页时钟，原生 HTML 纯前端实现，带番茄钟、正计时和倒计时，支持沉浸模式和深浅两套主题，无广告、无外部依赖，适合手机横放、桌面装饰、直播背景、办公展示。

[![GitHub stars](https://img.shields.io/github/stars/fjkkx77/Flip-clock?style=social)](https://github.com/fjkkx77/Flip-clock/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/fjkkx77/Flip-clock?style=social)](https://github.com/fjkkx77/Flip-clock/network/members)
[![在线Demo](https://img.shields.io/badge/在线Demo-点击访问-brightgreen)](https://fjkkx77.github.io/Flip-clock/)

---

## ✨ 核心功能亮点
- 🎬 **复古翻页动画**：原生 CSS3 实现经典机械翻页时钟的翻页效果
- 🕰️ **时钟**：24 小时制，显示公历、农历（香港天文台数据，1901–2100 年）和星期
- 🍅 **番茄钟**：专注 / 休息两段，时长可在设置里改；结束时提示音 + 卡片闪烁 + 自动切到下一段
- ⏱️ **计时器**：正计时、倒计时各自独立运行，切换不会清零；倒计时填完时长直接开始
- ⌛ **按真实时间计时**：手机锁屏、切到别的 App 再回来，时间照样准；刷新页面也接得上
- 🔆 **屏幕常亮**：沉浸模式和计时进行中会申请屏幕常亮（需浏览器支持 Screen Wake Lock）
- 🖥️ **沉浸模式**：按钮 5 秒后自动隐藏，电脑上同时进入浏览器全屏
- 📱 **强制横屏**：手机竖着拿也能横向显示，可添加到主屏幕当 App 用
- 🎨 **两套主题**：暗夜经典 / 晨曦极简，主题、签名、横屏等设置都会记住
- ⌨️ **快捷键**：空格 开始/暂停，F 沉浸模式，Esc 关闭设置
- ⚡ **开箱即用**：单个 HTML 文件 + 一个 1.6KB 的数字字体，不连任何外部服务，下载后直接双击也能用

---

## 🖼️ 项目预览
<img width="1152" height="644" alt="PixPin_2026-04-01_08-36-46" src="https://github.com/user-attachments/assets/ff8657f1-fcba-42d9-af49-a9bc17542367" />
<img width="1150" height="643" alt="PixPin_2026-04-01_08-37-14" src="https://github.com/user-attachments/assets/7d13573a-7309-4e9f-8e0a-b9845c930b93" />
<img width="1150" height="641" alt="PixPin_2026-04-01_08-37-29" src="https://github.com/user-attachments/assets/a13ecd6b-657d-4ac2-bc89-941a232be5a5" />
<img width="1150" height="645" alt="PixPin_2026-04-01_08-37-49" src="https://github.com/user-attachments/assets/8ad1a8de-7064-458a-ae39-c22dc985ad56" />
<img width="1150" height="645" alt="PixPin_2026-04-01_08-37-58" src="https://github.com/user-attachments/assets/ecfe3b6f-9bd5-423b-921d-976a274482e3" />


---

## 🚀 快速开始
### 方式一：直接在线使用（推荐）
点击 [在线Demo](https://fjkkx77.github.io/Flip-clock/) 即可直接使用，无需任何安装配置，打开浏览器就能用。

### 方式二：一键部署到自己的GitHub Pages
1.  点击页面右上角的 **Fork** 按钮，把本仓库复刻到你自己的GitHub账号下
2.  进入你复刻后的仓库，点击顶部的 `Settings` → 左侧找到 `Pages`
3.  Source 选项选择 `Deploy from a branch`，Branch 选择 `main`，文件夹选择 `/ (root)`，点击 Save
4.  等待1-2分钟，刷新页面，就能生成你自己的在线访问链接，拥有属于你的翻页时钟网站

### 方式三：本地离线使用
1.  点击仓库右上角的 `Code` 按钮，选择 `Download ZIP` 下载完整项目压缩包
2.  解压压缩包，找到里面的 `index.html` 文件
3.  直接用浏览器双击打开 `index.html`，就能离线使用，无需联网

---

## 🛠️ 技术栈
- 原生 HTML5 + CSS3 + JavaScript，无构建流程、无第三方库
- 数字字体为 [Oswald](https://github.com/googlefonts/OswaldFont) 的子集（只含 0-9 和冒号），随仓库分发，遵循 SIL OFL 1.1（见 `fonts/OFL.txt`）

## 🧪 测试
```bash
node tests/run.cjs
```
用本机的 Chrome（headless）在竖屏手机、横屏手机、强制横屏和三种桌面尺寸下实际跑一遍：布局居中不重叠、计时按真实时间走、番茄钟/倒计时结束流程、设置持久化、农历关键日期等，全部通过退出码为 0。需要 Node 18+ 和本机安装的 Chrome（路径写在 `tests/cdp.js` 里）。

---

## 📝 更新日志
### v2.0.0 (2026-10-08)
- ✨ 番茄钟加入休息段和可调时长，结束时有提示音、卡片闪烁和提示
- ✨ 倒计时输入即生效（去掉"设定"按钮）；正计时、倒计时各跑各的
- ✨ 屏幕常亮、快捷键、标签页标题显示剩余时间、添加到主屏幕的图标
- 🐛 计时改按真实时间计算：以前锁屏/切后台会停表
- 🐛 番茄钟走完后按钮卡在"暂停"、倒计时不点"设定"直接开始会立刻"时间到"、负数输入显示乱码
- 🐛 农历改用香港天文台数据：浏览器内置历法会把 2027-02-06（春节）显示成"腊月三十"
- 🐛 翻页动画连翻时下半张闪错数字；主题和清空的签名刷新后丢失
- 💄 大屏上时钟不再被像素上限卡小；按钮热区 ≥ 44px；浅色主题对比度达标；触屏上按钮不再"粘"在悬停状态
- ⚡ 字体改为随仓库分发（以前从 Google Fonts 加载，首屏要等 2–7 秒）

### v1.0.0 (2026-03-31)
- ✨ 初始版本发布
- ✅ 复古翻页动画效果实现
- ✅ 支持全屏显示模式
- ✅ 内置两套主题切换
- ✅ 全终端响应式适配

---

## 🤝 贡献指南
欢迎提交 Issue 和 Pull Request！
- 发现Bug、有功能建议，都可以提交 [Issue](https://github.com/fjkkx77/Flip-clock/issues)
- 想优化代码、新增功能，Fork仓库后提交PR即可，我会及时处理

---

## 📄 开源协议
本项目采用 [MIT 协议](LICENSE) 开源，可自由使用、修改、二次开发和商用，无任何限制。

---

如果这个项目对你有帮助，欢迎给个 Star ⭐️ 支持一下！
