import type { Generate } from "./models/generate";
import { Tree } from "./entities/tree";

export
const entities: Map<string, Generate> = new Map<string, Generate>([
    ["tree", new Tree()],
]);