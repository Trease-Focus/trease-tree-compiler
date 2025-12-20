import { createCanvas, CanvasRenderingContext2D, Image, loadImage } from 'canvas';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';

/**
 * Deterministic Random Generator based on a Seed string.
 * This ensures Seed #123 always grows the same tree.
 */
class SeededRandom {
    private seed: number;
    constructor(seedStr: string) {
        const hash = createHash('sha256').update(seedStr).digest('hex');
        this.seed = parseInt(hash.substring(0, 8), 16);
    }
    next() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

class LavenderGrower {
    private canvas = createCanvas(1080, 1080);
    private ctx = this.canvas.getContext('2d');
    private rng: SeededRandom;
    private flowerImg!: Image;
    private plantStructure: any;
    private bounds: any;
    private scale: number = 1;
    private offsetX: number = 0;
    private offsetY: number = 0;

    constructor(private seed: string) {
        this.rng = new SeededRandom(seed);
        this.plantStructure = this.generatePlantStructure();
        this.calculateAndSetTransform();
    }

    async init(imagePath: string) {
        this.flowerImg = await loadImage(imagePath);
    }

    /**
     * GENERATE PHOTO
     * Renders a static high-res image of the unique plant.
     */
    async generatePhoto(outputPath: string) {
        this.renderPlant(1.0); // Render at 100% growth
        const buffer = this.canvas.toBuffer('image/png');
        fs.writeFileSync(outputPath, buffer);
        console.log(`✨ Photo saved: ${outputPath} (Seed: ${this.seed})`);
    }

    /**
     * GENERATE VIDEO
     * Uses ffmpeg to pipe frames into a webm video with transparency.
     */
    async generateVideo(outputPath: string, durationSec: number = 5) {
        const fps = 30;
        const totalFrames = durationSec * fps;
        
        const ffmpeg = spawn('ffmpeg', [
            '-y', 
            '-f', 'image2pipe', 
            '-r', `${fps}`,
            '-i', '-', 
            '-c:v', 'libvpx-vp9',
            '-pix_fmt', 'yuva420p',
            '-auto-alt-ref', '0',
            outputPath
        ]);

        for (let i = 0; i <= totalFrames; i++) {
            const progress = i / totalFrames;
            this.renderPlant(progress);
            const ok = ffmpeg.stdin.write(this.canvas.toBuffer('image/png'));
            if (!ok) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
        }

        ffmpeg.stdin.end();
        await new Promise(resolve => ffmpeg.on('close', resolve));
        console.log(`🎥 Video saved: ${outputPath}`);
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
            stems.push({ angle, length, curve, leaves, dist: 0 });
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

        const padding = 100;
        const availW = this.canvas.width - (padding * 2);
        const availH = this.canvas.height - (padding * 2);

        const treeWidth = this.bounds.maxX - this.bounds.minX;
        const treeHeight = this.bounds.maxY - this.bounds.minY;

        this.scale = Math.min(availW / treeWidth, availH / treeHeight) * 0.5;

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
            this.drawStem(baseX, baseY, stem.angle, stem.length, stem.curve, stem.leaves, growthDistance);
        }
    }

    private drawStem(x: number, y: number, angle: number, len: number, curve: number, leaves: any[], growthDistance: number) {
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
            this.drawFlower(endX, endY, angle, flowerScale);
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

    private drawFlower(x: number, y: number, angle: number, scale: number) {
        const img = this.flowerImg;
        if (!img) return;
        const w = 60 * scale * this.scale;
        const h = 120 * scale * this.scale;
        
        const drawX = x * this.scale + this.offsetX;
        const drawY = y * this.scale + this.offsetY;

        this.ctx.save();
        this.ctx.translate(drawX, drawY);
        this.ctx.rotate(angle + Math.PI / 2 + (this.rng.next() - 0.5) * 0.3);
        this.ctx.drawImage(img, -w / 2, -h, w, h);
        this.ctx.restore();
    }
}

// --- RUNTIME ---
async function main() {
    const mySeed = "balls"; // This would be your random seed range
    const grower = new LavenderGrower(mySeed);

    await grower.init('./assets/lavender.png'); // Your uploaded image
    await grower.generatePhoto('./unique_lavender.png');
    await grower.generateVideo('./growth_sequence.webm');
}

main().catch(console.error);