import { createCanvas, CanvasRenderingContext2D, Image, loadImage } from 'canvas';
import { spawn } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';

const CONFIG = {
    photoOnly: true,
    width: 1080,
    height: 1080,
    fps: 30,
    durationSeconds: 15,
    videoFilename: "growing_sunflowers.webm",
    imageFilename: "final_sunflowers.png",
};

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
    nextFloat(min: number, max: number): number {
        return min + this.next() * (max - min);
    }
    nextInt(min: number, max: number): number {
        return Math.floor(this.nextFloat(min, max));
    }
}

interface SunflowerInstance {
    seed: string;
    rng: SeededRandom;
    x: number;
    scale: number;
}

class RealisticSunflower {
    private canvas = createCanvas(CONFIG.width, CONFIG.height);
    private ctx = this.canvas.getContext('2d');
    private flowerImg!: Image;
    private sunflowers: SunflowerInstance[] = [];

    constructor() {}

    async init(imagePath: string) {
        this.flowerImg = await loadImage(imagePath);
        const mainRng = new SeededRandom(randomBytes(16).toString('hex'));
        const numSunflowers = mainRng.nextInt(2, 4);

        for (let i = 0; i < numSunflowers; i++) {
            const seed = randomBytes(16).toString('hex');
            const rng = new SeededRandom(seed);
            this.sunflowers.push({
                seed,
                rng,
                x: rng.nextFloat(100, CONFIG.width - 100),
                scale: rng.nextFloat(0.7, 1.1),
            });
        }
        // Sort by x position for a pleasing arrangement
        this.sunflowers.sort((a, b) => a.x - b.x);
    }

    async generatePhoto(outputPath: string) {
        this.render(1.0);
        fs.writeFileSync(outputPath, this.canvas.toBuffer('image/png'));
    }

