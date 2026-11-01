# 生成电脑桌面用的图标 icons/icon-any-*.png：不重画，从 icons/icon-512.png（铺满版）裁出放大，再加透明边和圆角。
# 留白、圆角比例取自同一台电脑上 Chrome 自动生成的图标（MD Reader 等），这样摆在一起一样大。
# icon-192/512（铺满版）留给 iPhone、安卓 maskable：那些平台自己裁形状，不能带透明边。
# 用法：python tools/build-icons.py <留白比例> <圆角比例>
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
margin, radius = float(sys.argv[1]), float(sys.argv[2])
CROP = (22, 22, 490, 490)   # 数字卡片在原图 x 60–452，裁掉外圈黑边后卡片占圆角块约 84%，缩小后数字仍看得清
art = Image.open(ROOT / 'icons/icon-512.png').convert('RGBA').crop(CROP)
S = 4   # 超采样，圆角边缘才平滑
for size in (192, 512):
    big = size * S
    tile = round(big * (1 - 2 * margin))
    m = (big - tile) // 2
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((m, m, m + tile - 1, m + tile - 1), radius=round(tile * radius), fill=255)
    canvas = Image.new('RGBA', (big, big), (0, 0, 0, 255))
    canvas.paste(art.resize((tile, tile), Image.LANCZOS), (m, m))
    canvas.putalpha(mask)
    canvas.reduce(S).save(ROOT / f'icons/icon-any-{size}.png', optimize=True)
