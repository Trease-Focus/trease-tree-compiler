import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import { spawn, type ChildProcess } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import { SeededRandom } from '../core/seeded-random';
import type { Generate } from '../models/generate';
import type { Context } from 'baojs';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { DEFAULT_CONFIG, type Config } from '../types/config';
import type { GeneratorResult } from '../types/generator-result';
import { getFFmpegArgs } from '../core/ffmpeg-args';


class Vector2 {
    constructor(public x: number, public y: number) { }
}

interface Petal {
    x: number; y: number;
    size: number;
    rotation: number;
    velocity: Vector2;
    active: boolean;
    color: string;
}

interface Entity {
    center: Vector2;
    radius: number;
    color: string;
    secondaryColor: string;
    distFromRoot: number;
    rotation: number;
}

class Branch {
    constructor(
        public start: Vector2,
        public end: Vector2,
        public control: Vector2,
        public strokeWidth: number,
        public distFromRoot: number,
        public length: number,
        public children: Branch[] = [],
        public entities: Entity[] = []
    ) { }
}

// --- GENERATION LOGIC ---

function drawPetalShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    // A simple teardrop/heart-ish petal
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size, -size, -size / 2, -size * 1.5, 0, -size * 0.8);
    ctx.bezierCurveTo(size / 2, -size * 1.5, size, -size, 0, 0);
    ctx.fill();
    ctx.restore();
}

function generateSakura(
    rand: SeededRandom,
    start: Vector2,
    length: number,
    angle: number,
    depth: number,
    dist: number,
    bounds: { width: number, height: number },
    scale: number
): Branch {
    const rad = angle * (Math.PI / 180);
    const end = new Vector2(
        start.x + Math.cos(rad) * length,
        start.y + Math.sin(rad) * length
    );

    // Bounds check - stop growing if we go too far out
    const margin = 50 * scale;
    if (end.x < -margin || end.x > bounds.width + margin || end.y < -margin || end.y > bounds.height + margin) {
        depth = 0;
    }

    // Curvy branches
    const mid = new Vector2((start.x + end.x) / 2, (start.y + end.y) / 2);
    const perp = (rand.next() - 0.5) * length * 0.4;
    const control = new Vector2(
        mid.x + Math.cos(rad + Math.PI / 2) * perp,
        mid.y + Math.sin(rad + Math.PI / 2) * perp
    );

    const children: Branch[] = [];
    const entities: Entity[] = [];

    if (depth > 0) {
        const numChildren = depth === 1 ? rand.nextInt(3, 5) : rand.nextInt(2, 3);
        for (let i = 0; i < numChildren; i++) {
            const newAngle = angle + rand.nextFloat(-35, 35);
            const newLen = length * rand.nextFloat(0.7, 0.85);
            children.push(generateSakura(rand, end, newLen, newAngle, depth - 1, dist + length, bounds, scale));
        }
    }

    // Only add blossoms on outer branches (Pinterest look)
    if (depth < 4) {
        const clusterSize = rand.nextInt(5, 12);
        for (let i = 0; i < clusterSize; i++) {
            const t = rand.nextFloat(0.5, 1.0); // Focus blossoms at tips
            const pX = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * control.x + t * t * end.x;
            const pY = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * control.y + t * t * end.y;

            entities.push({
                center: new Vector2(pX + rand.nextFloat(-20 * scale, 20 * scale), pY + rand.nextFloat(-20 * scale, 20 * scale)),
                radius: rand.nextFloat(4 * scale, 8 * scale),
                color: rand.next() > 0.3 ? '#FFD1DC' : '#FFF0F5', // Soft Pink / Lavender Blush
                secondaryColor: '#FFB7C5',
                distFromRoot: dist + (length * t),
                rotation: rand.nextFloat(0, Math.PI * 2)
            });
        }
    }

    return new Branch(start, end, control, (depth * 2.5 + 1) * scale, dist, length, children, entities);
}

