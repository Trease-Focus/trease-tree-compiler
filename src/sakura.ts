import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import { spawn } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';

// --- CONFIGURATION ---
const CONFIG = {
    photoOnly: false, 
    width: 1080, 
    height: 1080,
    fps: 30, 
    durationSeconds: 15, 
    seed: randomBytes(16).toString('hex'),
    filename: "sakura_growth.webm",
    imageFilename: "sakura_final.png",
    padding: 150
};

// --- MATH & UTILS ---

class Vector2 {
    constructor(public x: number, public y: number) {}
}

class SeededRandom {
    private seed: number;
    constructor(seedString: string) {
        const hash = createHash('sha256').update(seedString).digest('hex');
        this.seed = parseInt(hash.substring(0, 15), 16);
    }
    next(): number {
        this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
        return this.seed / 4294967296;
    }
    nextFloat(min: number, max: number): number { return min + this.next() * (max - min); }
    nextInt(min: number, max: number): number { return Math.floor(this.nextFloat(min, max)); }
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
    ) {}
}

// --- GENERATION LOGIC ---

function drawPetalShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    // A simple teardrop/heart-ish petal
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size, -size, -size/2, -size * 1.5, 0, -size * 0.8);
    ctx.bezierCurveTo(size/2, -size * 1.5, size, -size, 0, 0);
    ctx.fill();
    ctx.restore();
}

function generateSakura(
    rand: SeededRandom,
    start: Vector2,
    length: number,
    angle: number,
    depth: number,
    dist: number
): Branch {
    const rad = angle * (Math.PI / 180);
    const end = new Vector2(
        start.x + Math.cos(rad) * length,
        start.y + Math.sin(rad) * length
    );

    // Curvy branches
    const mid = new Vector2((start.x + end.x) / 2, (start.y + end.y) / 2);
    const perp = (rand.next() - 0.5) * length * 0.4;
    const control = new Vector2(
        mid.x + Math.cos(rad + Math.PI/2) * perp,
        mid.y + Math.sin(rad + Math.PI/2) * perp
    );

    const children: Branch[] = [];
    const entities: Entity[] = [];

    if (depth > 0) {
        const numChildren = depth === 1 ? rand.nextInt(3, 5) : rand.nextInt(2, 3);
        for (let i = 0; i < numChildren; i++) {
            const newAngle = angle + rand.nextFloat(-35, 35);
            const newLen = length * rand.nextFloat(0.7, 0.85);
            children.push(generateSakura(rand, end, newLen, newAngle, depth - 1, dist + length));
        }
    }

    // Only add blossoms on outer branches (Pinterest look)
    if (depth < 4) {
        const clusterSize = rand.nextInt(5, 12);
        for (let i = 0; i < clusterSize; i++) {
            const t = rand.nextFloat(0.5, 1.0); // Focus blossoms at tips
            const pX = (1-t)*(1-t)*start.x + 2*(1-t)*t*control.x + t*t*end.x;
            const pY = (1-t)*(1-t)*start.y + 2*(1-t)*t*control.y + t*t*end.y;
            
            entities.push({
                center: new Vector2(pX + rand.nextFloat(-20, 20), pY + rand.nextFloat(-20, 20)),
                radius: rand.nextFloat(4, 8),
                color: rand.next() > 0.3 ? '#FFD1DC' : '#FFF0F5', // Soft Pink / Lavender Blush
                secondaryColor: '#FFB7C5',
                distFromRoot: dist + (length * t),
                rotation: rand.nextFloat(0, Math.PI * 2)
            });
        }
    }

    return new Branch(start, end, control, depth * 2.5 + 1, dist, length, children, entities);
}

// --- RENDERING ---

async function run() {
    const canvas = createCanvas(CONFIG.width, CONFIG.height);
    const ctx = canvas.getContext('2d');
    const rand = new SeededRandom(CONFIG.seed);
    
    // Position root at bottom center
    const tree = generateSakura(rand, new Vector2(CONFIG.width / 2, CONFIG.height - 100), 180, -90, 7, 0);

    const fallingPetals: Petal[] = [];
    const ffmpeg = CONFIG.photoOnly ? null : spawn('ffmpeg', [
        '-y', '-f', 'image2pipe', '-r', `${CONFIG.fps}`, '-i', '-', 
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', CONFIG.filename
    ]);

    const totalFrames = CONFIG.fps * CONFIG.durationSeconds;
    const maxDist = 1500; // Estimated max growth distance

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
                    if (currentGrowthDist > e.distFromRoot + 50) {
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
            fallingPetals.push({
                x: rand.nextFloat(0, CONFIG.width),
                y: -20,
                size: rand.nextFloat(3, 6),
                rotation: rand.nextFloat(0, Math.PI * 2),
                velocity: new Vector2(rand.nextFloat(-1, 1), rand.nextFloat(1, 3)),
                active: true,
                color: '#FFD1DC'
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
            ffmpeg.stdin.write(canvas.toBuffer('image/png'));
        }
        
        if (f % 30 === 0) console.log(`Rendering: ${Math.round(t * 100)}%`);
    }

    if (ffmpeg) {
        ffmpeg.stdin.end();
        await new Promise<void>((resolve, reject) => {
            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    console.log("🌸 Video Saved as sakura_growth.webm");
                    resolve();
                } else {
                    reject(new Error(`ffmpeg exited with code ${code}`));
                }
            });
            ffmpeg.on('error', reject);
        });
    }
    
    fs.writeFileSync(CONFIG.imageFilename, canvas.toBuffer('image/png'));
    console.log("📸 Final Frame Saved as sakura_final.png");
}

run();