import { createCanvas, CanvasRenderingContext2D, Image, loadImage, Canvas } from 'canvas';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import { SeededRandom } from '../core/seeded-random';
import type { Generate } from '../models/generate';
import type { Context } from 'baojs';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { DEFAULT_CONFIG, type Config } from '../types/config';
import type { GeneratorResult } from '../types/generator-result';
import { get } from 'node:http';
import { getFFmpegArgs } from '../core/ffmpeg-args';


export class Lavender implements Generate {
    async generate(ctx: Context, onStream?: (process: ChildProcessWithoutNullStreams, videoStream: ChildProcessWithoutNullStreams['stdout']) => void, CONFIG: Config = DEFAULT_CONFIG): Promise<GeneratorResult> {
        const grower = new LavenderGrower(CONFIG);
        await grower.init();
        if (CONFIG.photoOnly) {
            return await grower.generatePhoto();
        } else {
            await grower.generateVideo(onStream);
            return { videoPath: CONFIG.filename };
        }
    }
    getInfo(Config?: Config): Promise<GeneratorResult> {
        throw new Error('Method not implemented.');
    }
}

    

class LavenderGrower {
    private canvas : Canvas;
    private ctx: CanvasRenderingContext2D;
    private rng: SeededRandom;
    private flowerImg!: Image;
    private plantStructure: any;
    private bounds: any;
    private scale: number = 1;
    private offsetX: number = 0;
    private offsetY: number = 0;
    private config: Config = DEFAULT_CONFIG;

    constructor(private conf: Config) {
        this.config = conf;
        this.canvas = createCanvas(conf.height, conf.width);
        this.ctx = this.canvas.getContext('2d');
        this.rng = new SeededRandom(conf.seed);
        this.plantStructure = this.generatePlantStructure();
        this.calculateAndSetTransform();
    }

    async init() {
        this.flowerImg = await loadImage("./assets/lavender.png");
    }

    /**
     * GENERATE PHOTO
     * Renders a static high-res image of the unique plant.
     */
    async generatePhoto():Promise<GeneratorResult> {
        this.renderPlant(1.0); // Render at 100% growth
        const buffer = this.canvas.toBuffer('image/png');
        if(this.config.save_as_file){
            const outputPath = this.config.imageFilename || './lavender_photo.png';
            fs.writeFileSync(outputPath, buffer);
            console.log(`✨ Photo saved: ${outputPath} (Seed: ${this.conf.seed})`);
        }
        return { imageBuffer: buffer  };
    }

