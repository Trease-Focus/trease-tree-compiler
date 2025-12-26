import { createCanvas, CanvasRenderingContext2D, loadImage, Image } from 'canvas';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SeededRandom } from '../core/seeded-random';
import { DEFAULT_CONFIG, type Config } from '../types/config';
import type { Generate } from '../models/generate';
import type { GeneratorResult } from '../types/generator-result';
import type { Context } from 'baojs';
import { getFFmpegArgs } from '../core/ffmpeg-args';

export class Wisteria implements Generate {

    getInfo(config?: Config): Promise<GeneratorResult> {
        if (!config) throw new Error('Config is required.');
        
        // Dummy run for bounds calculation
        const rand = new SeededRandom(config.seed);
        const startPos = new Vector2(0, 0);
        const initialLength = 180;
        const maxDepth = 8;
        
        const fullTree = generateWillowStructure(rand, startPos, initialLength, -90, maxDepth, maxDepth, 0);
        const bounds = calculateBounds(fullTree);
        
        const scale = Math.min(
            (config.width - config.padding * 2) / (bounds.maxX - bounds.minX),
            (config.height - config.padding * 2) / (bounds.maxY - bounds.minY)
        );
        
        const treeCenterX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
        const offsetX = config.width / 2 - treeCenterX * scale;
        const offsetY = (config.height - config.padding) - bounds.maxY * scale;
        
        return Promise.resolve({ trunkStartPosition: { x: offsetX, y: offsetY } });
    }

    async generate(con: Context, onStream?:(process:ChildProcessWithoutNullStreams,videoStream:ChildProcessWithoutNullStreams['stdout']) => void, CONFIG: Config = DEFAULT_CONFIG): Promise<GeneratorResult> {
        console.log("Generating Weeping Willow with Assets");

        // 1. LOAD ASSET (Specific path requested)
        let foliageImg: Image;
        try {
             // Using the exact path snippet provided
             foliageImg = await loadImage("./assets/wisteria.png");
             console.log("Asset loaded successfully.");
        } catch (e) {
            console.error(`FAILED to load foliage image. Ensure './assets/weeping_willow.png' exists.`);
            throw e;
        }

        const canvas = createCanvas(CONFIG.width, CONFIG.height);
        const ctx = canvas.getContext('2d');
        const rand = new SeededRandom(CONFIG.seed);
        
        // 2. GENERATE STRUCTURE
        const startPos = new Vector2(0, 0);
        const initialLength = 160; 
        const maxDepth = 8; 

        const fullTree = generateWillowStructure(
            rand,
            startPos,
            initialLength,
            -90, // Growing Up
            maxDepth,
            maxDepth, 
            0
        );

        // 3. AUTO-FIT
        const bounds = calculateBounds(fullTree);
        const treeWidth = bounds.maxX - bounds.minX;
        const treeHeight = bounds.maxY - bounds.minY;
        const availW = CONFIG.width - (CONFIG.padding * 2);
        const availH = CONFIG.height - (CONFIG.padding * 2);
        const scaleX = availW / treeWidth;
        const scaleY = availH / treeHeight;
        const finalScale = Math.min(scaleX, scaleY);
        
        const treeCenterX = bounds.minX + (treeWidth / 2);
        const offsetX = CONFIG.width / 2 - (treeCenterX * finalScale);
        const offsetY = (CONFIG.height - CONFIG.padding) - (bounds.maxY * finalScale);

        console.log(`   Tree Scale: ${finalScale.toFixed(3)}`);

        // 4. RENDER
        if (CONFIG.photoOnly) {
            const maxDistance = getMaxDist(fullTree);
            const currentGrowthDist = maxDistance + 500; // Ensure everything is grown

            ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
            this.renderFrame(ctx, fullTree, foliageImg, currentGrowthDist, finalScale, offsetX, offsetY);
            
            const finalBuffer = canvas.toBuffer('image/png');
            if (CONFIG.save_as_file) {
                fs.writeFileSync(CONFIG.imageFilename, finalBuffer);
            }
            return {
                imageBuffer: finalBuffer,
                imagePath: CONFIG.save_as_file ? CONFIG.imageFilename : undefined,
                trunkStartPosition: { x: offsetX, y: offsetY }
            };
        }

        // Generate video
        const ffmpegArgs = getFFmpegArgs(CONFIG);
        console.log(`🎥 Spawning FFmpeg process: ${CONFIG.filename}`);
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);

        if (onStream) {
            onStream(ffmpeg, ffmpeg.stdout);
        }

        const totalFrames = CONFIG.durationSeconds * CONFIG.fps;
        const maxDistance = getMaxDist(fullTree);
        console.log(`   Max Growth Distance: ${maxDistance.toFixed(0)}`);
        console.log(`   Total Frames: ${totalFrames}`);

