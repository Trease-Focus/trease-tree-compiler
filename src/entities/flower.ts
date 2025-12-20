import { createCanvas, CanvasRenderingContext2D, Image } from 'canvas';
import * as fs from 'fs';

// --- CONFIG ---
const CONFIG = {
    width: 1000,
    height: 1000,
    roseCount: 16,
    leafCount: 40,
    outputFilename: "aesthetic_rose_cluster.png"
};

// --- ASSET GENERATORS ---

/** Generates a high-quality stylized Rose texture */
function generateRoseTexture(size: number, hueBase: number): any {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;

    // Outer Petals (Darker, larger)
    for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((i * Math.PI) / 4);
        const grad = ctx.createRadialGradient(0, size * 0.2, 0, 0, size * 0.2, size * 0.4);
        grad.addColorStop(0, `hsl(${hueBase}, 80%, 70%)`);
        grad.addColorStop(1, `hsl(${hueBase}, 60%, 40%)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, size * 0.2, size * 0.35, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Inner Swirl Petals (Lighter, overlapping)
    for (let i = 0; i < 15; i++) {
        const angle = i * 0.9;
        const dist = i * (size * 0.02);
        const pSize = (size * 0.3) - (i * 2);
        
        ctx.save();
        ctx.translate(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist);
        ctx.rotate(angle + Math.PI / 2);
        
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, pSize);
        grad.addColorStop(0, `hsl(${hueBase}, 90%, 85%)`); // Bright highlight
        grad.addColorStop(1, `hsl(${hueBase}, 70%, 60%)`);
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, pSize, pSize * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        // Subtle petal edge
        ctx.strokeStyle = `rgba(255,255,255,0.3)`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }
    return canvas;
}

/** Generates a stylized leaf texture */
function generateLeafTexture(width: number, height: number): any {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#4CAF50');
    grad.addColorStop(1, '#1B5E20');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(width / 2, height);
    ctx.bezierCurveTo(0, height * 0.7, 0, height * 0.2, width / 2, 0);
    ctx.bezierCurveTo(width, height * 0.2, width, height * 0.7, width / 2, height);
    ctx.fill();
    
    // Vein
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2, height);
    ctx.lineTo(width / 2, 0);
    ctx.stroke();

    return canvas;
}

// --- MAIN COMPOSITOR ---

async function render() {
    const mainCanvas = createCanvas(CONFIG.width, CONFIG.height);
    const ctx = mainCanvas.getContext('2d');

    // 1. Prepare Textures (The PNG "Assets")
    const rosePink = generateRoseTexture(200, 340); // Pink
    const roseOrange = generateRoseTexture(200, 20); // Orange/Peach
    const leaf = generateLeafTexture(60, 100);

    const centerX = CONFIG.width / 2;
    const centerY = CONFIG.height / 2;

    // 2. Draw Leaves first (Background layer of the bush)
    for (let i = 0; i < CONFIG.leafCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 250;
        const x = centerX + Math.cos(angle) * dist;
        const y = centerY + Math.sin(angle) * dist;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + Math.PI / 2 + (Math.random() * 0.5));
        ctx.scale(0.8 + Math.random() * 0.5, 0.8 + Math.random() * 0.5);
        ctx.drawImage(leaf, -30, -50);
        ctx.restore();
    }

    // 3. Draw Flowers (Foreground layer)
    // We sort by Y position to ensure natural overlapping
    const flowerPositions = [];
    for (let i = 0; i < CONFIG.roseCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 200;
        flowerPositions.push({
            x: centerX + Math.cos(angle) * dist,
            y: centerY + Math.sin(angle) * dist,
            type: Math.random() > 0.5 ? rosePink : roseOrange,
            scale: 0.6 + Math.random() * 0.5,
            rotation: Math.random() * Math.PI * 2
        });
    }

    flowerPositions.sort((a, b) => a.y - b.y).forEach(f => {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rotation);
        ctx.scale(f.scale, f.scale);
        ctx.drawImage(f.type, -100, -100);
        ctx.restore();
    });

    // 4. Final Output
    const buffer = mainCanvas.toBuffer('image/png');
    fs.writeFileSync(CONFIG.outputFilename, buffer);
    console.log(`🌸 Asset-based flower generated: ${CONFIG.outputFilename}`);
}

render();