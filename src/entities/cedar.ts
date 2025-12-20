import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import { spawn } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';

// --- CONFIGURATION ---
const CONFIG = {
    photoOnly: true, 
    width: 1080, 
    height: 1080,
    fps: 30, 
    durationSeconds: 12, 
    seed: randomBytes(16).toString('hex'), 
    filename: "perfect_fit_cedar.webm",
    imageFilename: "cedar_render.png",
    padding: 100 
};

// --- MATH HELPERS ---
class Vector2 { constructor(public x: number, public y: number) {} }

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

interface Color { r: number; g: number; b: number; a: number; }
interface Entity {
    center: Vector2; radius: number;
    baseColor: Color; highlightColor: Color;
    distFromRoot: number; opacity?: number;
}

class Branch {
    constructor(
        public start: Vector2, public end: Vector2,
        public strokeWidth: number, public control: Vector2,
        public length: number, public distFromRoot: number,
        public children: Branch[] = [], public entities: Entity[] = []
    ) {}
}

class SimpleBranch {
    constructor(public start: Vector2, public end: Vector2, public strokeWidth: number, public control: Vector2) {}
}

interface Bounds { minX: number; maxX: number; minY: number; maxY: number; }

const coerceIn = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));
const smoothStep = (t: number): number => t * t * (3 - 2 * t);

// --- GENERATION ---

function generateCedar(
    rand: SeededRandom, start: Vector2, length: number, angle: number,
    depth: number, currentDist: number, isTrunk: boolean = true
): Branch {
    const radAngle = angle * (Math.PI / 180);
    const end = new Vector2(
        start.x + length * Math.cos(radAngle),
        start.y + length * Math.sin(radAngle)
    );

    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const offset = isTrunk ? rand.nextFloat(-12, 12) : rand.nextFloat(-25, 25);
    const control = new Vector2(midX + offset, midY + offset);

    if (isTrunk && depth === 8) {
        console.log(`Trunk started at position: (${control.x}, ${control.y})`);
    }

    // EVEN BIGGER TRUNK: Significant base girth that tapers
    const strokeWidth = isTrunk 
        ? (depth * depth * 1.1) + 18 
        : (depth * 4) + 2;

    const children: Branch[] = [];
    const entities: Entity[] = [];

    if (depth > 0) {
        if (isTrunk) {
            // Main vertical trunk
            children.push(generateCedar(rand, end, length * 0.82, angle + rand.nextFloat(-6, 6), depth - 1, currentDist + length, true));
            
            // Side tiers (horizontal)
            const tierCount = rand.nextInt(2, 4);
            for (let i = 0; i < tierCount; i++) {
                const sideAngle = rand.next() > 0.5 ? rand.nextFloat(-15, 5) : 175 + rand.nextFloat(-5, 15);
                children.push(generateCedar(rand, end, length * 0.7, sideAngle, depth - 2, currentDist + length, false));
            }
        } else {
            // Lateral branching
            if (depth > 2) {
                children.push(generateCedar(rand, end, length * 0.65, angle + rand.nextFloat(-15, 15), depth - 1, currentDist + length, false));
            }
        }
    }

    // Foliage pads
    if (depth <= 4) {
        const leafCount = rand.nextInt(10, 40);
        for (let i = 0; i < leafCount; i++) {
            
                const rBase = 45 + rand.nextFloat(0, 20);   // Slight natural warmth
                const gBase = 110 + rand.nextFloat(0, 40);  // Strongest channel (green)
                const bBase = 30 + rand.nextFloat(0, 25);   // Earthy greens

            entities.push({
                center: new Vector2(end.x + rand.nextFloat(-60, 60), end.y + rand.nextFloat(-25, 25)),
                radius: rand.nextFloat(1, 10),
                baseColor: { r: rBase, g: gBase, b: bBase, a: 1.0 },
                highlightColor: { r: rBase + 40, g: gBase + 40, b: bBase + 40, a: 1.0 },
                distFromRoot: currentDist + length + rand.nextFloat(0, 150)
            });
        }
    }

    return new Branch(start, end, strokeWidth, control, length, currentDist, children, entities);
}

function calculateBounds(b: Branch, cur: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }): Bounds {
    [b.start, b.end, b.control].forEach(p => {
        cur.minX = Math.min(cur.minX, p.x); cur.maxX = Math.max(cur.maxX, p.x);
        cur.minY = Math.min(cur.minY, p.y); cur.maxY = Math.max(cur.maxY, p.y);
    });
    b.entities.forEach(e => {
        cur.minX = Math.min(cur.minX, e.center.x - e.radius); cur.maxX = Math.max(cur.maxX, e.center.x + e.radius);
        cur.minY = Math.min(cur.minY, e.center.y - e.radius); cur.maxY = Math.max(cur.maxY, e.center.y + e.radius);
    });
    b.children.forEach(c => calculateBounds(c, cur));
    return cur;
}