        ffmpeg.stderr.on('data', (data) => {
            // console.error(`FFmpeg stderr: ${data}`);
        });

        for (let frame = 0; frame < totalFrames; frame++) {
            if (frame % 30 === 0) console.log(`Frame ${frame}/${totalFrames}`);
            const t = frame / (totalFrames - 1);
            const currentGrowthDist = t * (maxDistance + 500);

            ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
            this.renderFrame(ctx, fullTree, foliageImg, currentGrowthDist, finalScale, offsetX, offsetY);

            const buffer = canvas.toBuffer('image/png');
            const ok = ffmpeg.stdin.write(buffer);
            if (!ok) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
        }
        ffmpeg.stdin.end();

        // Wait for FFmpeg to finish encoding
        await new Promise<void>((resolve, reject) => {
            ffmpeg.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`FFmpeg exited with code ${code}`));
            });
            ffmpeg.on('error', reject);
        });

        return {
            videoPath: CONFIG.filename,
            trunkStartPosition: { x: offsetX, y: offsetY }
        };
    }

    private renderFrame(
        ctx: CanvasRenderingContext2D, 
        tree: Branch, 
        foliageImg: Image, 
        growthDist: number, 
        scale: number, 
        offX: number, 
        offY: number
    ) {
        const branches: SimpleBranch[] = [];
        let entities: ImageEntity[] = [];

        flattenTreeOrganic(tree, branches, entities, growthDist, scale, offX, offY);

        // Sort images so lower ones draw on top (painter's algorithm approximation)
        entities.sort((a, b) => a.center.y - b.center.y);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // --- DRAW WOOD ---
        ctx.strokeStyle = '#2d241b'; 
        for (const b of branches) {
            ctx.beginPath();
            ctx.lineWidth = b.strokeWidth;
            ctx.moveTo(b.start.x, b.start.y);
            ctx.quadraticCurveTo(b.control.x, b.control.y, b.end.x, b.end.y);
            ctx.stroke();
        }

        // --- PASTE FOLIAGE IMAGES ---
        for (const e of entities) {
            const prevAlpha = ctx.globalAlpha;
            ctx.globalAlpha = (e.opacity ?? 1);

            ctx.save();
            ctx.translate(e.center.x, e.center.y);
            ctx.rotate(e.rotation);

            // Scale logic: The user requested "slightly large" images.
            // We assume the source image is high res. 
            // We scale it relative to the tree scale, but keep a healthy multiplier.
            const appearanceScale = 0.8; 
            const finalImgScale = e.scale * appearanceScale;
            ctx.scale(finalImgScale, finalImgScale);

            // Center the image on the anchor point
            const imgW = foliageImg.width;
            const imgH = foliageImg.height;
            ctx.drawImage(foliageImg, -imgW / 2, 0, imgW, imgH); // 0 Y-offset to hang *from* the branch

            ctx.restore();
            ctx.globalAlpha = prevAlpha;
        }
    }
}

// --- DATA STRUCTURES ---

class Vector2 { constructor(public x: number, public y: number) { } }

interface ImageEntity {
    center: Vector2;
    rotation: number;
    scale: number;
    distFromRoot: number;
    opacity?: number;
}

class Branch {
    constructor(
        public start: Vector2, public end: Vector2,
        public strokeWidth: number, public control: Vector2,
        public length: number, public distFromRoot: number,
        public children: Branch[] = [],
        public entities: ImageEntity[] = []
    ) { }
}

class SimpleBranch {
    constructor(public start: Vector2, public end: Vector2, public strokeWidth: number, public control: Vector2) { }
}

interface Bounds { minX: number; maxX: number; minY: number; maxY: number; }
const coerceIn = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));
function smoothStep(t: number): number { return t * t * (3 - 2 * t); }

// --- GENERATION LOGIC ---

