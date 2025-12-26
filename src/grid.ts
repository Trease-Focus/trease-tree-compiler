import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile, readFile } from 'fs/promises';

// --- Configuration ---
export const SCALE = 4; // 4x Resolution for high-quality (Retina) output

export interface TreeConfig {
  imagePath: string;
  gridX: number;
  gridY: number;
  scale: number;
}

export const DEFAULT_CONFIG = {
  tileWidth: 100 * SCALE,
  grassHeight: 15 * SCALE,
  soilHeight: 40 * SCALE,
  filename: 'isometric_grid_with_trees.png',
  dataFilename: 'grid_positions.json',
  treeConfigFilename: 'tree-config.json',
  // These will be set dynamically
  gridSize: 0,
  canvasWidth: 0,
  canvasHeight: 0,
};

// --- Palette ---
export const COLORS = {
  grass: {
    top: '#9FD26A',       // slightly muted, less bright
    sideLight: '#90C85E', // closer to top
    sideDark: '#86BC57',  // reduced darkness gap
    tuft: '#7FB351',      // softened
    gridStroke: '#8EBF5A' // closer to surrounding greens
  },
  soil: {
    sideLight: '#6F5448', // less contrast vs dark
    sideDark: '#5F463C',  // softened dark
  }
};


export interface GridPosition {
  gridX: number;
  gridY: number;
  pixelX: number;
  pixelY: number;
}

const positions: GridPosition[] = [];
let treePlacements: TreeConfig[] = [];

// --- Helper Functions ---

/**
 * Draws a filled polygon.
 */
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
  // Use content width if provided, otherwise use default
  const radiusX = contentWidth ? contentWidth / 2 : DEFAULT_CONFIG.tileWidth / 4.5;
  const radiusY = radiusX / 2.5; // Maintain proportional height
  ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(40, 60, 20, 0.066)'; // A dark, semi-transparent green
  ctx.fill();
}

function drawTuft(ctx: any, centerX: number, centerY: number) {
  ctx.strokeStyle = COLORS.grass.tuft;
  ctx.lineWidth = 2 * SCALE;
  ctx.lineCap = 'round';
  
  const size = 6 * SCALE;
  
  ctx.beginPath();
  ctx.moveTo(centerX - size, centerY - size/2);
  ctx.lineTo(centerX, centerY + size/2);
  ctx.lineTo(centerX + size, centerY - size/2);
  ctx.stroke();
}

/**
 * Detects the actual bottom and horizontal center of the tree content.
 * Returns { xOffset, yPadding, contentWidth } where:
 * - yPadding: number of transparent pixels from the bottom of the image
 * - xOffset: horizontal offset from image center to content center
 * - contentWidth: actual width of the content at the bottom in pixels
 */
export function detectTreeContentPosition(image: any): { xOffset: number, yPadding: number, contentWidth: number } {
  // Create a temporary canvas to read pixel data
  const tempCanvas = createCanvas(image.width, image.height);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(image, 0, 0);
  
  const imageData = tempCtx.getImageData(0, 0, image.width, image.height);
  const data = imageData.data;
  
  // Find all rows with visible pixels and calculate their average darkness
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
      
      if (alpha > 245) { // Has visible content
        hasPixels = true;
        // Calculate darkness (0 = black, 765 = white)
        // We invert it so higher = darker
        const brightness = r + g + b;
        const darkness = (765 - brightness) * (alpha / 255); // Weight by opacity
        totalDarkness += darkness;
        pixelCount++;
      }
    }
    
    if (hasPixels && pixelCount > 0) {
      const avgDarkness = totalDarkness / pixelCount;
      candidateRows.push({ y, darkness: avgDarkness });
      
      // Only consider bottom 30% of image to avoid scanning entire tree
      if (candidateRows.length > image.height * 0.3) break;
    }
  }
  
  // If no opaque pixels found, return zeros
  if (candidateRows.length === 0) {
    return { xOffset: 0, yPadding: 0, contentWidth: 0 };
  }
  
  // Find the darkest row among candidates
  let darkestRow = candidateRows[0];
  for (const candidate of candidateRows) {
    if (candidate.darkness > darkestRow.darkness) {
      darkestRow = candidate;
    }
  }
  
  const bottomY = darkestRow.y;
  const yPadding = image.height - bottomY - 1;
  
  // Now scan that darkest bottom row to find leftmost and rightmost pixels
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
  
  // Calculate the center of the content in that bottom row
  const contentCenterX = (leftmost + rightmost) / 2;
  const imageCenterX = image.width / 2;
  const xOffset = contentCenterX - imageCenterX;
  const contentWidth = rightmost - leftmost + 1;
  
  return { xOffset, yPadding, contentWidth };
}

