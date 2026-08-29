#!/usr/bin/env python3
"""
生成彩色粒子流动 → 多图错峰显影的 HTML demo
把所有图片转 base64 嵌入，JS 端做颜色分类和显影
"""
import base64
import os

OUTPUT = "/Users/azu/Documents/guikesong/particle-reveal-demo.html"
ATTACH = "/Users/azu/.trae-cn/attachments/6a928ac70f39f5f47171610e"

# 所有图片路径
IMG_FILES = [
    "c8430213-7996-494e-aa8d-8294288d2261_a0f07bf0-3893-4ae2-b87d-b37a1a62a883_025282d772630795654cd24f4b201439.png",
    "56b9da3b-a616-48e1-8f3f-3d0b61af2397_e6698198-2fb3-45ae-9a0e-c3a41a2c31b9_433e69c10d242c8b6d7a2907ffb19f27.png",
    "382cbf48-850a-40bb-b96b-1bc2ba7a4022_7bbd8262-ac71-4ef5-90ad-75a3a329926a_36bf37e6c8bdba96b2dfcdf3bc79e320.jpg",
    "ebd1fdfd-9e78-4a78-81f7-e0e1828627c3_55f9bfd9-fa86-4f90-9b2a-d3574000f65d_2d226f08c2a470f6677d48db492acd25.png",
    "530d87a8-f51c-46ff-8c7a-da19cfbaea4d_ccb94c47-0562-4bbc-9c6a-a62ebe158f1a_08276c889eb3a0a6c243a0334fef7f5e.png",
    "a8ada07f-0dbe-4e2c-8737-1add101a0498_785329c4-135c-444a-b863-e30652d33b67_456743339915e9df82e4b910b684dfa1.png",
    "edeae591-87df-4da4-90bd-c44501bb7f2b_70dbbd1e-3e7d-4bad-972e-3a91e6ea3220_1f7000fb6af0eea3b74632d9d357f8c6.png",
    "e8885daa-4574-4652-9695-e1a823297106_db4b1fdd-4c02-45d5-816e-244dd56a085a_5891daa99f81c91c37338b8670fc4596.png",
    "fd2aec6a-ba84-4e7b-a01b-6d13927f98e8_8475e48b-f556-4549-8219-20be25489fab_e9bed623bf265e8ee830e56912ff62e9.png",
    "77887a9a-f86f-47b8-8607-fdd39478a6d0_e463f714-a879-4c8f-a84f-195603e93505_33485eeba6eeac1502bc114fcc95f07a.png",
]

