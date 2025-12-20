export type GeneratorResult = {
    videoPath?: string;
    imagePath?: string;
    imageBuffer?: Buffer;
    videoBuffer?: Buffer;
    trunkStartPosition?: { x: number; y: number; };
};