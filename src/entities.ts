import type { Generate } from "./models/generate";
import { Tree } from "./entities/tree";
import { Sunflower } from "./entities/sunflower";

export
const entities: Map<string, Generate> = new Map<string, Generate>([
    ["tree", new Tree()],
    ["sunflower", new Sunflower()],
]);