    async generateVideo(outputPath: string) {
        const ffmpegArgs = [
            '-y',
            '-f', 'image2pipe',
            '-r', `${CONFIG.fps}`,
            '-i', '-',
            '-c:v', 'libvpx-vp9',
            '-b:v', '4M',
            '-pix_fmt', 'yuva420p',
            '-auto-alt-ref', '0',
            outputPath
        ];

        console.log(`🎥 Spawning FFmpeg process: ${outputPath}`);
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        ffmpeg.stderr.on('data', (data) => {
            // You can uncomment the next line to see ffmpeg's progress
            // process.stderr.write(data);
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ Video generation complete! Saved to ${outputPath}`);
            } else {
                console.error(`FFmpeg exited with code ${code}`);
            }
        });

        const totalFrames = CONFIG.durationSeconds * CONFIG.fps;
        for (let frame = 0; frame < totalFrames; frame++) {
            const rawProgress = frame / (totalFrames - 1);
            // Apply an ease-in-out sine function for a calmer, smoother growth
            const progress = -(Math.cos(Math.PI * rawProgress) - 1) / 2;
            this.render(progress);
            const buffer = this.canvas.toBuffer('image/png');
            const ok = ffmpeg.stdin.write(buffer);
            if (!ok) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
            
            if (frame % CONFIG.fps === 0) {
                const percent = Math.round(rawProgress * 100);
                process.stdout.write(`\rRendering... ${percent}%`);
            }
        }
        process.stdout.write('\rRendering... 100%\n');

        ffmpeg.stdin.end();
        await new Promise<void>(resolve => ffmpeg.on('close', () => resolve()));
    }

    private render(progress: number) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);

        const baseY = 1050;
        
        // Sort flowers by scale to draw smaller ones in front.
        const sortedFlowers = [...this.sunflowers].sort((a, b) => a.scale - b.scale);

        for (const flower of sortedFlowers) {
            const totalHeight = 850 * flower.scale;
            // Stagger the start time of each flower slightly based on its position
            const stagger = flower.x / CONFIG.width * 0.001;
            const flowerProgress = Math.max(0, Math.min(1, (progress - stagger) / (1 - stagger)));
            if (flowerProgress > 0) {
                this.drawOrganicPlant(flower.rng, flower.x, baseY, totalHeight, flowerProgress);
            }
        }
    }

    private drawOrganicPlant(rng: SeededRandom, startX: number, startY: number, totalHeight: number, progress: number) {
        const ctx = this.ctx;
        const segments = 25;
        const segmentLen = totalHeight / segments;
        
        let points = [{ x: startX, y: startY, width: 35 * (totalHeight / 850) }];

        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const sway = Math.sin(i * 0.2 + rng.next()) * 10;
            const nod = t > 0.7 ? Math.pow(t - 0.7, 2) * 150 : 0; 
            
            const nextX = startX + sway + nod;
            const nextY = startY - (i * segmentLen);
            const width = 35 * (totalHeight / 850) * (1 - t * 0.6);

            points.push({ x: nextX, y: nextY, width });
        }

        // --- DRAW STEM ---
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const branchProgress = progress * (segments + 5); // Extend progress to allow leaves to grow from something
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
                const midX = p1.x + (p2.x - p1.x) * partial;
                const midY = p1.y + (p2.y - p1.y) * partial;
                ctx.lineTo(midX, midY);
            } else {
                ctx.lineTo(p2.x, p2.y);
            }
            ctx.stroke();
        }
        
        // --- DRAW LEAVES (after stem) ---
        for (let i = 1; i <= segments; i++) {
             if (i > 5 && i < segments - 3 && i % 4 === 0) {
                const point = points[i];
                if (!point) continue;

                const side = (i / 4) % 2 === 0 ? 1 : -1;
                const leafStartProgress = (i / segments) * 0.5; // Leaves start growing sooner
                if (progress > leafStartProgress) {
                    const leafProgress = Math.min(1, (progress - leafStartProgress) * 2.0);
                    this.drawRealisticLeaf(point.x, point.y, side, point.width, leafProgress);
                }
            }
        }

        const headStartProgress = 0.85;
        if (progress > headStartProgress) {
            const head = points[points.length - 1];
            if (!head) return;
            const headProgress = (progress - headStartProgress) / (1 - headStartProgress);
            const headScale = Math.sin(headProgress * Math.PI / 2); // Ease-in effect
            this.drawFlowerHead(head.x, head.y, headScale * (totalHeight / 850));
        }
    }

    private drawRealisticLeaf(x: number, y: number, side: number, stemWidth: number, progress: number) {
        if (progress <= 0) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x, y);

        const petioleLen = 60 * progress;
        const pEndX = side * petioleLen;
        const pEndY = 20 * progress;

        ctx.beginPath();
        ctx.strokeStyle = '#3d6625';
        ctx.lineWidth = stemWidth * 0.4;
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(side * 20, -10, pEndX, pEndY);
        ctx.stroke();

        const bladeStartProgress = 0.3;
        if (progress > bladeStartProgress) {
            const bladeProgress = (progress - bladeStartProgress) / (1 - bladeStartProgress);
            const leafScale = bladeProgress * 1.2;
            ctx.translate(pEndX, pEndY);
            ctx.rotate(side * 0.5 + 0.2);

            const s = 50 * leafScale;
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

    private drawFlowerHead(x: number, y: number, scale: number) {
        if (!this.flowerImg || scale <= 0) return;
        const ctx = this.ctx;
        const size = 320 * Math.min(1, scale);
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(0.3); 
        
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 5;

        // Draw a dummy shape to cast the shadow
        ctx.fillStyle = 'transparent'; // Don't draw the shape itself
        ctx.beginPath();
        ctx.arc(0, 0, size / 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        
        ctx.drawImage(this.flowerImg, -size / 2, -size / 4, size, size);
        
        ctx.restore();
    }
}

// --- RUN ---
async function main() {
    const grower = new RealisticSunflower();
    await grower.init('./assets/sunflower.png');

    if (CONFIG.photoOnly) {
        await grower.generatePhoto(CONFIG.imageFilename);
        console.log(`✨ Aesthetic Sunflower field generated: ${CONFIG.imageFilename}`);
    } else {
        await grower.generateVideo(CONFIG.videoFilename);
        // Also save the final frame as a still image
        await grower.generatePhoto(CONFIG.imageFilename);
        console.log(`✨ Still image of final frame saved: ${CONFIG.imageFilename}`);
    }
}

main().catch(console.error);