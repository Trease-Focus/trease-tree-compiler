import { createCanvas, CanvasRenderingContext2D, loadImage, Image } from 'canvas';
import { spawn } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import { SeededRandom } from '../core/seeded-random';
import type { Generate } from '../models/generate';
import type { Context } from 'baojs';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { DEFAULT_CONFIG, type Config } from '../types/config';
import type { GeneratorResult } from '../types/generator-result';
import { getFFmpegArgs } from '../core/ffmpeg-args';
// --- TYPES & MATH HELPERS ---

class Vector2 {
    constructor(public x: number, public y: number) { }
    static zero = () => new Vector2(0, 0);
}


interface Color {
    r: number; g: number; b: number; a: number;
}

interface Entity {
    center: Vector2;
    radius: number;
    baseColor: Color;
    highlightColor: Color;
    type: 'leaf' | 'fruit';
    distFromRoot: number; // Distance from root for timing
    opacity?: number; // 0..1 fade-in multiplier
    attachmentPoint?: Vector2; // Where the leaf/fruit attaches to the branch
}

class Branch {
    constructor(
        public start: Vector2,
        public end: Vector2,
        public strokeWidth: number,
        public control: Vector2,
        public length: number, // Actual length
        public distFromRoot: number, // Cumulative distance
        public children: Branch[] = [],
        public entities: Entity[] = []
    ) { }
}

class SimpleBranch {
    constructor(
        public start: Vector2,
        public end: Vector2,
        public strokeWidth: number,
        public control: Vector2
    ) { }
}

interface Bounds {
    minX: number; maxX: number; minY: number; maxY: number;
}

// --- LOGIC ---

const coerceIn = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

