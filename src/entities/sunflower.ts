import { createCanvas, CanvasRenderingContext2D, Image, loadImage, Canvas } from 'canvas';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
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
    x: number; // Relative position (0 to 1)
    scale: number; // Relative scale
}

export class Sunflower implements Generate {
    async generate(con: Context, onStream?: (process: ChildProcessWithoutNullStreams, videoStream: ChildProcessWithoutNullStreams['stdout']) => void, CONFIG: Config = DEFAULT_CONFIG): Promise<GeneratorResult> {
        const canvas = createCanvas(CONFIG.width, CONFIG.height);
        const ctx = canvas.getContext('2d');
        const flowerImg = await loadImage('./assets/sunflower.png');

        const mainRng = new SeededRandom(CONFIG.seed);
        const numSunflowers = mainRng.nextInt(2, 4);
        const sunflowers: SunflowerInstance[] = [];

        for (let i = 0; i < numSunflowers; i++) {
            const rng = mainRng;
            sunflowers.push({
                seed: CONFIG.seed,
                rng,
                x: rng.nextFloat(0.1, 0.9), // Use relative positioning
                scale: rng.nextFloat(0.7, 1.1),
            });
        }
        sunflowers.sort((a, b) => a.x - b.x);

        const trunkStartPosition = { x: CONFIG.width / 2, y: CONFIG.height };

        if (CONFIG.photoOnly) {
            const rawProgress = 1.0;
            const progress = -(Math.cos(Math.PI * rawProgress) - 1) / 2;
            render(ctx, canvas, flowerImg, sunflowers, progress, CONFIG);
            const finalBuffer = canvas.toBuffer('image/png');
            if (CONFIG.save_as_file) {
                fs.writeFileSync(CONFIG.imageFilename, canvas.toBuffer('image/png'));
            }
            return {
                imageBuffer: finalBuffer,
                imagePath: CONFIG.save_as_file ? CONFIG.imageFilename : undefined,
                trunkStartPosition: trunkStartPosition
            };
        }

        const ffmpegArgs = getFFmpegArgs(CONFIG);
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);

        if (onStream) {
            onStream(ffmpeg, ffmpeg.stdout);
        }

        const totalFrames = CONFIG.durationSeconds * CONFIG.fps;
        for (let frame = 0; frame < totalFrames; frame++) {
            const rawProgress = frame / (totalFrames - 1);
            const progress = -(Math.cos(Math.PI * rawProgress) - 1) / 2;
            render(ctx, canvas, flowerImg, sunflowers, progress, CONFIG);
            const buffer = canvas.toBuffer('image/png');
            const ok = ffmpeg.stdin.write(buffer);
            if (!ok) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
            
            // if (frame % CONFIG.fps === 0) {
            //     const percent = Math.round(rawProgress * 100);
            //     console.log(`Rendering... ${percent}%`);
            // }
        }
        console.log('Rendering... 100%');

        ffmpeg.stdin.end();
        
        return {
            videoPath: CONFIG.filename,
            trunkStartPosition: trunkStartPosition
        };
    }

    getInfo(Config?: Config): Promise<GeneratorResult> {
        throw new Error('Method not implemented.');
    }
}

function render(ctx: CanvasRenderingContext2D, canvas: Canvas, flowerImg: Image, sunflowers: SunflowerInstance[], progress: number, config: Config) {
    ctx.clearRect(0, 0, config.width, config.height);

    const baseY = config.height - 5;
    const sortedFlowers = [...sunflowers].sort((a, b) => a.scale - b.scale);

    for (const flower of sortedFlowers) {
        const totalHeight = config.height * 0.85 * flower.scale;
        const stagger = flower.x * 0.001;
        const flowerProgress = Math.max(0, Math.min(1, (progress - stagger) / (1 - stagger)));
        if (flowerProgress > 0) {
            drawOrganicPlant(ctx, flowerImg, flower.rng, flower.x * config.width, baseY, totalHeight, flowerProgress, config);
        }
    }
}

