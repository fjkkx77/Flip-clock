"""待机显示 standby.html 的替代字体：没有 SF 字体的设备（Windows、安卓）用它们代替，iPhone / Mac 不下载、不使用。

用法：python tools/build-standby-fonts.py <RobotoFlex 可变字体.ttf> <Baloo2 可变字体.ttf>
源文件（都是 SIL OFL 1.1，许可证见 fonts/OFL-standby.txt）：
  https://github.com/google/fonts/tree/main/ofl/robotoflex   RobotoFlex[GRAD,XOPQ,...,wdth,wght].ttf
  https://github.com/google/fonts/tree/main/ofl/baloo2   Baloo2[wght].ttf
圆体（漂浮样式用）2026-10-30 从 M PLUS Rounded 1c 换成 Baloo 2：用户指出 M PLUS 的「3」是平顶、跟 SF 圆顶不像。
  拿用户 iPhone 上 probe.html 截的 SF 圆体 0–9，12 款开源圆体按「1」竖笔粗细对齐后逐字算重合度（交并比）：
  Baloo 2 平均 0.865（最差「3」0.77），M PLUS ExtraBold 0.812（「3」0.62），其余 ≤0.84。字重 742 时竖笔粗细跟 SF 900 一样（0.254）。
只留 0–9 和冒号（U+30–3A），页面里用 unicode-range 限定，别的字照旧走系统字体。

为什么 Roboto Flex 拆成好几个文件（2026-10-29 实测）：
  页面按 SF 的字重写（500/600/700），可 Roboto Flex 越窄笔画相对越粗、越宽相对越细，SF 不是这样，
  所以「SF 字重 → Roboto Flex 字重」要按宽窄分档对应，一档一个文件（只留 wdth 轴，字重钉死）。
  页面里每个文件按 (字重, 宽度范围) 注册，浏览器按 font-weight + font-stretch 自己挑。
  字重是拿 iPhone 截图的「1」竖笔宽 ÷ 字高逐档对出来的：
    数字样式（SF 700 窄体）0.125 / 日光（SF 500 宽体）0.164 / 世界时钟大时间（SF 600 正常宽）0.176 / 指针 12·3·6·9（SF 600 宽体）0.196
  正常宽的 500 / 700 没有能量的截图，按 600 那档同样的差值推的（推断，没核对）。
  改了 FACES 要同步 standby.html 里的 SANS_FACES。
opsz 钉在 144（显示用大字号那档），不让浏览器按字号自动变，否则同一个数字在不同大小下字形不一样。
输出 woff（不是 woff2：本机 Python 没有 brotli，woff 用自带的 zlib，文件只有几 KB，差别可以忽略）。
"""
import io, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

sans_src, rounded_src = sys.argv[1], sys.argv[2]

# 文件名后缀: (Roboto Flex 字重, 宽度下限, 宽度上限)；c=窄 n=正常 w=宽，页面里登记的是 (SF 字重, 宽度范围)
FACES = {
    '500n': (480, 90, 101), '500w': (575, 101, 151),
    '600n': (584, 90, 101), '600w': (707, 101, 151),
    '700c': (535, 25, 90),  '700n': (680, 90, 101),
}

def save_subset(font, out):
    opts = subset.Options()
    opts.flavor = 'woff'
    opts.layout_features = ['tnum', 'lnum', 'kern']
    opts.name_IDs = ['*']          # 保留版权和许可证声明（OFL 要求）
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
    s.populate(unicodes=range(0x30, 0x3B))
    s.subset(font)
    font.flavor = 'woff'
    font.save(out)
    print(out)

for key, (wght, lo, hi) in FACES.items():
    f = instancer.instantiateVariableFont(TTFont(sans_src), {
        'opsz': 144, 'wght': wght, 'wdth': (lo, hi),
        'GRAD': None, 'slnt': None, 'XOPQ': None, 'YOPQ': None, 'XTRA': None,
        'YTUC': None, 'YTLC': None, 'YTAS': None, 'YTDE': None, 'YTFI': None})
    buf = io.BytesIO(); f.save(buf); buf.seek(0)   # 实例化后先存一遍再读回来，直接拿去子集化会报 KeyError: '.notdef'
    save_subset(TTFont(buf), f'fonts/sb-sans-{key}.woff')
r = instancer.instantiateVariableFont(TTFont(rounded_src), {'wght': 742})
buf = io.BytesIO(); r.save(buf); buf.seek(0)
save_subset(TTFont(buf), 'fonts/sb-rounded.woff')
