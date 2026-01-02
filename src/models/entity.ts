import type { Generate } from "./generate";

export interface Entity {
    name: string;
    description: string;
    creator: string;
    donate: string;
    variants: number;
    basePrice: number;
    generate: Generate;
}