    /**
     * GENERATE VIDEO
     * Uses ffmpeg to pipe frames into a webm video with transparency.
     */
    async generateVideo(onStream?:(process:ChildProcessWithoutNullStreams,videoStream:ChildProcessWithoutNullStreams['stdout']) => void,) {
        const totalFrames = this.config.durationSeconds * this.config.fps;
        
        const ffmpegArgs = getFFmpegArgs(this.config);
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        if (onStream) onStream(ffmpeg, ffmpeg.stdout);

        for (let i = 0; i <= totalFrames; i++) {
            const progress = i / totalFrames;
            this.renderPlant(progress);
            const ok = ffmpeg.stdin.write(this.canvas.toBuffer('image/png'));
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
    }

    private generatePlantStructure() {
        const baseX = 0;
        const baseY = 0;
        const stemCount = 5 + Math.floor(this.rng.next() * 5); // 5-10 main stems
        const stems = [];
        let maxDist = 0;

        for (let i = 0; i < stemCount; i++) {
            const angle = -Math.PI / 2 + (this.rng.next() - 0.5) * 0.8;
            const length = 400 + this.rng.next() * 250;
            const curve = (this.rng.next() - 0.5) * 2;
            
            const leaves = [];
            const leafCount = 8;
            for (let j = 1; j <= leafCount; j++) {
                const t = j / leafCount;
                leaves.push({
                    dist: t * length,
                    variation: this.rng.next()
                });
            }
            maxDist = Math.max(maxDist, length);
            const flowerRotationOffset = (this.rng.next() - 0.5) * 0.3;
            stems.push({ angle, length, curve, leaves, dist: 0, flowerRotationOffset });
        }
        return { baseX, baseY, stems, maxDist };
    }

    private calculateAndSetTransform() {
        const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        const { baseX, baseY, stems } = this.plantStructure;

        for (const stem of stems) {
            const endX = baseX + Math.cos(stem.angle) * stem.length + (stem.curve * 50);
            const endY = baseY + Math.sin(stem.angle) * stem.length;
            
            bounds.minX = Math.min(bounds.minX, baseX, endX - 30); // Account for leaf/flower width
            bounds.maxX = Math.max(bounds.maxX, baseX, endX + 30);
            bounds.minY = Math.min(bounds.minY, endY - 60); // Account for flower height
            bounds.maxY = Math.max(bounds.maxY, baseY);
        }
        this.bounds = bounds;

        const padding = this.config.padding;
        const availW = this.canvas.width - (padding * 2);
        const availH = this.canvas.height - (padding * 2);

        const treeWidth = this.bounds.maxX - this.bounds.minX;
        const treeHeight = this.bounds.maxY - this.bounds.minY;

        this.scale = Math.min(availW / treeWidth, availH / treeHeight) * 0.9;

        const treeCenterX = this.bounds.minX + (treeWidth / 2);
        this.offsetX = (this.canvas.width / 2) - (treeCenterX * this.scale);
        this.offsetY = (this.canvas.height - padding) - (this.bounds.maxY * this.scale);
    }

    private renderPlant(progress: number) {
        const ctx = this.ctx;
        const { baseX, baseY, stems, maxDist } = this.plantStructure;
        const growthDistance = progress * (maxDist + 100); // Add buffer for flower growth

        // Clear Canvas for transparency
        ctx.clearRect(0, 0, 1080, 1080);

        for (const stem of stems) {
            this.drawStem(baseX, baseY, stem.angle, stem.length, stem.curve, stem.leaves, growthDistance, stem.flowerRotationOffset);
        }
    }

    private drawStem(x: number, y: number, angle: number, len: number, curve: number, leaves: any[], growthDistance: number, flowerRotationOffset: number) {
        if (growthDistance <= 0) return;

        const ctx = this.ctx;
        const currentLength = Math.min(len, growthDistance);
        const t = currentLength / len;

        const endX = x + Math.cos(angle) * currentLength + (curve * t * 50);
        const endY = y + Math.sin(angle) * currentLength;

        // --- Apply Scaling ---
        const drawX = x * this.scale + this.offsetX;
        const drawY = y * this.scale + this.offsetY;
        const drawEndX = endX * this.scale + this.offsetX;
        const drawEndY = endY * this.scale + this.offsetY;
        const controlX = (x + curve * 20) * this.scale + this.offsetX;
        const controlY = (y - currentLength/2) * this.scale + this.offsetY;

        // Draw the Stem (Outline)
        const baseLineWidth = (16 * (1 - t * 0.5)) * this.scale;
        ctx.beginPath();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = baseLineWidth + (2 * this.scale);
        ctx.moveTo(drawX, drawY);
        ctx.quadraticCurveTo(controlX, controlY, drawEndX, drawEndY);
        ctx.stroke();

        // Draw the Stem (Fill)
        ctx.beginPath();
        ctx.strokeStyle = '#4e7a3d';
        ctx.lineWidth = baseLineWidth;
        ctx.moveTo(drawX, drawY);
        ctx.quadraticCurveTo(controlX, controlY, drawEndX, drawEndY);
        ctx.stroke();

        // Draw Leaves
        for (const leaf of leaves) {
            if (growthDistance > leaf.dist) {
                const leafProgress = Math.min(1, (growthDistance - leaf.dist) / 50); // 50 "units" of growth time
                
                // We need to find the position on the *currently drawn* curve segment
                if (leaf.dist > currentLength) continue; // Don't draw leaves beyond the current stem tip

                const leafT = leaf.dist / currentLength; // Position along the *current* stem

                // Calculate position on the quadratic curve of the *current* stem
                const omt = 1 - leafT;
                const p0x = x;
                const p0y = y;
                const p1x = x + curve * 20;
                const p1y = y - currentLength/2; // Use current length for control point
                const p2x = endX; // The current end of the stem
                const p2y = endY;

                const lx = omt * omt * p0x + 2 * omt * leafT * p1x + leafT * leafT * p2x;
                const ly = omt * omt * p0y + 2 * omt * leafT * p1y + leafT * leafT * p2y;

                this.drawLeaf(lx, ly, angle + 1.2, leaf.variation, leafProgress);
                this.drawLeaf(lx, ly, angle - 1.2, leaf.variation, leafProgress);
            }
        }

        // Attach Flower at the top
        if (growthDistance > len) {
            const flowerScale = Math.min(1, (growthDistance - len) / 100); // 100 "units" of growth time
            this.drawFlower(endX, endY, angle, flowerScale, flowerRotationOffset);
        }
    }

    private drawLeaf(x: number, y: number, angle: number, variation: number, progress: number) {
        const drawX = x * this.scale + this.offsetX;
        const drawY = y * this.scale + this.offsetY;

        this.ctx.save();
        this.ctx.translate(drawX, drawY);
        this.ctx.rotate(angle);
        this.ctx.fillStyle = '#6d9c5d';
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, (15 * progress) * this.scale, (4 * variation * progress) * this.scale, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    }

    private drawFlower(x: number, y: number, angle: number, scale: number, rotationOffset: number) {
        const img = this.flowerImg;
        if (!img) return;
        const w = 60 * scale * this.scale;
        const h = 120 * scale * this.scale;
        
        const drawX = x * this.scale + this.offsetX;
        const drawY = y * this.scale + this.offsetY;

        this.ctx.save();
        this.ctx.translate(drawX, drawY);
        this.ctx.rotate(angle + Math.PI / 2 + rotationOffset);
        this.ctx.drawImage(img, -w / 2, -h, w, h);
        this.ctx.restore();
    }
}