export function drawIsoBlock(ctx: any, pos: GridPosition, treeConfig: TreeConfig | undefined, shadowWidth?: number) {
  const { gridX, gridY, pixelX, pixelY } = pos;

  const w = DEFAULT_CONFIG.tileWidth;
  const h = DEFAULT_CONFIG.tileWidth / 2;

  // The `pixelX` and `pixelY` from `pos` represent the true center of the tile's top face.
  // We need to calculate the corner points relative to this center.
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

  // Draw shadow if a tree is present
  if (treeConfig) {
    // The shadow is drawn at the center of the tile, where the trunk is placed.
    drawShadow(ctx, pixelX, pixelY, shadowWidth);
  }

  // Random Details - only if no tree is on this tile
  if (!treeConfig) {
    const seed = Math.sin(gridX * 12.9898 + gridY * 78.233) * 43758.5453;
    if ((seed - Math.floor(seed)) > 0.5) { // 50% chance
      const randX = (seed * 10) % (20 * SCALE) - (10 * SCALE);
      const randY = (seed * 20) % (10 * SCALE) - (5 * SCALE);
      drawTuft(ctx, pixelX + randX, pixelY + randY);
    }
  }
}

export interface GridOptions {
  trees: TreeConfig[];
  outputFilename: string;
  dataFilename?: string;
}

