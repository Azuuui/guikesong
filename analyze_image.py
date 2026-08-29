#!/usr/bin/env python3
"""读取图片，转为 base64 data URL，并分析颜色分布"""
import base64
from PIL import Image
from collections import Counter

IMG_PATH = "/Users/azu/.trae-cn/attachments/6a928ac70f39f5f47171610e/c8430213-7996-494e-aa8d-8294288d2261_a0f07bf0-3893-4ae2-b87d-b37a1a62a883_025282d772630795654cd24f4b201439.png"

COLORS = [
    ("红", (212, 53, 28)),
    ("黑", (26, 26, 26)),
    ("棕", (121, 85, 72)),
    ("黄", (255, 213, 0)),
    ("绿", (46, 125, 50)),
]

def classify_pixel(r, g, b):
    brightness = (r + g + b) / 3
    max_c = max(r, g, b)
    min_c = min(r, g, b)
    saturation = (max_c - min_c) / max_c if max_c > 0 else 0
    if brightness > 230 and saturation < 0.08:
        return None
    best = None
    best_dist = float('inf')
    for name, (cr, cg, cb) in COLORS:
        dist = (r-cr)**2 + (g-cg)**2 + (b-cb)**2
        if dist < best_dist:
            best_dist = dist
            best = name
    return best

img = Image.open(IMG_PATH).convert("RGB")
w, h = img.size
print(f"图片尺寸: {w}x{h}")

pixels = img.load()
color_counts = Counter()
total = 0
for y in range(0, h, 4):
    for x in range(0, w, 4):
        r, g, b = pixels[x, y]
        c = classify_pixel(r, g, b)
        color_counts[c or "白色"] += 1
        total += 1

print(f"\n颜色分布（采样 {total} 像素）:")
for color, count in color_counts.most_common():
    pct = count / total * 100
    print(f"  {color}: {count} ({pct:.1f}%)")

with open(IMG_PATH, "rb") as f:
    b64 = base64.b64encode(f.read()).decode()
    data_url = f"data:image/png;base64,{b64}"

print(f"\nbase64 长度: {len(data_url)}")

with open("/Users/azu/Documents/guikesong/image_data_url.txt", "w") as f:
    f.write(data_url)
print("data URL 已写入 image_data_url.txt")
