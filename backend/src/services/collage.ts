import sharp from 'sharp';

const CELL_WIDTH = 768;
const CELL_HEIGHT = 1024;
const GAP = 24;

export interface CollageInput {
  bytes: Buffer;
}

/**
 * 2×2 白底总览拼图：四张图等比缩放到统一单元格、居中排布、白色间距。
 * 只做图片拼接，不绘制标题、文字或水印。
 */
export async function createOverviewCollage(images: readonly CollageInput[]): Promise<Buffer> {
  const width = CELL_WIDTH * 2 + GAP * 3;
  const height = CELL_HEIGHT * 2 + GAP * 3;
  const composites: Array<{input: Buffer; left: number; top: number}> = [];

  for (let index = 0; index < Math.min(images.length, 4); index += 1) {
    const resized = await sharp(images[index]!.bytes)
      .resize(CELL_WIDTH, CELL_HEIGHT, {fit: 'inside'})
      .png()
      .toBuffer();
    const meta = await sharp(resized).metadata();
    const cellWidth = meta.width ?? CELL_WIDTH;
    const cellHeight = meta.height ?? CELL_HEIGHT;
    const column = index % 2;
    const row = Math.floor(index / 2);
    composites.push({
      input: resized,
      left: GAP + column * (CELL_WIDTH + GAP) + Math.floor((CELL_WIDTH - cellWidth) / 2),
      top: GAP + row * (CELL_HEIGHT + GAP) + Math.floor((CELL_HEIGHT - cellHeight) / 2),
    });
  }

  return sharp({
    create: {width, height, channels: 3, background: {r: 255, g: 255, b: 255}},
  })
    .composite(composites)
    .png()
    .toBuffer();
}
