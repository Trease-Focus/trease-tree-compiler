import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile, unlink } from 'fs/promises';
import { spawn } from 'child_process';
import { existsSync } from 'fs';

// --- Configuration ---
export const SCALE = 4;

export const DEFAULT_CONFIG = {
  tileWidth: 100 * SCALE,
  grassHeight: 15 * SCALE,
  soilHeight: 40 * SCALE,
  gridSize: 1, // Single tile
  canvasWidth: 0,
  canvasHeight: 0,
  fps: 25,
};

// --- Palette ---
export const COLORS = {
  grass: {
    top: '#9FD26A',
    sideLight: '#90C85E',
    sideDark: '#86BC57',
    tuft: '#7FB351',
    gridStroke: '#8EBF5A'
  },
  soil: {
    sideLight: '#6F5448',
    sideDark: '#5F463C',
  }
};

export interface GridPosition {
  gridX: number;
  gridY: number;
  pixelX: number;
  pixelY: number;
}

// --- Helper Functions ---
export function drawPoly(ctx: any, points: {x: number, y: number}[], color: string, strokeColor?: string) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  
  ctx.fillStyle = color;
  ctx.fill();

  ctx.strokeStyle = strokeColor || color;
  ctx.lineWidth = 1 * SCALE;
  ctx.stroke();
}

export function drawShadow(ctx: any, centerX: number, centerY: number, contentWidth?: number) {
  ctx.beginPath();
  const radiusX = contentWidth ? contentWidth / 2 : DEFAULT_CONFIG.tileWidth / 4.5;
  const radiusY = radiusX / 2.5;
  ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(40, 60, 20, 0.066)';
  ctx.fill();
}

