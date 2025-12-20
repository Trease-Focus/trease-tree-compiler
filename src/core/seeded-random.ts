import { createHash, randomBytes } from 'crypto';

export class SeededRandom {
    private seed: number;

    constructor(seedString: string) {
        const hash = createHash('sha256').update(seedString).digest('hex');
        this.seed = parseInt(hash.substring(0, 15), 16);
    }

    next(): number {
        this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
        return this.seed / 4294967296;
    }

    nextFloat(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    nextInt(min: number, max: number): number {
        return Math.floor(this.nextFloat(min, max));
    }
}