# 转换所有图片为 base64 data URL
data_urls = []
for fname in IMG_FILES:
    fpath = os.path.join(ATTACH, fname)
    ext = fname.split('.')[-1].lower()
    mime = "image/jpeg" if ext in ("jpg", "jpeg") else "image/png"
    with open(fpath, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
        data_urls.append(f'data:{mime};base64,{b64}')
    print(f"  {fname[:40]}... -> {len(b64)} bytes")

# 构建 JS 数组
js_array = ",\n".join(f'    "{du}"' for du in data_urls)

HTML = '''<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>彩色粒子流动 → 多图显影</title>
<style>
  html, body {
    margin: 0; padding: 0; height: 100%; overflow: hidden;
    background: #fafafa;
  }
  canvas { display: block; position: fixed; inset: 0; }
  #title {
    position: fixed; top: 16px; left: 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px; letter-spacing: 0.04em; color: #bbb;
    pointer-events: none; user-select: none; z-index: 10;
  }
</style>
</head>
<body>
<div id="title">彩色粒子流动 → 多图错峰显影</div>
<canvas id="c"></canvas>
<script>
(function () {
  "use strict";

  // ========= 图片数据 =========
  const IMG_URLS = [
__IMG_URLS__
  ];

  // ========= 配置 =========
  const CELL = 7;
  const DOT_R = 2.4;

  // 五种颜色
  const COLORS = [
    [212, 53, 28],   // 红 #D4351C
    [26, 26, 26],    // 黑 #1A1A1A
    [121, 85, 72],   // 棕 #795548
    [255, 213, 0],   // 黄 #FFD500
    [46, 125, 50],   // 绿 #2E7D32
  ];
  const NC = COLORS.length;

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  let W = 0, H = 0, dpr = 1;
  let cols = 0, rows = 0;
  let gridR, gridG, gridB, gridA;
  let particles = [];
  let imageRegions = [];
  let cellRegionMap = null;
  let loadedImages = [];
  let imagesReady = false;

  // ========= 颜色分类 =========
  function classifyPixel(r, g, b) {
    const brightness = (r + g + b) / 3;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
    if (brightness > 225 && sat < 0.10) return -1; // 白色
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < NC; i++) {
      const dr = r - COLORS[i][0];
      const dg = g - COLORS[i][1];
      const db = b - COLORS[i][2];
      const d = dr*dr + dg*dg + db*db;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  // ========= 图片加载 =========
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  // ========= 构建图片区域 =========
  function buildImageRegion(img, regionW, regionH, x0, y0, phaseOffset) {
    const off = document.createElement("canvas");
    off.width = regionW;
    off.height = regionH;
    const octx = off.getContext("2d");
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, regionW, regionH);
    const scale = Math.min(regionW / img.width, regionH / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (regionW - dw) / 2;
    const dy = (regionH - dh) / 2;
    octx.drawImage(img, dx, dy, dw, dh);

    const data = octx.getImageData(0, 0, regionW, regionH).data;

    const gx0 = Math.floor(x0 / CELL);
    const gy0 = Math.floor(y0 / CELL);
    const gw = Math.ceil(regionW / CELL);
    const gh = Math.ceil(regionH / CELL);

    const colorGrid = new Int8Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const px = Math.min(gx * CELL + (CELL >> 1), regionW - 1);
        const py = Math.min(gy * CELL + (CELL >> 1), regionH - 1);
        const idx = (py * regionW + px) * 4;
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        colorGrid[gy * gw + gx] = classifyPixel(r, g, b);
      }
    }

    return {
      gx0, gy0, gw, gh, colorGrid,
      phaseOffset,
      FLOW: 4.0 + Math.random() * 2.0,
      RIN: 1.2,
      HOLD: 1.5 + Math.random() * 0.5,
      ROUT: 1.2,
    };
  }

  function easeInOut(p) {
    return p < 0.5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2;
  }

  function getRegionReveal(region, t) {
    const cyc = region.FLOW + region.RIN + region.HOLD + region.ROUT;
    const lt = (t + region.phaseOffset) % cyc;
    if (lt < region.FLOW) return 0;
    if (lt < region.FLOW + region.RIN) return easeInOut((lt - region.FLOW) / region.RIN);
    if (lt < region.FLOW + region.RIN + region.HOLD) return 1;
    return easeInOut(1 - (lt - (region.FLOW + region.RIN + region.HOLD)) / region.ROUT);
  }

  // ========= 格子与粒子初始化 =========
  function initGrid() {
    cols = Math.ceil(W / CELL);
    rows = Math.ceil(H / CELL);
    const n = cols * rows;
    gridR = new Uint8Array(n);
    gridG = new Uint8Array(n);
    gridB = new Uint8Array(n);
    gridA = new Float32Array(n);
  }

  function initParticles() {
    particles = [];
    for (let r = 0; r < rows; r++) {
      const count = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let j = 0; j < count; j++) {
        particles.push({
          row: r,
          x: Math.random() * cols,
          speed: 0.10 + Math.random() * 0.35,
          ci: (Math.random() * NC) | 0,
        });
      }
    }
  }

  // ========= 构建格子→区域映射 =========
  function buildCellRegionMap() {
    cellRegionMap = new Int32Array(cols * rows).fill(-1);
    for (let ri = 0; ri < imageRegions.length; ri++) {
      const reg = imageRegions[ri];
      for (let gy = Math.max(0, reg.gy0); gy < Math.min(rows, reg.gy0 + reg.gh); gy++) {
        for (let gx = Math.max(0, reg.gx0); gx < Math.min(cols, reg.gx0 + reg.gw); gx++) {
          cellRegionMap[gy * cols + gx] = ri;
        }
      }
    }
  }

  // ========= 随机放置多张图片（不重叠）=========
  // 同时最多 3 张显影：把 10 张图分成多轮，每轮 3 张，错峰排列
  // 每张图的 phaseOffset 按轮次 + 组内偏移分配，确保任意 3s 窗口内最多 3 张在显影
  function placeImages() {
    imageRegions = [];
    const screenArea = W * H;
    const placedRects = [];

    // 每张图占画面 8% - 18%（适当扩大）
    const PER_GROUP = 3;       // 同时最多 3 张
    const CYCLE_TIME = 9;      // 每轮 9 秒（flow 4-6s + reveal 3-4s），保证错开
    const GROUP_STAGGER = 3;   // 组内每张错开 3 秒

    // 打乱图片顺序
    const indices = loadedImages.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
    }

    for (let idx = 0; idx < indices.length; idx++) {
      const img = loadedImages[indices[idx]];
      const aspect = img.width / img.height;

      // 随机面积：10% - 40%
      const targetArea = screenArea * (0.10 + Math.random() * 0.30);
      let regionH = Math.sqrt(targetArea / aspect);
      let regionW = regionH * aspect;

      // 尝试在不重叠的位置放置
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 50) {
        const x0 = Math.random() * (W - regionW - 20) + 10;
        const y0 = Math.random() * (H - regionH - 20) + 10;

        let overlap = false;
        for (const rect of placedRects) {
          if (x0 < rect.x + rect.w + 30 &&
              x0 + regionW + 30 > rect.x &&
              y0 < rect.y + rect.h + 30 &&
              y0 + regionH + 30 > rect.y) {
            overlap = true;
            break;
          }
        }

        if (!overlap) {
          const rw = Math.ceil(regionW);
          const rh = Math.ceil(regionH);
          // 计算 phaseOffset：第 idx 张 → 轮次 = floor(idx/3)，组内位置 = idx%3
          const round = Math.floor(idx / PER_GROUP);
          const inGroup = idx % PER_GROUP;
          const phaseOffset = round * CYCLE_TIME + inGroup * GROUP_STAGGER;
          const reg = buildImageRegion(img, rw, rh, x0, y0, phaseOffset);
          imageRegions.push(reg);
          placedRects.push({ x: x0, y: y0, w: rw, h: rh });
          placed = true;
        }
        attempts++;
      }

      // 放不下时缩小
      if (!placed) {
        const smW = Math.ceil(regionW * 0.6);
        const smH = Math.ceil(regionH * 0.6);
        const x0 = Math.random() * (W - smW - 20) + 10;
        const y0 = Math.random() * (H - smH - 20) + 10;
        const round = Math.floor(idx / PER_GROUP);
        const inGroup = idx % PER_GROUP;
        const phaseOffset = round * CYCLE_TIME + inGroup * GROUP_STAGGER;
        const reg = buildImageRegion(img, smW, smH, x0, y0, phaseOffset);
        imageRegions.push(reg);
        placedRects.push({ x: x0, y: y0, w: smW, h: smH });
      }
    }
    buildCellRegionMap();
  }

  // ========= 渲染 =========
  let last = performance.now();
  let globalTime = 0;

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    globalTime += dt;

    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, W, H);

    // 格子衰减
    const baseFade = 0.018;
    const reveals = imagesReady ? imageRegions.map(reg => getRegionReveal(reg, globalTime)) : [];

    for (let gy = 0; gy < rows; gy++) {
      const rowStart = gy * cols;
      for (let gx = 0; gx < cols; gx++) {
        const idx = rowStart + gx;
        if (gridA[idx] <= 0) continue;

        let fade = baseFade;
        if (imagesReady && cellRegionMap) {
          const ri = cellRegionMap[idx];
          if (ri >= 0) {
            const reg = imageRegions[ri];
            const reveal = reveals[ri];
            if (reveal > 0) {
              const lgx = gx - reg.gx0;
              const lgy = gy - reg.gy0;
              const colorIdx = reg.colorGrid[lgy * reg.gw + lgx];
              if (colorIdx >= 0) {
                fade = baseFade * (1 - reveal * 0.96);
              }
            }
          }
        }
        gridA[idx] -= fade;
        if (gridA[idx] < 0) gridA[idx] = 0;
      }
    }

    // 粒子更新
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.speed;
      if (p.x >= cols) p.x -= cols;

      const col = p.x | 0;
      const idx = p.row * cols + col;
      if (idx < 0 || idx >= gridA.length) continue;

      gridR[idx] = COLORS[p.ci][0];
      gridG[idx] = COLORS[p.ci][1];
      gridB[idx] = COLORS[p.ci][2];
      gridA[idx] = 1;
    }

    // 渲染格子
    for (let gy = 0; gy < rows; gy++) {
      const rowStart = gy * cols;
      const cy = gy * CELL + (CELL >> 1);
      for (let gx = 0; gx < cols; gx++) {
        const idx = rowStart + gx;
        const a = gridA[idx];
        if (a <= 0.02) continue;

        const r = 255 + (gridR[idx] - 255) * a;
        const g = 255 + (gridG[idx] - 255) * a;
        const b = 255 + (gridB[idx] - 255) * a;
        const cx = gx * CELL + (CELL >> 1);
        const radius = DOT_R * (0.5 + a * 0.7);

        ctx.fillStyle = "rgb(" + (r|0) + "," + (g|0) + "," + (b|0) + ")";
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    requestAnimationFrame(frame);
  }

  // ========= 初始化 =========
  async function setup() {
    initGrid();
    initParticles();

    // 加载所有图片
    if (!imagesReady) {
      loadedImages = [];
      for (let i = 0; i < IMG_URLS.length; i++) {
        try {
          const img = await loadImage(IMG_URLS[i]);
          loadedImages.push(img);
          console.log("加载图片 " + (i+1) + ": " + img.width + "x" + img.height);
        } catch (e) {
          console.error("图片加载失败: " + i);
        }
      }
      imagesReady = true;
    }

    placeImages();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(W * dpr));
    canvas.height = Math.max(1, Math.floor(H * dpr));
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    setup();
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 200);
  });

  resize();
  requestAnimationFrame(frame);
})();
</script>
</body>
</html>
'''

html = HTML.replace("__IMG_URLS__", js_array)

with open(OUTPUT, "w") as f:
    f.write(html)

print(f"\n已生成: {OUTPUT}")
print(f"文件大小: {len(html)} 字节 ({len(html)/1024:.1f} KB)")
print(f"嵌入图片数: {len(data_urls)}")