export class Sakura implements Generate {
    async generate(con: Context, onStream?: (process: ChildProcessWithoutNullStreams, videoStream: ChildProcessWithoutNullStreams['stdout']) => void, CONFIG: Config = DEFAULT_CONFIG): Promise<GeneratorResult> {
        const canvas = createCanvas(CONFIG.width, CONFIG.height);
        const ctx = canvas.getContext('2d');
        const rand = new SeededRandom(CONFIG.seed);

        // Resolution independence
        const scale = Math.min(CONFIG.width, CONFIG.height) / 1080;
        const startY = CONFIG.height - (100 * scale);
        const initialLength = 180 * scale;

        // Position root at bottom center
        const tree = generateSakura(rand, new Vector2(CONFIG.width / 2, startY), initialLength, -90, 7, 0, { width: CONFIG.width, height: CONFIG.height }, scale);

        const fallingPetals: Petal[] = [];
        const totalFrames = CONFIG.fps * CONFIG.durationSeconds;
        const maxDist = 1500 * scale; // Estimated max growth distance

        if(CONFIG.photoOnly){
            const currentGrowthDist = maxDist * 1.2; // Set to final growth state

            // Simulate falling petals to match video end state
            for (let f = 0; f < totalFrames; f++) {
                const t = f / totalFrames;
                
                // --- SAKURA SNOW SYSTEM ---
                if (t > 0.4 && f % 5 === 0) { // Start dropping petals midway
                    const centerX = CONFIG.width / 2;
                    const centerY = CONFIG.height / 2;
                    const range = CONFIG.width * 0.2; // 20% of canvas width
                    fallingPetals.push({
                        x: rand.nextFloat(centerX - range, centerX + range),
                        y: rand.nextFloat(centerY - range, centerY + range),
                        size: rand.nextFloat(3 * scale, 12 * scale),
                        rotation: rand.nextFloat(0, Math.PI * 2),
                        velocity: new Vector2(rand.nextFloat(-1 * scale, 1 * scale), rand.nextFloat(1 * scale, 3 * scale)),
                        active: true,
                         color: 'rgba(255, 209, 220, 0.5)'
                        
                    });
                }

                fallingPetals.forEach(p => {
                    if (!p.active) return;
                    p.x += p.velocity.x + Math.sin(f * 0.05) * 0.5; // Swaying motion
                    p.y += p.velocity.y;
                    p.rotation += 0.02;
                    if (p.y > CONFIG.height) p.active = false;
                });
            }

            ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);

            const renderBranch = (b: Branch) => {
                if (currentGrowthDist < b.distFromRoot) return;
                const progress = Math.min(1, (currentGrowthDist - b.distFromRoot) / b.length);

                ctx.strokeStyle = '#3e2723';
                ctx.lineWidth = b.strokeWidth;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(b.start.x, b.start.y);
                const cpX = b.start.x + (b.control.x - b.start.x) * progress;
                const cpY = b.start.y + (b.control.y - b.start.y) * progress;
                const eX = b.start.x + (b.end.x - b.start.x) * progress;
                const eY = b.start.y + (b.end.y - b.start.y) * progress;
                ctx.quadraticCurveTo(cpX, cpY, eX, eY);
                ctx.stroke();

                if (progress > 0.8) {
                    b.entities.forEach(e => {
                        if (currentGrowthDist > e.distFromRoot + 50 * scale) {
                            ctx.fillStyle = e.color;
                            drawPetalShape(ctx, e.center.x, e.center.y, e.radius, e.rotation);
                        }
                    });
                }
                b.children.forEach(renderBranch);
            };

            renderBranch(tree);

            // Render falling petals
            fallingPetals.forEach(p => {
                if (!p.active) return;
                ctx.fillStyle = p.color;
                drawPetalShape(ctx, p.x, p.y, p.size, p.rotation);
            });

            const buffer = canvas.toBuffer('image/png');
            if(CONFIG.save_as_file){
                fs.writeFileSync(CONFIG.imageFilename, buffer);
            }
           return {
                imageBuffer: buffer,
                imagePath: CONFIG.save_as_file ? CONFIG.imageFilename : undefined,
                trunkStartPosition: { x: CONFIG.width / 2, y: CONFIG.height - (100 * scale) }
            };
        }