export function detectTreeContentPosition(image: any): { xOffset: number, yPadding: number, contentWidth: number } {
  const tempCanvas = createCanvas(image.width, image.height);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(image, 0, 0);
  
  const imageData = tempCtx.getImageData(0, 0, image.width, image.height);
  const data = imageData.data;
  
  const candidateRows: { y: number, darkness: number }[] = [];
  
  for (let y = image.height - 1; y >= 0; y--) {
    let hasPixels = false;
    let totalDarkness = 0;
    let pixelCount = 0;
    
    for (let x = 0; x < image.width; x++) {
      const index = (y * image.width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const alpha = data[index + 3];
      
      if (alpha > 245) {
        hasPixels = true;
        const brightness = r + g + b;
        const darkness = (765 - brightness) * (alpha / 255);
        totalDarkness += darkness;
        pixelCount++;
      }
    }
    
    if (hasPixels && pixelCount > 0) {
      const avgDarkness = totalDarkness / pixelCount;
      candidateRows.push({ y, darkness: avgDarkness });
      
      if (candidateRows.length > image.height * 0.3) break;
    }
  }
  
  if (candidateRows.length === 0) {
    return { xOffset: 0, yPadding: 0, contentWidth: 0 };
  }
  
  let darkestRow = candidateRows[0];
  for (const candidate of candidateRows) {
    if (candidate.darkness > darkestRow.darkness) {
      darkestRow = candidate;
    }
  }
  
  const bottomY = darkestRow.y;
  const yPadding = image.height - bottomY - 1;
  
  let leftmost = image.width;
  let rightmost = -1;
  
  for (let x = 0; x < image.width; x++) {
    const index = (bottomY * image.width + x) * 4;
    const alpha = data[index + 3];
    
    if (alpha > 245) {
      if (x < leftmost) leftmost = x;
      if (x > rightmost) rightmost = x;
    }
  }
  
  const contentCenterX = (leftmost + rightmost) / 2;
  const imageCenterX = image.width / 2;
  const xOffset = contentCenterX - imageCenterX;
  const contentWidth = rightmost - leftmost + 1;
  
  return { xOffset, yPadding, contentWidth };
}

export function drawIsoBlock(ctx: any, pos: GridPosition, hasShadow: boolean, shadowWidth?: number) {
  const { pixelX, pixelY } = pos;
  const w = DEFAULT_CONFIG.tileWidth;
  const h = DEFAULT_CONFIG.tileWidth / 2;

  const topPointY = pixelY - (h / 2);
  const soilY = topPointY + DEFAULT_CONFIG.grassHeight;

  // Right Face (Soil)
  drawPoly(ctx, [
    { x: pixelX, y: soilY + h },
    { x: pixelX + w / 2, y: soilY + h / 2 },
    { x: pixelX + w / 2, y: soilY + h / 2 + DEFAULT_CONFIG.soilHeight },
    { x: pixelX, y: soilY + h + DEFAULT_CONFIG.soilHeight }
  ], COLORS.soil.sideDark);

  // Left Face (Soil)
  drawPoly(ctx, [
    { x: pixelX, y: soilY + h },
    { x: pixelX - w / 2, y: soilY + h / 2 },
    { x: pixelX - w / 2, y: soilY + h / 2 + DEFAULT_CONFIG.soilHeight },
    { x: pixelX, y: soilY + h + DEFAULT_CONFIG.soilHeight }
  ], COLORS.soil.sideLight);

  // Right Face (Grass)
  drawPoly(ctx, [
    { x: pixelX, y: topPointY + h },
    { x: pixelX + w / 2, y: topPointY + h / 2 },
    { x: pixelX + w / 2, y: topPointY + h / 2 + DEFAULT_CONFIG.grassHeight },
    { x: pixelX, y: topPointY + h + DEFAULT_CONFIG.grassHeight }
  ], COLORS.grass.sideDark);

  // Left Face (Grass)
  drawPoly(ctx, [
    { x: pixelX, y: topPointY + h },
    { x: pixelX - w / 2, y: topPointY + h / 2 },
    { x: pixelX - w / 2, y: topPointY + h / 2 + DEFAULT_CONFIG.grassHeight },
    { x: pixelX, y: topPointY + h + DEFAULT_CONFIG.grassHeight }
  ], COLORS.grass.sideLight);

  // Top Face
  const topVerts = [
    { x: pixelX, y: topPointY },
    { x: pixelX + w / 2, y: topPointY + h / 2 },
    { x: pixelX, y: topPointY + h },
    { x: pixelX - w / 2, y: topPointY + h / 2 }
  ];
  drawPoly(ctx, topVerts, COLORS.grass.top, COLORS.grass.gridStroke);

  if (hasShadow) {
    drawShadow(ctx, pixelX, pixelY, shadowWidth);
  }
}

function spawnFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Running: ffmpeg ${args.join(' ')}`);
    const proc = spawn('ffmpeg', args);
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

export async function generateGridVideo(
  treePngPath: string,
  treeWebmPath: string,
  outputPath: string,
  treeScale: number = 0.5
): Promise<void> {
  console.log('Loading cedar.png for anchor calculation...');
  const anchorImage = await loadImage(treePngPath);
  const offsets = detectTreeContentPosition(anchorImage);
  console.log(`Detected offsets - xOffset: ${offsets.xOffset.toFixed(1)}px, yPadding: ${offsets.yPadding}px, contentWidth: ${offsets.contentWidth}px`);

  // Calculate canvas size for single tile
  const totalGridWidth = 2 * (DEFAULT_CONFIG.tileWidth / 2);
  const calculatedWidth = totalGridWidth + (100 * SCALE);
  const calculatedHeight = (DEFAULT_CONFIG.tileWidth / 2) + (DEFAULT_CONFIG.soilHeight + DEFAULT_CONFIG.grassHeight) * 2 + (200 * SCALE);
  const canvasSize = Math.max(calculatedWidth, calculatedHeight);
  DEFAULT_CONFIG.canvasWidth = canvasSize;
  DEFAULT_CONFIG.canvasHeight = canvasSize;

  const startX = DEFAULT_CONFIG.canvasWidth / 2;
  const startY = 150 * SCALE;

  // Single tile position
  const pos: GridPosition = {
    gridX: 0,
    gridY: 0,
    pixelX: Math.round(startX),
    pixelY: Math.round(startY + DEFAULT_CONFIG.tileWidth / 4)
  };

  // Calculate tree placement
  const drawWidth = anchorImage.width * treeScale;
  const drawHeight = anchorImage.height * treeScale;
  const xOffsetScaled = offsets.xOffset * treeScale;
  const yPaddingScaled = offsets.yPadding * treeScale;
  const treeX = pos.pixelX - (drawWidth / 2) - xOffsetScaled;
  const treeY = pos.pixelY - drawHeight + yPaddingScaled;
  const shadowWidth = offsets.contentWidth * treeScale;

  console.log('Generating base grid image...');
  const canvas = createCanvas(DEFAULT_CONFIG.canvasWidth, DEFAULT_CONFIG.canvasHeight);
  const ctx = canvas.getContext('2d');
  
  // Draw the grid tile with shadow
  drawIsoBlock(ctx, pos, true, shadowWidth);
  
  const baseGridPath = 'temp_base_grid.png';
  const buffer = await canvas.encode('png');
  await writeFile(baseGridPath, buffer);
  console.log(`✅ Base grid saved: ${baseGridPath}`);

  console.log('Compositing video with ffmpeg...');
  
  // FFmpeg command to overlay cedar.webm on base grid
// Loop the static grid image to match the video duration
const ffmpegArgs = [
    '-loop', '1',                 // Loop the base grid image
    '-i', baseGridPath,           // Base grid image
    '-c:v', 'libvpx-vp9',         // Decode with VP9
    '-i', treeWebmPath,          // Cedar video (transparent)
    '-filter_complex',
    `color=c=#FFFFFF:s=${DEFAULT_CONFIG.canvasWidth}x${DEFAULT_CONFIG.canvasHeight}:r=${DEFAULT_CONFIG.fps}[bg];` +
    `[1:v]scale=${Math.round(drawWidth)}:${Math.round(drawHeight)}:flags=lanczos,format=yuva420p[scaled];` +
    `[0:v]format=yuva420p[base];` +
    `[bg][base]overlay=0:0:shortest=1[withgrid];` +
    `[withgrid][scaled]overlay=${Math.round(treeX)}:${Math.round(treeY)}:shortest=1[out]`,
    '-map', '[out]',
    '-c:v', 'libvpx-vp9',         // VP9 codec for webm
    '-b:v', '0',                  // Variable bitrate mode
    '-crf', '30',                 // Quality (lower = better)
    '-deadline', 'realtime',      // Fastest encoding
    '-cpu-used', '8',             // Max speed (0-8, higher = faster)
    '-row-mt', '1',               // Enable row-based multithreading
    '-r', String(DEFAULT_CONFIG.fps),
    '-pix_fmt', 'yuv420p',        // Pixel format without transparency
    '-y',                         // Overwrite output
    outputPath
];

  await spawnFFmpeg(ffmpegArgs);
  
  // Cleanup temp file
  if (existsSync(baseGridPath)) {
    await unlink(baseGridPath);
    console.log('Cleaned up temp files');
  }

  console.log(`✅ Video generated: ${outputPath}`);
}

// --- Main Execution ---
async function main() {
  const cedarPngPath = 'maple.png';
  const cedarWebmPath = 'maple.webm';
  const outputPath = 'maple_on_grid.webm';
  const treeScale = 0.8; // Adjust as needed

  await generateGridVideo(cedarPngPath, cedarWebmPath, outputPath, treeScale);
}

if (require.main === module) {
  main().catch(console.error);
}