function flattenTree(b: Branch, bList: SimpleBranch[], eList: Entity[], progress: number, scale: number, ox: number, oy: number) {
    const ts = new Vector2(b.start.x * scale + ox, b.start.y * scale + oy);
    const te = new Vector2(b.end.x * scale + ox, b.end.y * scale + oy);
    const tc = new Vector2(b.control.x * scale + ox, b.control.y * scale + oy);

    if (progress > b.distFromRoot) {
        let localT = coerceIn((progress - b.distFromRoot) / b.length, 0, 1);
        const omt = 1 - localT;
        const curCx = omt * ts.x + localT * tc.x;
        const curCy = omt * ts.y + localT * tc.y;
        const q1x = omt * tc.x + localT * te.x;
        const q1y = omt * tc.y + localT * te.y;
        const curEx = omt * curCx + localT * q1x;
        const curEy = omt * curCy + localT * q1y;

        bList.push(new SimpleBranch(ts, new Vector2(curEx, curEy), b.strokeWidth * scale, new Vector2(curCx, curCy)));

        b.entities.forEach(e => {
            if (progress > e.distFromRoot) {
                const g = coerceIn((progress - e.distFromRoot) / 200, 0, 1);
                eList.push({ ...e, center: new Vector2(e.center.x * scale + ox, e.center.y * scale + oy), radius: e.radius * scale * smoothStep(g), opacity: g });
            }
        });
    }
    b.children.forEach(c => flattenTree(c, bList, eList, progress, scale, ox, oy));
}

// --- RENDER ---

async function run() {
    const canvas = createCanvas(CONFIG.width, CONFIG.height);
    const ctx = canvas.getContext('2d');
    const rand = new SeededRandom(CONFIG.seed);

    console.log("📐 Planning perfect-fit cedar structure...");
    const fullTree = generateCedar(rand, new Vector2(0,0), 220, -90, 8, 0);
    const bounds = calculateBounds(fullTree);
    
    // Auto-fit Logic
    const treeW = bounds.maxX - bounds.minX;
    const treeH = bounds.maxY - bounds.minY;
    const scale = Math.min((CONFIG.width - CONFIG.padding*2) / treeW, (CONFIG.height - CONFIG.padding*2) / treeH);
    const offX = (CONFIG.width / 2) - ((bounds.minX + treeW/2) * scale);
    const offY = (CONFIG.height - CONFIG.padding) - (bounds.maxY * scale);

    const ffmpeg = spawn('ffmpeg', [
        '-y', '-f', 'image2pipe', '-r', `${CONFIG.fps}`, '-i', '-',
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', CONFIG.filename
    ]);

    const totalFrames = CONFIG.durationSeconds * CONFIG.fps;
    const maxGrowth = 3500; 

    for (let f = 0; f <= totalFrames; f++) {
        const progress = (f / totalFrames) * maxGrowth;
        ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);

        const branches: SimpleBranch[] = [];
        const entities: Entity[] = [];
        flattenTree(fullTree, branches, entities, progress, scale, offX, offY);

        // Draw Bark
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#3e2723'; // Dark bark
        branches.forEach(b => {
            ctx.beginPath();
            ctx.lineWidth = b.strokeWidth;
            ctx.moveTo(b.start.x, b.start.y);
            ctx.quadraticCurveTo(b.control.x, b.control.y, b.end.x, b.end.y);
            ctx.stroke();
        });

        // Draw Foliage Ellipses
        entities.sort((a,b) => a.center.y - b.center.y);
        entities.forEach(e => {
            ctx.globalAlpha = e.opacity || 0;
            const g = ctx.createRadialGradient(e.center.x, e.center.y - e.radius*0.3, 0, e.center.x, e.center.y, e.radius);
            g.addColorStop(0, `rgb(${e.highlightColor.r},${e.highlightColor.g},${e.highlightColor.b})`);
            g.addColorStop(1, `rgb(${e.baseColor.r},${e.baseColor.g},${e.baseColor.b})`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(e.center.x, e.center.y, e.radius * 1.6, e.radius, 0, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.globalAlpha = 1.0;
        ffmpeg.stdin.write(canvas.toBuffer('image/png'));
        if (f % 30 === 0) process.stdout.write(`\rProgress: ${Math.round((f/totalFrames)*100)}%`);
    }

    ffmpeg.stdin.end();
    fs.writeFileSync(CONFIG.imageFilename, canvas.toBuffer('image/png'));
    console.log(`\n✨ Perfect cedar saved to ${CONFIG.filename}`);
}

run().catch(console.error);