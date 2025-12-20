import { randomBytes } from "crypto";

export type Config = {
    photoOnly: boolean;  // If true, only generate a final image
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
    seed: string;
    filename: string;
    imageFilename: string;
    padding: number;
    save_as_file: boolean;
}
export const DEFAULT_CONFIG: Config = {
    photoOnly: true,
    width: 1080, 
    height: 1080,
    fps: 30, 
    durationSeconds: 30, 
    seed: randomBytes(16).toString('hex'), // Random seed for unique tree", 
    filename: "video.webm",
    imageFilename: "image.png",
    padding: 80, // Padding from edges
    save_as_file: false,
};