        const ffmpegArgs = getFFmpegArgs(CONFIG);
        const ffmpeg = CONFIG.photoOnly ? null : spawn('ffmpeg', ffmpegArgs);

        if(onStream && ffmpeg) onStream(ffmpeg, ffmpeg.stdout);

        for (let f = 0; f < totalFrames; f++) {
            const t = f / totalFrames;
            const currentGrowthDist = t * maxDist * 1.2;

            // Clear background with transparency
            ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
            // Recursive draw function
            const renderBranch = (b: Branch) => {
                if (currentGrowthDist < b.distFromRoot) return;

                const progress = Math.min(1, (currentGrowthDist - b.distFromRoot) / b.length);

                // Draw Branch
                ctx.strokeStyle = '#3e2723'; // Dark cherry bark
                ctx.lineWidth = b.strokeWidth;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(b.start.x, b.start.y);
                // Simple quad curve for growth
                const cpX = b.start.x + (b.control.x - b.start.x) * progress;
                const cpY = b.start.y + (b.control.y - b.start.y) * progress;
                const eX = b.start.x + (b.end.x - b.start.x) * progress;
                const eY = b.start.y + (b.end.y - b.start.y) * progress;
                ctx.quadraticCurveTo(cpX, cpY, eX, eY);
                ctx.stroke();

                // Draw Blossoms
                if (progress > 0.8) {
                    b.entities.forEach(e => {
                        if (currentGrowthDist > e.distFromRoot + 50 * scale) {
                            ctx.fillStyle = e.color;
                            drawPetalShape(ctx, e.center.x, e.center.y, e.radius, e.rotation);
                        }
                    });
                }
                b.children.forEach(renderBranch);
            };

            renderBranch(tree);

            // --- SAKURA SNOW SYSTEM ---
            if (t > 0.4 && f % 5 === 0) { // Start dropping petals midway
                const centerX = CONFIG.width / 2;
                const centerY = CONFIG.height / 2;
                const rangeX = CONFIG.width * 0.2; // 20% of canvas width
                const rangeY = CONFIG.width * 0.2; // 10% of canvas width
                fallingPetals.push({
                    x: rand.nextFloat(centerX - rangeX, centerX + rangeX),
                    y: rand.nextFloat(centerY - rangeY, centerY + rangeY),
                    size: rand.nextFloat(3 * scale, 8 * scale),
                    rotation: rand.nextFloat(0, Math.PI * 2),
                    velocity: new Vector2(rand.nextFloat(-1 * scale, 1 * scale), rand.nextFloat(1 * scale, 3 * scale)),
                    active: true,
                    color: 'rgba(255, 209, 220, 0.8)'
                });
            }

            fallingPetals.forEach(p => {
                if (!p.active) return;
                p.x += p.velocity.x + Math.sin(f * 0.05) * 0.5; // Swaying motion
                p.y += p.velocity.y;
                p.rotation += 0.02;
                ctx.fillStyle = p.color;
                drawPetalShape(ctx, p.x, p.y, p.size, p.rotation);
                if (p.y > CONFIG.height) p.active = false;
            });

            if (ffmpeg) {
                const buffer = canvas.toBuffer('image/png');
                const ok = ffmpeg.stdin.write(buffer);
                if (!ok) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
            }

            if (f % 30 === 0) console.log(`Rendering: ${Math.round(t * 100)}%`);
        }
        if(ffmpeg){
            ffmpeg.stdin.end();

            // Wait for FFmpeg to finish encoding
            await new Promise<void>((resolve, reject) => {
                (ffmpeg as any).on('close', (code: number | null) => {
                    if (code === 0) resolve();
                    else reject(new Error(`FFmpeg exited with code ${code}`));
                });
                (ffmpeg as any).on('error', reject);
            });
        }
    
        return {
            videoPath: CONFIG.filename,
            trunkStartPosition: { x: CONFIG.width / 2, y: CONFIG.height - (100 * scale) }
        };
    }
    getInfo(Config?: Config): Promise<GeneratorResult> {
        throw new Error('Method not implemented.');
    }

}
