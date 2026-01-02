import type { Generate } from "./models/generate";
import { Tree } from "./entities/tree";
import { Sunflower } from "./entities/sunflower";
import { Cedar } from "./entities/cedar";
import { Sakura } from "./entities/sakura";
import { Lavender } from "./entities/lavendar";
import { PinkBallsTree } from "./entities/pink-balls-tree";
import {  WeepingWillow } from "./entities/weeping-willow";
import { Maple } from "./entities/maple";
import { Wisteria } from "./entities/wisteria";
import type { Entity } from "./models/entity";
import { LocalEntity } from "./entities/local-entity";

export const entities: Map<string, Entity> = new Map<string, Entity>([
    ["tree", {
        name: "Tree",
        description: "A generic tree.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 50,
        basePrice: 100,
        generate: new Tree()
    }],
    ["sakura", {
        name: "Sakura",
        description: "A beautiful cherry blossom tree.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 50,
        basePrice: 150,
        generate: new Sakura()
    }],
    ["sunflower", {
        name: "Sunflower",
        description: "A bright sunflower.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 50,
        basePrice: 100,
        generate: new Sunflower()
    }],
    ["cedar", {
        name: "Cedar",
        description: "A tall cedar tree.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 50,
        basePrice: 120,
        generate: new Cedar()
    }],
    ["lavender", {
        name: "Lavender",
        description: "Fragrant lavender plant.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 50,
        basePrice: 100,
        generate: new Lavender()
    }],
    ["pink_balls_tree", {
        name: "Pink Balls Tree",
        description: "A tree with pink ball-shaped flowers.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 50,
        basePrice: 130,
        generate: new PinkBallsTree()
    }],
    ["maple", {
        name: "Maple",
        description: "A colorful maple tree.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 50,
        basePrice: 150,
        generate: new Maple()
    }],
    ["wisteria", {
        name: "Wisteria",
        description: "A cascading wisteria vine.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 50,
        basePrice: 150,
        generate: new Wisteria()
    }],
    ["weeping_willow", {
        name: "Weeping Willow",
        description: "A graceful weeping willow tree.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 50,
        basePrice: 150,
        generate: new WeepingWillow()
    }],
    ["lit_tree", {
        name: "Local Video",
        description: "Generate from a local video file.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 1,
        basePrice: 200,
        generate: new LocalEntity({ videoFilename: "lit_tree" })
    }]
]);