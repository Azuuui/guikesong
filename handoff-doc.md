# Codex 交接说明：彩色粒子流动 → 多图错峰显影

## 项目概述

这是一个基于 HTML5 Canvas 的粒子动画效果。满屏的彩色圆点（红/黑/棕/黄/绿）始终从左往右流动，每个粒子严格沿水平线运动。流动过程中，页面随机区域的粒子墨迹会周期性地组合出预埋的彩色图片（民族风插画），显影后继续流动散开，循环往复。

## 文件结构

| 文件 | 用途 |
|------|------|
| `particle-reveal-demo.html` | 最终交付物，单文件 HTML，可直接用浏览器打开。10 张图片以 base64 嵌入，无外部依赖 |
| `generate_demo.py` | 构建脚本，读取原始图片 → 转 base64 → 生成 `particle-reveal-demo.html` |
| `analyze_image.py` | 辅助分析脚本，分析图片颜色分布（可忽略） |
| `image_data_url.txt` | 单张图片的 base64 数据（中间产物，可忽略） |

## 技术架构

### 核心数据结构

1. **网格系统** — 整个画布按 `CELL=7px` 间距划分为 cols×rows 的格子。每个格子存 4 个值：
   - `gridR[idx]` / `gridG[idx]` / `gridB[idx]`（Uint8Array）— 最后经过该格子的粒子颜色 RGB
   - `gridA[idx]`（Float32Array）— 墨迹浓度，0=白（无墨）1=满色

2. **粒子系统** — 每行 2-3 个粒子，共约 rows×2.5 个。每个粒子：
   - `row` — 固定行号，不上下移动
   - `x` — 水平位置（浮点），每帧 `x += speed`
   - `speed` — 0.10~0.45 格/帧，随机
   - `ci` — 颜色索引（0-4 对应红黑棕黄绿），随机分配，不变
   - 超出右边界回绕到左边（`if x >= cols: x -= cols`）

3. **图片区域** — 10 张图片，每张构建一个 `imageRegion` 对象：
   - `gx0, gy0, gw, gh` — 在格子坐标系中的位置和大小
   - `colorGrid`（Int8Array）— 该区域内每个格子的颜色索引（-1=白色不显影，0-4=五色）
   - `phaseOffset` — 错峰偏移量（秒）
   - `FLOW/RIN/HOLD/ROUT` — 显影周期参数

4. **格子→区域映射** — `cellRegionMap`（Int32Array），每个格子指向它所属的 imageRegion 索引，-1 表示不属于任何图片区域。

### 颜色定义

```
红 #D4351C  (212, 53, 28)
黑 #1A1A1A  (26, 26, 26)
棕 #795548  (121, 85, 72)
黄 #FFD500  (255, 213, 0)
绿 #2E7D32  (46, 125, 50)
```

### 颜色分类算法（classifyPixel）

每个像素按 RGB 空间欧氏距离归类到最近的颜色：
- 白色检测：亮度 > 225 且饱和度 < 0.10 → 返回 -1（无色，不参与显影）
- 否则计算到 5 种颜色的距离 `(Δr² + Δg² + Δb²)`，取最近的

### 显影机制

**不是粒子停下来组成图像，而是通过衰减速度差异实现：**

1. 每帧所有格子 alpha 衰减：`gridA -= baseFade (0.018)`
2. 粒子经过的格子设为满色：`gridA = 1`
3. 显影阶段，图片区域内有颜色的格子（colorIdx ≥ 0）衰减速度降为 `baseFade × (1 - reveal × 0.96)`，即几乎不衰减
4. 效果：粒子持续流动不断留墨，显影区域的墨迹因衰减极慢而自然积累，逐渐显出图像；非显影区域墨迹正常衰减消失

### 显影周期

每张图独立的循环周期：

```
FLOW (4-6s) → RIN (1.2s) → HOLD (1.5-2s) → ROUT (1.2s) → 重复
```

- `getReveal(t)` 返回 0~1 的显影强度，用 easeInOut 缓动
- `reveal=0`：纯流动，所有格子正常衰减
- `reveal=1`：显影区域几乎不衰减，墨迹充分积累

### 错峰时序

10 张图分 4 轮（3+3+3+1），每轮 9 秒，组内每张错开 3 秒：

```
轮1: 图A(0s)  图B(3s)  图C(6s)
轮2: 图D(9s)  图E(12s) 图F(15s)
轮3: 图G(18s) 图H(21s) 图I(24s)
轮4: 图J(27s)
```

确保任意 3 秒窗口内最多 3 张图在显影阶段。

### 图片放置

- 10 张图随机打乱顺序
- 每张占画面 10%-40% 面积（随机）
- 不重叠放置（50 次尝试），放不下时缩小到 60% 再放
- 每次刷新页面位置不同

### 图片来源

10 张民族风插画（芦笙舞者等），白底 + 红/黑/棕/黄/绿五色。原始文件在：
`/Users/azu/.trae-cn/attachments/6a928ac70f39f5f47171610e/` 下的 10 个文件（见 `generate_demo.py` 中的 `IMG_FILES` 列表）。

## 关键参数速查

| 参数 | 值 | 位置 | 说明 |
|------|-----|------|------|
| `CELL` | 7 | JS | 格子间距（px） |
| `DOT_R` | 2.4 | JS | 圆点基础半径 |
| `baseFade` | 0.018 | JS frame() | 每帧墨迹衰减量 |
| 衰减系数 | `1 - reveal × 0.96` | JS frame() | 显影区域衰减倍率 |
| 粒子数/行 | 2-3 | JS initParticles() | 每行粒子数 |
| 粒子速度 | 0.10-0.45 | JS initParticles() | 格/帧 |
| 图片面积 | 10%-40% | JS placeImages() | 占画面比例 |
| 同时显影上限 | 3 | JS placeImages() | 3 秒内最多 3 张 |
| `FLOW` | 4-6s | buildImageRegion() | 流动阶段时长 |
| `RIN` | 1.2s | buildImageRegion() | 显入时长 |
| `HOLD` | 1.5-2s | buildImageRegion() | 保持时长 |
| `ROUT` | 1.2s | buildImageRegion() | 显出时长 |
| `CYCLE_TIME` | 9s | placeImages() | 每轮时长 |
| `GROUP_STAGGER` | 3s | placeImages() | 组内错峰 |

## 重新构建

如需修改图片或参数：

```bash
# 1. 修改 generate_demo.py 中的参数或 IMG_FILES 列表
# 2. 重新生成
python3 /Users/azu/Documents/guikesong/generate_demo.py
# 3. 输出: particle-reveal-demo.html
```

## 性能说明

- 1920×1080 屏幕约 42,000 个格子，每帧遍历 3 次（衰减 + 粒子 + 渲染）
- 粒子约 600-900 个
- 60fps 下 CPU 占用中等，主要瓶颈在格子遍历和 canvas arc 绘制
- 如需优化：可用 OffscreenCanvas + Worker，或改用 WebGL 点渲染

## 已知限制

1. 图片以 base64 嵌入 HTML，文件约 1.1MB，首次加载有延迟
2. resize 时重新随机放置图片（因为位置是随机的）
3. 颜色分类用简单最近距离，抗锯齿边缘像素可能误分类
4. 大图（40%面积）可能与已放置图重叠时被缩小到 60%
