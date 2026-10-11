# アプリアイコンを作る（方眼の上の三角形と角度の弧）。python tools/make_icons.py（Pillow が必要）
import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'icons'
BG, GRID, WHITE, CALC = (31, 95, 107), (52, 118, 130), (255, 255, 255), (240, 160, 122)

def draw(size, maskable=False):
    s = 4 * size  # 4 倍で描いて縮小（縁を滑らかにする）
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle([0, 0, s, s], fill=BG)
        k = 0.72  # 円形に切り抜かれても収まる大きさ
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.2, fill=BG)
        k = 1.0
    c = s / 2
    # 方眼
    step = s / 8
    for i in range(1, 8):
        d.line([i * step, 0, i * step, s], fill=GRID, width=max(1, s // 256))
        d.line([0, i * step, s, i * step], fill=GRID, width=max(1, s // 256))
    if not maskable:
        # 角丸の外にはみ出た方眼を消す
        mask = Image.new('L', (s, s), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.2, fill=255)
        im.putalpha(mask)
        d = ImageDraw.Draw(im)
    w = round(s * 0.045 * k)
    B = (c - s * 0.30 * k, c + s * 0.22 * k)
    C = (c + s * 0.32 * k, c + s * 0.22 * k)
    A = (c - s * 0.08 * k, c - s * 0.30 * k)
    d.polygon([A, B, C], outline=None, fill=(64, 128, 139))
    d.line([A, B, C, A], fill=WHITE, width=w, joint='curve')
    # 角 B の弧（計算した値の色）
    r = s * 0.13 * k
    a1 = math.degrees(math.atan2(A[1] - B[1], A[0] - B[0]))
    d.arc([B[0] - r, B[1] - r, B[0] + r, B[1] + r], start=a1, end=0, fill=CALC, width=round(w * 0.9))
    for p in (A, B, C):
        q = w * 0.9
        d.ellipse([p[0] - q, p[1] - q, p[0] + q, p[1] + q], fill=WHITE)
    return im.resize((size, size), Image.LANCZOS)

OUT.mkdir(exist_ok=True)
draw(512).save(OUT / 'icon-512.png')
draw(192).save(OUT / 'icon-192.png')
draw(512, maskable=True).save(OUT / 'icon-maskable-512.png')
im = draw(180)
bg = Image.new('RGBA', im.size, BG + (255,)); bg.alpha_composite(im); bg.convert('RGB').save(OUT / 'apple-touch-icon.png')
print('icons/ に保存しました')