function easeOutElastic(x: number): number {
    const c4 = (2 * Math.PI) / 3;
    return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

function smoothStep(t: number): number {
    return t * t * (3 - 2 * t);
}

export class PinkBallsTree implements Generate {
    async generate(con: Context, onStream?: (process: ChildProcessWithoutNullStreams, videoStream: ChildProcessWithoutNullStreams['stdout']) => void, CONFIG: Config = DEFAULT_CONFIG): Promise<GeneratorResult> {

        console.log("🌱 Initializing Perfect-Fit Bonsai Generator...");

        const teddyImg = await loadImage('./assets/pink_teddy.png');

        const canvas = createCanvas(CONFIG.width, CONFIG.height);
        const ctx = canvas.getContext('2d');

        const rand = new SeededRandom(CONFIG.seed);

        // Generate logical tree roughly centered at 0,0 first, then shift
        // We use a dummy start position, we will move it later
        const startPos = new Vector2(0, 0);
        const initialLength = 200; // Arbitrary unit, will be scaled

        console.log("🌳 Building logical tree structure...");
        const maxDepth = 7;

        // Note: Growing UP (-90 degrees)
        const fullTree = generateFullTree(
            rand,
            startPos,
            initialLength,
            -90,
            maxDepth,
            0
        );

        // --- AUTO-FIT LOGIC ---
        console.log("📐 Calculating bounds and scale...");
        const bounds = calculateBounds(fullTree);
        const treeWidth = bounds.maxX - bounds.minX;
        const treeHeight = bounds.maxY - bounds.minY;

        // Available space
        const availW = CONFIG.width - (CONFIG.padding * 2);
        const availH = CONFIG.height - (CONFIG.padding * 2);

        // Scale to fit (maintain aspect ratio)
        const scaleX = availW / treeWidth;
        const scaleY = availH / treeHeight;
        const finalScale = Math.min(scaleX, scaleY);

        // Calculate offsets to center the tree
        // We want the bounding box center to align with canvas center
        // However, for a tree, it usually looks best if the "root" is at the bottom-center
        // But since we want it "perfectly in frame", let's center the bounding box vertically too, 
        // or align bottom. Let's align bottom of tree to bottom margin.

        const treeCenterX = bounds.minX + (treeWidth / 2);
        const targetCenterX = CONFIG.width / 2;
        const offsetX = targetCenterX - (treeCenterX * finalScale);

        // Align bottom: bounds.maxY should be at CONFIG.height - padding
        // Note: Canvas Y goes down. -90 deg means Y decreases. 
        // bounds.maxY is likely the root (0), bounds.minY is the top leaves.
        const offsetY = (CONFIG.height - CONFIG.padding) - (bounds.maxY * finalScale);


        const maxDistance = getMaxDist(fullTree);

        if (CONFIG.photoOnly) {
            console.log("📸 Generating final tree image only (video creation skipped).");

            // Set growth to maximum to draw the final state
            const currentGrowthDist = maxDistance + 700;

            ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);

            const branches: SimpleBranch[] = [];
            let entities: Entity[] = [];

            flattenTreeOrganic(fullTree, branches, entities, currentGrowthDist, finalScale, offsetX, offsetY);


            const leaves = entities.filter(e => e.type === 'leaf');
            const fruits = entities.filter(e => e.type === 'fruit');
            leaves.sort((a, b) => a.center.y - b.center.y);
            fruits.sort((a, b) => a.center.y - b.center.y);
            entities = leaves.concat(fruits);

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // DRAW TREE TRUNK (copied from render loop)
            ctx.strokeStyle = '#3E2723';
            for (const b of branches) {
                ctx.beginPath();
                ctx.lineWidth = b.strokeWidth * 0.2;
                ctx.moveTo(b.start.x, b.start.y);
                ctx.quadraticCurveTo(b.control.x, b.control.y, b.end.x, b.end.y);
                ctx.stroke();
            }
            ctx.strokeStyle = '#6D4C41';
            for (const b of branches) {
                if (b.strokeWidth < 1) continue;
                ctx.beginPath();
                ctx.lineWidth = b.strokeWidth * 0.5;
                const off = -1;
                ctx.moveTo(b.start.x + off, b.start.y + off);
                ctx.quadraticCurveTo(b.control.x + off, b.control.y + off, b.end.x + off, b.end.y + off);
                ctx.stroke();
            }

            // DRAW LEAVES & FRUITS 
            for (const e of entities) {
                const prevAlpha = ctx.globalAlpha;
                ctx.globalAlpha = (e.opacity ?? 1);

                if (e.type === 'fruit') {
                    // Draw Teddy
                    const size = e.radius * 2.5;
                    ctx.drawImage(teddyImg, e.center.x - size / 2, e.center.y - size / 2, size, size);
                } else {
                    ctx.fillStyle = 'rgba(0,0,0,0.1)';
                    ctx.beginPath();
                    ctx.arc(e.center.x + 2, e.center.y + 5, e.radius, 0, Math.PI * 2);
                    ctx.fill();
                    const g = ctx.createRadialGradient(e.center.x - e.radius * 0.3, e.center.y - e.radius * 0.3, e.radius * 0.1, e.center.x, e.center.y, e.radius);
                    g.addColorStop(0, `rgba(${e.highlightColor.r},${e.highlightColor.g},${e.highlightColor.b},1)`);
                    g.addColorStop(1, `rgba(${e.baseColor.r},${e.baseColor.g},${e.baseColor.b},1)`);
                    ctx.beginPath();
                    ctx.fillStyle = g;
                    ctx.arc(e.center.x, e.center.y, e.radius, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = prevAlpha;
            }

            const finalBuffer = canvas.toBuffer('image/png');
            if (CONFIG.save_as_file) {
                fs.writeFileSync(CONFIG.imageFilename, finalBuffer);
            }
            return {
                imageBuffer: finalBuffer,
                trunkStartPosition: { x: offsetX, y: offsetY }
            }
        }

        const ffmpegArgs = getFFmpegArgs(CONFIG);
        console.log(`🎥 Spawning FFmpeg process: ${CONFIG.filename}`);
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        if (onStream) {
            onStream(ffmpeg, ffmpeg.stdout);
        }

        const totalFrames = CONFIG.durationSeconds * CONFIG.fps;

        for (let frame = 0; frame < totalFrames; frame++) {
            const t = frame / (totalFrames - 1);

            // Organic Growth: Distance based
            // We grow past maxDistance to ensure fruits have time to grow (they have a 500-unit delay)
            const currentGrowthDist = t * (maxDistance + 700);

            // Clear Rect for TRANSPARENT background
            ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);

            // --- PREPARE DATA ---
            const branches: SimpleBranch[] = [];
            let entities: Entity[] = [];

            flattenTreeOrganic(fullTree, branches, entities, currentGrowthDist, finalScale, offsetX, offsetY);

            // Separate leaves & fruits for rendering order
            const leaves = entities.filter(e => e.type === 'leaf');
            const fruits = entities.filter(e => e.type === 'fruit');

            // Sort all entities back-to-front (top/back first), fruits drawn last so they appear on top
            leaves.sort((a, b) => a.center.y - b.center.y);
            fruits.sort((a, b) => a.center.y - b.center.y);
            // Fruits are always drawn on top, never culled
            entities = leaves.concat(fruits);

            // --- DRAWING ---
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // DRAW TREE TRUNK
            // Pass 1: Dark Outline
            ctx.strokeStyle = '#3E2723';
            for (const b of branches) {
                ctx.beginPath();
                ctx.lineWidth = b.strokeWidth;
                ctx.moveTo(b.start.x, b.start.y);
                ctx.quadraticCurveTo(b.control.x, b.control.y, b.end.x, b.end.y);
                ctx.stroke();
            }

            // Pass 2: Wood Highlight
            ctx.strokeStyle = '#6D4C41';
            for (const b of branches) {
                if (b.strokeWidth < 1) continue;
                ctx.beginPath();
                ctx.lineWidth = b.strokeWidth * 0.5;
                const off = -1;
                ctx.moveTo(b.start.x + off, b.start.y + off);
                ctx.quadraticCurveTo(b.control.x + off, b.control.y + off, b.end.x + off, b.end.y + off);
                ctx.stroke();
            }

            // DRAW LEAVES & FRUITS
            for (const e of entities) {
                // Use per-entity opacity (fade-in) and restore after drawing
                const prevAlpha = ctx.globalAlpha;
                ctx.globalAlpha = (e.opacity ?? 1);

                if (e.type === 'fruit') {
                    // Draw Teddy
                    const size = e.radius * 2.5;
                    ctx.drawImage(teddyImg, e.center.x - size / 2, e.center.y - size / 2, size, size);
                } else {
                    // Shadow (will be affected by globalAlpha so it fades with the entity)
                    ctx.fillStyle = 'rgba(0,0,0,0.1)';
                    ctx.beginPath();
                    ctx.arc(e.center.x + 2, e.center.y + 5, e.radius, 0, Math.PI * 2);
                    ctx.fill();

                    // Main Gradient
                    const g = ctx.createRadialGradient(
                        e.center.x - e.radius * 0.3,
                        e.center.y - e.radius * 0.3,
                        e.radius * 0.1,
                        e.center.x,
                        e.center.y,
                        e.radius
                    );

                    // We rely on globalAlpha for fade; color stops are fully opaque
                    g.addColorStop(0, `rgba(${e.highlightColor.r},${e.highlightColor.g},${e.highlightColor.b},1)`);
                    g.addColorStop(1, `rgba(${e.baseColor.r},${e.baseColor.g},${e.baseColor.b},1)`);

                    ctx.beginPath();
                    ctx.fillStyle = g;
                    ctx.arc(e.center.x, e.center.y, e.radius, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.globalAlpha = prevAlpha;
            }

            const buffer = canvas.toBuffer('image/png');
            const ok = ffmpeg.stdin.write(buffer);
            if (!ok) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
            // if (frame % 30 === 0) {
            //     const pct = Math.round((frame / totalFrames) * 100);
            //     process.stdout.write(`\rProgress: ${pct}%`);
            // }
        }
        ffmpeg.stdin.end();
        return {
            videoPath: CONFIG.filename,
            trunkStartPosition: { x: offsetX, y: offsetY }

        };
    }


    getInfo(Config?: Config): Promise<GeneratorResult> {
        throw new Error('Method not implemented.');
    }

}
function generateFullTree(
    rand: SeededRandom,
    start: Vector2,
    length: number,
    angle: number,
    depth: number,
    currentDist: number,
): Branch {
    // 1. Calculate End Point (Unconstrained initially)
    const angleOffset = rand.nextFloat(-20, 20); // More twisty
    const radAngle = (angle + angleOffset) * (Math.PI / 180);

    const endX = start.x + length * Math.cos(radAngle);
    const endY = start.y + length * Math.sin(radAngle);
    const end = new Vector2(endX, endY);

    // 2. Calculate Control Point (Curvature)
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const mid = new Vector2(start.x + dx * 0.5, start.y + dy * 0.5);

    const perpLen = rand.nextFloat(-0.2, 0.2) * length;
    const branchLength = Math.sqrt(dx * dx + dy * dy);

    let perpX = 0, perpY = 0;
    if (branchLength !== 0) {
        perpX = (-dy / branchLength) * perpLen;
        perpY = (dx / branchLength) * perpLen;
    }

    const control = new Vector2(mid.x + perpX, mid.y + perpY);

    // Tapering stroke width
    const strokeWidth = rand.nextFloat(30, 65);

    const children: Branch[] = [];
    const entities: Entity[] = [];

    // 3. Branching Logic
    if (depth > 0) {
        const branchCount = rand.nextInt(2, 3); // 2 to 3 branches
        for (let i = 0; i < branchCount; i++) {
            const angleVariation = rand.nextFloat(-45, 45);
            const newAngle = angle + angleVariation;
            const newLength = length * rand.nextFloat(0.7, 0.9);

            children.push(generateFullTree(
                rand,
                end,
                newLength,
                newAngle,
                depth - 1,
                currentDist + length,
            ));
        }
    }

    // 4. Entity Generation (Leaves & Fruits)
    // Bigger leaves, attached to branches
    if (depth <= 4) {
        const count = 1;
        let fruitCount = { count: 0 }; // Reset fruit count per branch
        for (let i = 0; i < count; i++) {
            // BIGGER LEAVES: 25-45 radius
            const radius = 50;

            // Random position near the branch end/middle
            const t = rand.nextFloat(0.3, 0.95); // Position along branch
            const px = (1 - t) * start.x + t * end.x;
            const py = (1 - t) * start.y + t * end.y;

            // This is the attachment point on the branch
            const attachmentPoint = new Vector2(px, py);

            // Offset from the attachment point. Reduced for tighter clustering.
            const offsetX = rand.nextFloat(-40, 40);
            const offsetY = rand.nextFloat(-40, 40);

            const eX = px + offsetX;
            const eY = py + offsetY;

            // Entity distance is based on where it attaches along the branch
            const entityDist = currentDist + (length * t);

            // Decision: Fruit or Leaf?
            // Enforce a cooldown to prevent clustering
            const canBeFruit = fruitCount.count < 1;
            const isFruit = canBeFruit && rand.nextFloat(0, 1) > 0.99;

            if (isFruit) {
                fruitCount.count++;
                const fruitPalette = [
                    { r: 255, g: 182, b: 193 }, // Light Pink
                    { r: 255, g: 209, b: 220 }, // Lighter Pink
                    { r: 255, g: 240, b: 245 }, // Almost White
                ];
                const color = fruitPalette[rand.nextInt(0, fruitPalette.length)]!;

                // Fruits grow LAST: add a large offset to their distFromRoot so they appear at the very end
                const fruitDelay = 100; // They'll start growing 500 units after their branch

                entities.push({
                    center: new Vector2(eX, eY),
                    radius: 50,
                    baseColor: { r: color.r, g: color.g, b: color.b, a: 1.0 },
                    highlightColor: { r: Math.min(255, color.r + 20), g: Math.min(255, color.g + 20), b: Math.min(255, color.b + 20), a: 1.0 },
                    type: 'fruit',
                    distFromRoot: entityDist + fruitDelay,
                    attachmentPoint: attachmentPoint
                });
            } else {
                // Cherry blossom colors
                const pinks = [
                    { r: 255, g: 182, b: 193 }, // Base Pink
                    { r: 255, g: 209, b: 220 }, // Lighter Pink
                ];
                const blossomColor = pinks[rand.nextInt(0, pinks.length)]!;
                const rBase = blossomColor.r;
                const gBase = blossomColor.g;
                const bBase = blossomColor.b;

                entities.push({
                    center: new Vector2(eX, eY),
                    radius: radius,
                    baseColor: { r: rBase, g: gBase, b: bBase, a: 1.0 },
                    highlightColor: { r: Math.min(255, rBase + 15), g: Math.min(255, gBase + 15), b: Math.min(255, bBase + 15), a: 1.0 },
                    type: 'leaf',
                    distFromRoot: entityDist,
                    attachmentPoint: attachmentPoint
                });
            }
        }
    }

    return new Branch(start, end, strokeWidth, control, length, currentDist, children, entities);
}

// Recurse tree to find min/max coords
function calculateBounds(b: Branch, currentBounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }): Bounds {
    // Check branch points
    currentBounds.minX = Math.min(currentBounds.minX, b.start.x, b.end.x, b.control.x);
    currentBounds.maxX = Math.max(currentBounds.maxX, b.start.x, b.end.x, b.control.x);
    currentBounds.minY = Math.min(currentBounds.minY, b.start.y, b.end.y, b.control.y);
    currentBounds.maxY = Math.max(currentBounds.maxY, b.start.y, b.end.y, b.control.y);

    // Check entities (leaves expand bounds)
    b.entities.forEach(e => {
        currentBounds.minX = Math.min(currentBounds.minX, e.center.x - e.radius);
        currentBounds.maxX = Math.max(currentBounds.maxX, e.center.x + e.radius);
        currentBounds.minY = Math.min(currentBounds.minY, e.center.y - e.radius);
        currentBounds.maxY = Math.max(currentBounds.maxY, e.center.y + e.radius);
    });

    b.children.forEach(child => calculateBounds(child, currentBounds));
    return currentBounds;
}

// Find the maximum path length in the tree for animation timing
function getMaxDist(b: Branch): number {
    let max = b.distFromRoot + b.length;
    for (const child of b.children) {
        max = Math.max(max, getMaxDist(child));
    }
    return max;
}

// --- FLATTENING WITH SCALING & ORGANIC TIMING ---
function flattenTreeOrganic(
    b: Branch,
    branchList: SimpleBranch[],
    entityList: Entity[],
    progressDistance: number, // The 'water level' of growth
    scale: number,
    offsetX: number,
    offsetY: number
) {
    // 1. Transform Coordinates for Perfect Fit
    const tStart = new Vector2(b.start.x * scale + offsetX, b.start.y * scale + offsetY);
    const tEnd = new Vector2(b.end.x * scale + offsetX, b.end.y * scale + offsetY);
    const tControl = new Vector2(b.control.x * scale + offsetX, b.control.y * scale + offsetY);

    // 2. Growth Logic based on Distance
    // This branch starts growing when the "progress wave" hits its start distance
    // It finishes growing when the wave hits its end distance
    const startDist = b.distFromRoot;
    const endDist = b.distFromRoot + b.length;

    if (progressDistance > startDist) {
        // Calculate how much of this specific branch is grown
        let localT = (progressDistance - startDist) / b.length;
        localT = coerceIn(localT, 0, 1);

        if (localT > 0) {
            // Bezier Interpolation for "growing" tip
            const omt = 1 - localT;
            const curControlX = omt * tStart.x + localT * tControl.x;
            const curControlY = omt * tStart.y + localT * tControl.y;
            const q1X = omt * tControl.x + localT * tEnd.x;
            const q1Y = omt * tControl.y + localT * tEnd.y;
            const curEndX = omt * curControlX + localT * q1X;
            const curEndY = omt * curControlY + localT * q1Y;

            // Stroke thickens as it ages (start thickness vs tip thickness)
            const visibleStroke = b.strokeWidth * scale * localT;

            branchList.push(new SimpleBranch(
                tStart,
                new Vector2(curEndX, curEndY),
                visibleStroke,
                new Vector2(curControlX, curControlY)
            ));

            // 3. Entity Growth (Leaves/Fruits)
            // They start growing when the growth wave passes their specific attachment point
            b.entities.forEach(entity => {
                if (progressDistance > entity.distFromRoot) {
                    // How far past the entity are we?
                    const age = progressDistance - entity.distFromRoot;
                    // Grow in over 150 units of distance
                    const growSpeed = 150;
                    let growthP = age / growSpeed;
                    growthP = coerceIn(growthP, 0, 1);

                    // Smooth growth using easing
                    const radiusScale = smoothStep(growthP);

                    if (radiusScale > 0.01) {
                        const finalCenterX = entity.center.x * scale + offsetX;
                        const finalCenterY = entity.center.y * scale + offsetY;

                        entityList.push({
                            ...entity,
                            center: new Vector2(finalCenterX, finalCenterY),
                            // radius grows smoothly from near-zero to full size
                            radius: entity.radius * scale * radiusScale,
                            // Full opacity during growth (no fading)
                            opacity: 1.0
                        });
                    }
                }
            });
        }
    }

    // Recurse
    b.children.forEach(child => {
        flattenTreeOrganic(child, branchList, entityList, progressDistance, scale, offsetX, offsetY);
    });
}