// --- Exported Grid Generation Function ---
export async function generateGrid(options: GridOptions,): Promise<Buffer> {
  const { trees, outputFilename, dataFilename } = options;
  const positions: GridPosition[] = [];

  // Determine grid size from tree placements
  let maxGridDim = 1;
  for (const tree of trees) {
    if (tree.gridX > maxGridDim - 1) maxGridDim = tree.gridX + 1;
    if (tree.gridY > maxGridDim - 1) maxGridDim = tree.gridY + 1;
  }
  DEFAULT_CONFIG.gridSize = maxGridDim;

  // Dynamically set canvas size (square)
  const totalGridWidth = (DEFAULT_CONFIG.gridSize * 2) * (DEFAULT_CONFIG.tileWidth / 2);
  const calculatedWidth = totalGridWidth + (100 * SCALE);
  const calculatedHeight = (DEFAULT_CONFIG.gridSize) * (DEFAULT_CONFIG.tileWidth / 2) + (DEFAULT_CONFIG.soilHeight + DEFAULT_CONFIG.grassHeight) * 2 + (200 * SCALE);
  // Use the larger dimension to create a square canvas
  const canvasSize = Math.max(calculatedWidth, calculatedHeight);
  DEFAULT_CONFIG.canvasWidth = canvasSize;
  DEFAULT_CONFIG.canvasHeight = canvasSize;

  const canvas = createCanvas(DEFAULT_CONFIG.canvasWidth, DEFAULT_CONFIG.canvasHeight);
  const ctx = canvas.getContext('2d');

  console.log(`Generating ${DEFAULT_CONFIG.gridSize}x${DEFAULT_CONFIG.gridSize} Grid at ${SCALE}x Resolution...`);

  const startX = DEFAULT_CONFIG.canvasWidth / 2;
  const startY = (150 * SCALE);

  // Create a map for quick lookup of trees by grid position
  const treeMap = new Map<string, TreeConfig>();
  for (const tree of trees) {
    treeMap.set(`${tree.gridX},${tree.gridY}`, tree);
  }

  // Load all unique tree images and detect content position
  const loadedTrees = new Map<string, any>();
  const treeOffsets = new Map<string, { xOffset: number, yPadding: number }>();
  for (const tree of trees) {
    if (!loadedTrees.has(tree.imagePath)) {
      try {
        const image = await loadImage(tree.imagePath);
        loadedTrees.set(tree.imagePath, image);
        const offsets = detectTreeContentPosition(image);
        treeOffsets.set(tree.imagePath, offsets);
        console.log(`Loaded image: ${tree.imagePath} (xOffset: ${offsets.xOffset.toFixed(1)}px, yPadding: ${offsets.yPadding}px)`);
      } catch (e) {
        console.error(`Could not load image: ${tree.imagePath}`);
      }
    }
  }

  // Generate all grid positions
  for (let y = 0; y < DEFAULT_CONFIG.gridSize; y++) {
    for (let x = 0; x < DEFAULT_CONFIG.gridSize; x++) {
      const isoX = (x - y) * (DEFAULT_CONFIG.tileWidth / 2);
      const isoY = (x + y) * (DEFAULT_CONFIG.tileWidth / 4);
      const pixelX = startX + isoX;
      const pixelY = startY + isoY + (DEFAULT_CONFIG.tileWidth / 4);
      positions.push({
        gridX: x,
        gridY: y,
        pixelX: Math.round(pixelX),
        pixelY: Math.round(pixelY)
      });
    }
  }

  // Draw grid and objects in sorted order
  const sortedPositions = [...positions].sort((a, b) => {
    return (a.gridY + a.gridX) - (b.gridY + b.gridX);
  });

  for (const pos of sortedPositions) {
    const treeConfig = treeMap.get(`${pos.gridX},${pos.gridY}`);
    drawIsoBlock(ctx, pos, treeConfig);

    if (treeConfig) {
      const image = loadedTrees.get(treeConfig.imagePath);
      if (image) {
        const treeScale = treeConfig.scale || 0.5;
        const drawWidth = image.width * treeScale;
        const drawHeight = image.height * treeScale;
        const offsets = treeOffsets.get(treeConfig.imagePath) || { xOffset: 0, yPadding: 0 };
        const xOffsetScaled = offsets.xOffset * treeScale;
        const yPaddingScaled = offsets.yPadding * treeScale;
        const drawX = pos.pixelX - (drawWidth / 2) - xOffsetScaled;
        const drawY = pos.pixelY - drawHeight + yPaddingScaled;
        ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      }
    }
  }

  const buffer = await canvas.encode('png');
  await writeFile(outputFilename, buffer);
  
  if (dataFilename) {
    await writeFile(dataFilename, JSON.stringify(positions, null, 2));
    console.log(`✅ Positions saved: ${dataFilename}`);
  }

  console.log(`✅ HD Grid generated: ${outputFilename} (${DEFAULT_CONFIG.canvasWidth}x${DEFAULT_CONFIG.canvasHeight})`);
  return buffer;
}

// --- Main Execution ---
async function main() {
  console.log("Reading configuration files...");
  let treePlacements: TreeConfig[] = [];
  try {
    const treeConfigFile = await readFile(DEFAULT_CONFIG.treeConfigFilename, 'utf-8');
    const treeConfigData = JSON.parse(treeConfigFile);
    treePlacements = treeConfigData.trees;
  } catch (error) {
    console.error(`Error reading or parsing configuration files:`, error);
    return;
  }

  await generateGrid({
    trees: treePlacements,
    outputFilename: DEFAULT_CONFIG.filename,
    dataFilename: DEFAULT_CONFIG.dataFilename
  });
}

// Only run main if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}