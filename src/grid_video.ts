import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile, unlink } from 'fs/promises';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import {
  SCALE,
  GRID_CONFIG,
  detectTreeContentPosition,
  drawIsoBlock,
  calculateCanvasDimensions,
  calculateTreeDrawPosition,
} from './core/grid';
import type { GridPosition } from './core/grid';

// Re-export for backwards compatibility
export { SCALE, GRID_CONFIG as DEFAULT_CONFIG };
export type { GridPosition };

const VIDEO_CONFIG = {
  fps: 25,
};

function spawnFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Running: ffmpeg ${args.join(' ')}`);
    const proc: ChildProcess = spawn('ffmpeg', args);
    
    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
    
    proc.on('error', (err: Error) => {
      reject(err);
    });
  });
}

export async function generateGridVideo(
  treePngPath: string,
  treeWebmPath: string,
  outputPath: string,
  treeScale: number = 1
): Promise<void> {
  console.log('Loading tree image for anchor calculation...');
  const anchorImage = await loadImage(treePngPath);
  const offsets = detectTreeContentPosition(anchorImage);
  console.log(`Detected offsets - xOffset: ${offsets.xOffset.toFixed(1)}px, yPadding: ${offsets.yPadding}px, contentWidth: ${offsets.contentWidth}px`);

  // Calculate canvas size for single tile using shared function
  const dimensions = calculateCanvasDimensions(1);
  GRID_CONFIG.gridSize = 1;
  GRID_CONFIG.canvasWidth = dimensions.width;
  GRID_CONFIG.canvasHeight = dimensions.height;

  const startX = GRID_CONFIG.canvasWidth / 2;
  const startY = 150 * SCALE;

  // Single tile position
  const pos: GridPosition = {
    gridX: 0,
    gridY: 0,
    pixelX: Math.round(startX),
    pixelY: Math.round(startY + GRID_CONFIG.tileWidth / 4)
  };

  // Calculate tree placement using shared function
  const { drawX: treeX, drawY: treeY, drawWidth, drawHeight } = calculateTreeDrawPosition(
    pos, anchorImage.width, anchorImage.height, offsets, treeScale
  );
  const shadowWidth = offsets.contentWidth * treeScale;

  console.log('Generating base grid image...');
  const canvas = createCanvas(GRID_CONFIG.canvasWidth, GRID_CONFIG.canvasHeight);
  const ctx = canvas.getContext('2d');
  
  // Draw the grid tile with shadow
  drawIsoBlock(ctx, pos, { hasShadow: true, shadowWidth });
  
  const baseGridPath = 'temp_base_grid.png';
  const buffer = await canvas.encode('png');
  await writeFile(baseGridPath, buffer);
  console.log(`✅ Base grid saved: ${baseGridPath}`);

  console.log('Compositing video with ffmpeg...');
  
  // FFmpeg command to overlay tree video on base grid
  const ffmpegArgs = [
    '-loop', '1',                 // Loop the base grid image
    '-i', baseGridPath,           // Base grid image
    '-c:v', 'libvpx-vp9',         // Decode with VP9
    '-i', treeWebmPath,           // Tree video (transparent)
    '-filter_complex',
    `color=c=#FFFFFF:s=${GRID_CONFIG.canvasWidth}x${GRID_CONFIG.canvasHeight}:r=${VIDEO_CONFIG.fps}[bg];` +
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
    '-r', String(VIDEO_CONFIG.fps),
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

async function main() {
  const cedarPngPath = 'maple.png';
  const cedarWebmPath = 'maple.webm';
  const outputPath = 'maple_on_grid.webm';
  const treeScale = 1; // Adjust as needed

  await generateGridVideo(cedarPngPath, cedarWebmPath, outputPath, treeScale);
}

if (require.main === module) {
  main().catch(console.error);
}