import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile, readFile } from 'fs/promises';
import {
  SCALE,
  GRID_CONFIG,
  detectTreeContentPosition,
  drawIsoBlock,
  calculateCanvasDimensions,
  generateGridPositions,
  sortPositionsForRendering,
  calculateTreeDrawPosition,
} from './core/grid';
import type { GridPosition } from './core/grid';

// Re-export for backwards compatibility
export { SCALE, GRID_CONFIG as DEFAULT_CONFIG };
export type { GridPosition };

export interface TreeConfig {
  imagePath: string;
  gridX: number;
  gridY: number;
  scale: number;
}

const IMAGE_CONFIG = {
  filename: 'isometric_grid_with_trees.png',
  dataFilename: 'grid_positions.json',
  treeConfigFilename: 'tree-config.json',
};

export interface GridOptions {
  trees: TreeConfig[];
  outputFilename: string;
  dataFilename?: string;
}

// --- Exported Grid Generation Function ---
export async function generateGrid(options: GridOptions): Promise<Buffer> {
  const { trees, outputFilename, dataFilename } = options;

  // Determine grid size from tree placements
  let maxGridDim = 1;
  for (const tree of trees) {
    if (tree.gridX > maxGridDim - 1) maxGridDim = tree.gridX + 1;
    if (tree.gridY > maxGridDim - 1) maxGridDim = tree.gridY + 1;
  }
  GRID_CONFIG.gridSize = maxGridDim;

  // Dynamically set canvas size
  const dimensions = calculateCanvasDimensions(maxGridDim);
  GRID_CONFIG.canvasWidth = dimensions.width;
  GRID_CONFIG.canvasHeight = dimensions.height;

  const canvas = createCanvas(GRID_CONFIG.canvasWidth, GRID_CONFIG.canvasHeight);
  const ctx = canvas.getContext('2d');

  console.log(`Generating ${GRID_CONFIG.gridSize}x${GRID_CONFIG.gridSize} Grid at ${SCALE}x Resolution...`);

  // Create a map for quick lookup of trees by grid position
  const treeMap = new Map<string, TreeConfig>();
  for (const tree of trees) {
    treeMap.set(`${tree.gridX},${tree.gridY}`, tree);
  }

  // Load all unique tree images and detect content position
  const loadedTrees = new Map<string, any>();
  const treeOffsets = new Map<string, { xOffset: number, yPadding: number, contentWidth: number }>();
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
  const positions = generateGridPositions(GRID_CONFIG.gridSize, GRID_CONFIG.canvasWidth);
  const sortedPositions = sortPositionsForRendering(positions);

  for (const pos of sortedPositions) {
    const treeConfig = treeMap.get(`${pos.gridX},${pos.gridY}`);
    const offsets = treeConfig ? treeOffsets.get(treeConfig.imagePath) : undefined;
    
    drawIsoBlock(ctx, pos, {
      hasShadow: !!treeConfig,
      shadowWidth: offsets ? offsets.contentWidth * (treeConfig?.scale || 0.5) : undefined,
      drawTufts: !treeConfig,
      gridX: pos.gridX,
      gridY: pos.gridY,
    });

    if (treeConfig) {
      const image = loadedTrees.get(treeConfig.imagePath);
      if (image && offsets) {
        const treeScale = treeConfig.scale || 0.5;
        const { drawX, drawY, drawWidth, drawHeight } = calculateTreeDrawPosition(
          pos, image.width, image.height, offsets, treeScale
        );
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

  console.log(`✅ HD Grid generated: ${outputFilename} (${GRID_CONFIG.canvasWidth}x${GRID_CONFIG.canvasHeight})`);
  return buffer;
}

async function main() {
  console.log("Reading configuration files...");
  let treePlacements: TreeConfig[] = [];
  try {
    const treeConfigFile = await readFile(IMAGE_CONFIG.treeConfigFilename, 'utf-8');
    const treeConfigData = JSON.parse(treeConfigFile);
    treePlacements = treeConfigData.trees;
  } catch (error) {
    console.error(`Error reading or parsing configuration files:`, error);
    return;
  }

  await generateGrid({
    trees: treePlacements,
    outputFilename: IMAGE_CONFIG.filename,
    dataFilename: IMAGE_CONFIG.dataFilename
  });
}

if (require.main === module) {
  main().catch(console.error);
}