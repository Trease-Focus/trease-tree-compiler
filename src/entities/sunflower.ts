import { createCanvas, CanvasRenderingContext2D, Image, loadImage, Canvas } from 'canvas';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { SeededRandom } from '../core/seeded-random';
import type { Generate } from '../models/generate';
import { Context } from 'baojs';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { DEFAULT_CONFIG, type Config } from '../types/config';
import type { GeneratorResult } from '../types/generator-result';
import { getFFmpegArgs } from '../core/ffmpeg-args';

interface SunflowerInstance {
    seed: string;
    rng: SeededRandom;
    x: number; 
    scale: number; 
    swayOffset: number; 
}

export class Sunflower implements Generate {
    async generate(con: Context, onStream?: (process: ChildProcessWithoutNullStreams, videoStream: ChildProcessWithoutNullStreams['stdout']) => void, CONFIG: Config = DEFAULT_CONFIG): Promise<GeneratorResult> {
        const canvas = createCanvas(CONFIG.width, CONFIG.height);
        const ctx = canvas.getContext('2d');
        const flowerImg = await loadImage('./assets/sunflower.png');

        const mainRng = new SeededRandom(CONFIG.seed);
        const numSunflowers = mainRng.nextInt(2, 4);
        const sunflowers: SunflowerInstance[] = [];

        const padding = 0.15;
        for (let i = 0; i < numSunflowers; i++) {
            sunflowers.push({
                seed: CONFIG.seed,
                rng: new SeededRandom(`${CONFIG.seed}-${i}`),
                x: mainRng.nextFloat(padding, 1 - padding), 
                scale: mainRng.nextFloat(0.7, 1.0),
                swayOffset: mainRng.nextFloat(0, Math.PI * 2)
            });
        }
        sunflowers.sort((a, b) => a.x - b.x);

        const trunkStartPosition = { x: CONFIG.width / 2, y: CONFIG.height };

        if (CONFIG.photoOnly) {
            render(ctx, canvas, flowerImg, sunflowers, 1.0, CONFIG);
            const finalBuffer = canvas.toBuffer('image/png');
            if (CONFIG.save_as_file) {
                fs.writeFileSync(CONFIG.imageFilename, finalBuffer);
            }
            return {
                imageBuffer: finalBuffer,
                imagePath: CONFIG.save_as_file ? CONFIG.imageFilename : undefined,
                trunkStartPosition: trunkStartPosition
            };
        }

        const ffmpegArgs = getFFmpegArgs(CONFIG);
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        if (onStream) onStream(ffmpeg, ffmpeg.stdout);

        const totalFrames = CONFIG.durationSeconds * CONFIG.fps;
        for (let frame = 0; frame < totalFrames; frame++) {
            const rawProgress = frame / (totalFrames - 1);
            
            // "Ease-Out" curve: Starts fast (immediate visibility) and slows down (calming)
            const progress = rawProgress * (2 - rawProgress); 
            
            render(ctx, canvas, flowerImg, sunflowers, progress, CONFIG);
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

        return { videoPath: CONFIG.filename, trunkStartPosition: trunkStartPosition };
    }

    getInfo(Config?: Config): Promise<GeneratorResult> { throw new Error('Method not implemented.'); }
}

function render(ctx: CanvasRenderingContext2D, canvas: Canvas, flowerImg: Image, sunflowers: SunflowerInstance[], progress: number, config: Config) {
    ctx.clearRect(0, 0, config.width, config.height);
    const baseY = config.height - 10;

    // Find the minimum x to ensure the first flower starts at t=0
    const minX = Math.min(...sunflowers.map(s => s.x));

    for (const flower of sunflowers) {
        // Normalizing stagger so the earliest flower starts growing at frame 1
        const stagger = (flower.x - minX) * 0.15; 
        const flowerProgress = Math.max(0, Math.min(1, (progress - stagger) / (1 - stagger)));
        
        if (flowerProgress > 0) {
            drawOrganicPlant(ctx, flowerImg, flower, flower.x * config.width, baseY, flowerProgress, config);
        }
    }
}

function drawOrganicPlant(ctx: CanvasRenderingContext2D, flowerImg: Image, instance: SunflowerInstance, startX: number, startY: number, progress: number, config: Config) {
    const segments = 25;
    const headRadius = (config.width * 0.296) / 2;
    const maxPossibleHeight = config.height - headRadius - 40; 
    const totalHeight = maxPossibleHeight * instance.scale;
    const segmentLen = totalHeight / segments;
    const baseWidth = config.width * 0.032;

    // Split animation: Stem/Leaves take 85%, Head takes the final 15%
    const stemDoneThreshold = 0.85;
    const stemProgress = Math.min(1, progress / stemDoneThreshold);
    const headProgress = progress > stemDoneThreshold ? (progress - stemDoneThreshold) / (1 - stemDoneThreshold) : 0;

    let points = [{ x: startX, y: startY, width: baseWidth * (totalHeight / (config.height * 0.85)) }];

    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        // Deterministic swaying (no rng.next() calls) to prevent vibration
        const sway = Math.sin(i * 0.3 + instance.swayOffset) * (config.width * 0.008); 
        const nod = t > 0.7 ? Math.pow(t - 0.7, 2) * (config.width * 0.1) : 0;
        const nextX = startX + sway + nod;
        const nextY = startY - (i * segmentLen);
        const width = baseWidth * (totalHeight / (config.height * 0.85)) * (1 - t * 0.6);
        points.push({ x: nextX, y: nextY, width });
    }

