import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import { SeededRandom } from '../core/seeded-random';
import type { Color } from '../types/color';
import { DEFAULT_CONFIG, type Config } from '../types/config';
import type { Generate } from '../models/generate';
import type { GeneratorResult } from '../types/generator-result';
import type { Context } from 'baojs';
import { get } from 'http';
import { getFFmpegArgs } from '../core/ffmpeg-args';


export class Weathered implements Generate {

    getInfo(config?: Config): Promise<GeneratorResult> {
        if (!config) {
            throw new Error('Config is required to get tree info.');
        }

        const rand = new SeededRandom(config.seed);
        const startPos = new Vector2(0, 0);
        const initialLength = 200;
        const maxDepth = 7;

        const fullTree = generateFullTree(rand, startPos, initialLength, -90, maxDepth, 0);
        const bounds = calculateBounds(fullTree);
        const scale = Math.min(
            (config.width - config.padding * 2) / (bounds.maxX - bounds.minX),
            (config.height - config.padding * 2) / (bounds.maxY - bounds.minY)
        );


        const treeCenterX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
        const targetCenterX = config.width / 2;

        const offsetX = targetCenterX - treeCenterX * scale;
        const offsetY = (config.height - config.padding) - bounds.maxY * scale;

        return Promise.resolve({
            trunkStartPosition: { x: offsetX, y: offsetY }
        });
    }

    async generate(con: Context, onStream?:(process:ChildProcessWithoutNullStreams,videoStream:ChildProcessWithoutNullStreams['stdout']) => void, CONFIG: Config = DEFAULT_CONFIG): Promise<GeneratorResult> {
        console.log("Generating Tree");

        const canvas = createCanvas(CONFIG.width, CONFIG.height);
        const ctx = canvas.getContext('2d');

        const rand = new SeededRandom(CONFIG.seed);

        // Generate logical tree roughly centered at 0,0 first, then shift
        // We use a dummy start position, we will move it later
        const startPos = new Vector2(0, 0);
        const initialLength = 200; // Arbitrary unit, will be scaled

        const maxDepth = 7;

        const fullTree = generateFullTree(
            rand,
            startPos,
            initialLength,
            -90,
            maxDepth,
            0
        );

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

        console.log(`   Tree Width: ${treeWidth.toFixed(0)}, Height: ${treeHeight.toFixed(0)}`);
        console.log(`   Scale: ${finalScale.toFixed(3)}`);
        console.log(`   Offset: ${offsetX.toFixed(0)}, ${offsetY.toFixed(0)}`);

        const maxDistance = getMaxDist(fullTree);
        console.log(`   Max Growth Distance: ${maxDistance.toFixed(0)}`);

        if (CONFIG.photoOnly) {
            console.log("📸 Generating final tree image only (video creation skipped).");

            // Set growth to maximum to draw the final state
            const currentGrowthDist = maxDistance + 700;

            ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);

            const branches: SimpleBranch[] = [];
            let entities: Entity[] = [];

            flattenTreeOrganic(fullTree, branches, entities, currentGrowthDist, finalScale, offsetX, offsetY);


            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.strokeStyle = '#3E2723';
            for (const b of branches) {
                ctx.beginPath();
                ctx.lineWidth = b.strokeWidth;
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

            for (const e of entities) {
                const prevAlpha = ctx.globalAlpha;
                ctx.globalAlpha = (e.opacity ?? 1);
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
                
                ctx.globalAlpha = prevAlpha;
            }

            const finalBuffer = canvas.toBuffer('image/png');
            if (CONFIG.save_as_file) {
                fs.writeFileSync(CONFIG.imageFilename, finalBuffer);
            }

            console.log(`\n✅ Image generation complete!`);
            console.log(`   Image saved: ${CONFIG.imageFilename}`);
            return {
                imageBuffer: finalBuffer,
                imagePath: CONFIG.save_as_file ? CONFIG.imageFilename : undefined,
                trunkStartPosition: { x: offsetX, y: offsetY }
            }; // Exit after saving the image
        }
        return {};
    }
}

class Vector2 {
    constructor(public x: number, public y: number) { }
    static zero = () => new Vector2(0, 0);
}

interface Entity {
    center: Vector2;
    radius: number;
    baseColor: Color;
    highlightColor: Color;
    distFromRoot: number; // Distance from root for timing
    opacity?: number; // 0..1 fade-in multiplier
    attachmentPoint?: Vector2; 
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


const coerceIn = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

function smoothStep(t: number): number {
    return t * t * (3 - 2 * t);
}

function generateFullTree(
    rand: SeededRandom,
    start: Vector2,
    length: number,
    angle: number,
    depth: number,
    currentDist: number,
): Branch {
    const angleOffset = rand.nextFloat(-20, 20); // More twisty
    const radAngle = (angle + angleOffset) * (Math.PI / 180);

    const endX = start.x + length * Math.cos(radAngle);
    const endY = start.y + length * Math.sin(radAngle);
    const end = new Vector2(endX, endY);

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

    const strokeWidth = Math.max(2, (depth * 4 + rand.nextFloat(-1, 1)));

    const children: Branch[] = [];

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

    return new Branch(start, end, strokeWidth, control, length, currentDist, children);
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

function flattenTreeOrganic(
    b: Branch,
    branchList: SimpleBranch[],
    entityList: Entity[],
    progressDistance: number, // The 'water level' of growth
    scale: number,
    offsetX: number,
    offsetY: number
) {
    const tStart = new Vector2(b.start.x * scale + offsetX, b.start.y * scale + offsetY);
    const tEnd = new Vector2(b.end.x * scale + offsetX, b.end.y * scale + offsetY);
    const tControl = new Vector2(b.control.x * scale + offsetX, b.control.y * scale + offsetY);

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