function generateWillowStructure(
    rand: SeededRandom,
    start: Vector2, length: number, angle: number,
    depth: number, maxDepth: number, currentDist: number,
): Branch {
    
    // --- 1. Structure Logic (from tree.ts) ---
    
    // Calculate End Point
    const angleOffset = rand.nextFloat(-20, 20); 
    const radAngle = (angle + angleOffset) * (Math.PI / 180);

    const endX = start.x + length * Math.cos(radAngle);
    const endY = start.y + length * Math.sin(radAngle);
    const end = new Vector2(endX, endY);

    // Calculate Control Point
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
    
    // Stroke Width (from bush.ts to keep it "very large")
    const strokeWidth = Math.max(1, Math.pow(depth, 1.4) * 2.5);

    const children: Branch[] = [];
    const entities: ImageEntity[] = [];

    // Recursion (from tree.ts)
    if (depth > 0) {
        // tree.ts uses 2 to 3 branches
        const branchCount = rand.nextInt(2, 3); 
        for (let i = 0; i < branchCount; i++) {
            const angleVariation = rand.nextFloat(-45, 45);
            const newAngle = angle + angleVariation;
            const newLength = length * rand.nextFloat(0.7, 0.9);
            
            children.push(generateWillowStructure(
                rand, end, newLength, newAngle, 
                depth - 1, maxDepth, currentDist + length,
            ));
        }
    }

    // --- 2. Asset Placement (for wisteria.png) ---
  if (depth < 6 && rand.nextFloat(0, 1) > 0.9 && entities.length < 1) {
        // Attach only at the top of each main branch
        const attachX = start.x;
        const attachY = start.y;
        const placementDelay = currentDist;

        const branchAngle = Math.atan2(end.y - start.y, end.x - start.x); // Angle of the branch
        const gravityOffset = Math.PI / 3; // Rotate slightly downward due to gravity
        const finalRotation = branchAngle + gravityOffset;

        entities.push({
            center: new Vector2(attachX, attachY),
            rotation: rand.nextFloat(-0.5,1), // Add slight randomness
            scale: rand.nextFloat(0.2, 0.8), // "Slightly large" -> Scale multiplier
            distFromRoot: placementDelay,
        });
    }
    return new Branch(start, end, strokeWidth, control, length, currentDist, children, entities);
}

// --- UTILITIES ---

function calculateBounds(b: Branch, currentBounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }): Bounds {
    currentBounds.minX = Math.min(currentBounds.minX, b.start.x, b.end.x, b.control.x);
    currentBounds.maxX = Math.max(currentBounds.maxX, b.start.x, b.end.x, b.control.x);
    currentBounds.minY = Math.min(currentBounds.minY, b.start.y, b.end.y, b.control.y);
    currentBounds.maxY = Math.max(currentBounds.maxY, b.start.y, b.end.y, b.control.y);
    
    // Estimate image bounds (assuming roughly 100px size for calculation safety)
    const safetyMargin = 60;
    b.entities.forEach(e => {
        currentBounds.minX = Math.min(currentBounds.minX, e.center.x - safetyMargin);
        currentBounds.maxX = Math.max(currentBounds.maxX, e.center.x + safetyMargin);
        currentBounds.minY = Math.min(currentBounds.minY, e.center.y - safetyMargin);
        currentBounds.maxY = Math.max(currentBounds.maxY, e.center.y + safetyMargin);
    });
    b.children.forEach(child => calculateBounds(child, currentBounds));
    return currentBounds;
}

function getMaxDist(b: Branch): number {
    let max = b.distFromRoot + b.length;
    b.entities.forEach(e => max = Math.max(max, e.distFromRoot));
    for (const child of b.children) { max = Math.max(max, getMaxDist(child)); }
    return max;
}

function flattenTreeOrganic(
    b: Branch, branchList: SimpleBranch[], entityList: ImageEntity[],
    progressDistance: number, scale: number, offsetX: number, offsetY: number
) {
    const tStart = new Vector2(b.start.x * scale + offsetX, b.start.y * scale + offsetY);
    const tEnd = new Vector2(b.end.x * scale + offsetX, b.end.y * scale + offsetY);
    const tControl = new Vector2(b.control.x * scale + offsetX, b.control.y * scale + offsetY);
    const startDist = b.distFromRoot;

    if (progressDistance > startDist) {
        let localT = (progressDistance - startDist) / b.length;
        localT = coerceIn(localT, 0, 1);
        if (localT > 0) {
            const omt = 1 - localT;
            const curControlX = omt * tStart.x + localT * tControl.x;
            const curControlY = omt * tStart.y + localT * tControl.y;
            const q1X = omt * tControl.x + localT * tEnd.x;
            const q1Y = omt * tControl.y + localT * tEnd.y;
            const curEndX = omt * curControlX + localT * q1X;
            const curEndY = omt * curControlY + localT * q1Y;

            branchList.push(new SimpleBranch(
                tStart, new Vector2(curEndX, curEndY),
                b.strokeWidth * scale * localT, new Vector2(curControlX, curControlY)
            ));

            b.entities.forEach(entity => {
                if (progressDistance > entity.distFromRoot) {
                    const age = progressDistance - entity.distFromRoot;
                    
                    // Grow slowly logic
                    const growDuration = 150; 
                    let growthP = age / growDuration;
                    growthP = coerceIn(growthP, 0, 1);
                    const sizeScale = smoothStep(growthP);

                    if (sizeScale > 0.01) {
                        entityList.push({
                            ...entity,
                            center: new Vector2(entity.center.x * scale + offsetX, entity.center.y * scale + offsetY),
                            scale: entity.scale * scale * sizeScale,
                            opacity: 1.0
                        });
                    }
                }
            });
        }
    }
    b.children.forEach(child => flattenTreeOrganic(child, branchList, entityList, progressDistance, scale, offsetX, offsetY));
}