    // --- DRAW STEM ---
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const branchProgress = stemProgress * segments; 

    for (let i = 0; i < Math.min(points.length - 1, branchProgress); i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        if (!p1 || !p2) continue;

        const grad = ctx.createLinearGradient(p1.x - p1.width / 2, 0, p1.x + p1.width / 2, 0);
        grad.addColorStop(0,'#0f1e0aff');
        grad.addColorStop(0.3, '#2d4c1e');
        grad.addColorStop(0.6, '#4a7c2c');
        grad.addColorStop(1, '#6ba343');

        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = p1.width;
        ctx.moveTo(p1.x, p1.y);

        if (i + 1 > branchProgress) {
            const partial = branchProgress - i;
            ctx.lineTo(p1.x + (p2.x - p1.x) * partial, p1.y + (p2.y - p1.y) * partial);
        } else {
            ctx.lineTo(p2.x, p2.y);
        }
        ctx.stroke();
    }
    
    // --- DRAW LEAVES ---
    for (let i = 1; i <= segments; i++) {
        // LEAF FIX: Only grow if stem branchProgress has actually reached this segment's index
        if (i > 5 && i < segments - 3 && i % 4 === 0) {
            if (branchProgress >= i) {
                const point = points[i];
                const side = (i / 4) % 2 === 0 ? 1 : -1;
                const leafGrowth = Math.min(1, (branchProgress - i) / 4); 
                if (point) {
                    drawRealisticLeaf(ctx, point.x, point.y, side, point.width, leafGrowth, config);
                }
            }
        }
    }

    // --- DRAW HEAD ---
    // HEAD FIX: Only grows once stemProgress is exactly 1 (fully rendered)
    if (stemProgress >= 1.0 && headProgress > 0) {
        const head = points[points.length - 1];
        if (!head) return;
        const headScale = Math.sin(headProgress * Math.PI / 2);
        drawFlowerHead(ctx, flowerImg, head.x, head.y, headScale * (totalHeight / (config.height * 0.85)), config);
    }
}

function drawRealisticLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, side: number, stemWidth: number, progress: number, config: Config) {
    if (progress <= 0) return;
    ctx.save();
    ctx.translate(x, y);

    const petioleLen = config.width * 0.055 * progress;
    const pEndX = side * petioleLen;
    const pEndY = config.height * 0.018 * progress;

    ctx.beginPath();
    ctx.strokeStyle = '#3d6625';
    ctx.lineWidth = stemWidth * 0.4;
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * config.width * 0.018, config.height * -0.009, pEndX, pEndY);
    ctx.stroke();

    if (progress > 0.2) {
        const bladeProgress = (progress - 0.2) / 0.8;
        ctx.translate(pEndX, pEndY);
        ctx.rotate(side * 0.5);

        const s = config.width * 0.046 * bladeProgress;
        if (s < 0.5) { ctx.restore(); return; }

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(s * 1.5 * side, -s, s * 2 * side, s * 2, 0, s * 2.5);
        ctx.bezierCurveTo(-s * side, s, -s * 0.5 * side, -s, 0, 0);

        const leafGrad = ctx.createLinearGradient(-s, 0, s, 0);
        leafGrad.addColorStop(0, '#3a5a24');
        leafGrad.addColorStop(1, '#4e7a30');
        ctx.fillStyle = leafGrad;
        ctx.fill();
    }
    ctx.restore();
}

function drawFlowerHead(ctx: CanvasRenderingContext2D, flowerImg: Image, x: number, y: number, scale: number, config: Config) {
    if (!flowerImg || scale <= 0) return;
    const size = config.width * 0.296 * scale; 
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.3 * scale); 
    ctx.drawImage(flowerImg, -size / 2, -size / 2, size, size);
    ctx.restore();
}