function drawOrganicPlant(ctx: CanvasRenderingContext2D, flowerImg: Image, rng: SeededRandom, startX: number, startY: number, totalHeight: number, progress: number, config: Config) {
    const segments = 25;
    const segmentLen = totalHeight / segments;
    const baseWidth = config.width * 0.032; // 35 / 1080

    let points = [{ x: startX, y: startY, width: baseWidth * (totalHeight / (config.height * 0.85)) }];

    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const sway = Math.sin(i * 0.2 + rng.next()) * (config.width * 0.009); // 10 / 1080
        const nod = t > 0.7 ? Math.pow(t - 0.7, 2) * (config.width * 0.138) : 0; // 150 / 1080
        
        const nextX = startX + sway + nod;
        const nextY = startY - (i * segmentLen);
        const width = baseWidth * (totalHeight / (config.height * 0.85)) * (1 - t * 0.6);

        points.push({ x: nextX, y: nextY, width });
    }

    // --- DRAW STEM ---
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const branchProgress = progress * (segments + 5);
    for (let i = 0; i < Math.min(points.length - 1, branchProgress); i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        if (!p1 || !p2) continue;

        const grad = ctx.createLinearGradient(p1.x - p1.width / 2, 0, p1.x + p1.width / 2, 0);
        grad.addColorStop(0, '#2d4c1e');
        grad.addColorStop(0.5, '#4a7c2c');
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
    
    // --- DRAW LEAVES & HEAD ---
    for (let i = 1; i <= segments; i++) {
         if (i > 5 && i < segments - 3 && i % 4 === 0) {
            const point = points[i];
            if (!point) continue;

            const side = (i / 4) % 2 === 0 ? 1 : -1;
            const leafStartProgress = (i / segments) * 0.5;
            if (progress > leafStartProgress) {
                const leafProgress = Math.min(1, (progress - leafStartProgress) * 2.0);
                drawRealisticLeaf(ctx, point.x, point.y, side, point.width, leafProgress, config);
            }
        }
    }

    const headStartProgress = 0.85;
    if (progress > headStartProgress) {
        const head = points[points.length - 1];
        if (!head) return;
        const headProgress = (progress - headStartProgress) / (1 - headStartProgress);
        const headScale = Math.sin(headProgress * Math.PI / 2);
        drawFlowerHead(ctx, flowerImg, head.x, head.y, headScale * (totalHeight / (config.height * 0.85)), config);
    }
}

function drawRealisticLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, side: number, stemWidth: number, progress: number, config: Config) {
    if (progress <= 0) return;
    ctx.save();
    ctx.translate(x, y);

    const petioleLen = config.width * 0.055 * progress; // 60 / 1080
    const pEndX = side * petioleLen;
    const pEndY = config.height * 0.018 * progress; // 20 / 1080

    ctx.beginPath();
    ctx.strokeStyle = '#3d6625';
    ctx.lineWidth = stemWidth * 0.4;
    ctx.moveTo(0, 0);
    // Make control points relative
    const cp1x = side * config.width * (20 / 1080);
    const cp1y = config.height * (-10 / 1080);
    ctx.quadraticCurveTo(cp1x, cp1y, pEndX, pEndY);
    ctx.stroke();

    const bladeStartProgress = 0.9;
    if (progress > bladeStartProgress) {
        const bladeProgress = (progress - bladeStartProgress) / (1 - bladeStartProgress);
        const leafScale = bladeProgress * 1.2;
        ctx.translate(pEndX, pEndY);
        ctx.rotate(side * 0.5 + 0.2);

        const s = config.width * 0.046 * leafScale; // 50 / 1080
        if (s < 1) {
            ctx.restore();
            return;
        }
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(s * 1.5 * side, -s, s * 2 * side, s * 2, 0, s * 2.5);
        ctx.bezierCurveTo(-s * side, s, -s * 0.5 * side, -s, 0, 0);

        const leafGrad = ctx.createLinearGradient(-s, 0, s, 0);
        leafGrad.addColorStop(0, '#3a5a24');
        leafGrad.addColorStop(1, '#4e7a30');
        
        ctx.fillStyle = leafGrad;
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.lineTo(0, s * 2.5);
        ctx.stroke();
    }
    ctx.restore();
}

function drawFlowerHead(ctx: CanvasRenderingContext2D, flowerImg: Image, x: number, y: number, scale: number, config: Config) {
    if (!flowerImg || scale <= 0) return;
    const size = config.width * 0.296 * Math.min(1, scale); // 320 / 1080
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.3); 

    ctx.fillStyle = 'transparent';
    ctx.beginPath();
    ctx.arc(0, 0, size / 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    ctx.drawImage(flowerImg, -size / 2, -size / 4, size, size);
    
    ctx.restore();
}
