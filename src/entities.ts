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
import { Weathered } from "./entities/weathered";

export const entities: Map<string, Entity> = new Map<string, Entity>([
    ["tree", {
        name: "Tree",
        description: "A generic tree.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 4,
        basePrice: 100,
        generate: new Tree(),
        isGrowable: true
    }],
    ["sakura", {
        name: "Sakura",
        description: "A beautiful cherry blossom tree.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 5,
        basePrice: 150,
        generate: new Sakura(),
        isGrowable: true

    }],
    ["sunflower", {
        name: "Sunflower",
        description: "A bright sunflower.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 9,
        basePrice: 50,
        generate: new Sunflower(),
        isGrowable: true
    }],
    ["cedar", {
        name: "Cedar",
        description: "A tall cedar tree.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 8,
        basePrice: 60,
        generate: new Cedar(),
        isGrowable: true
    }],
    ["lavender", {
        name: "Lavender",
        description: "Fragrant lavender plant.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 7,
        basePrice: 100,
        generate: new Lavender(),
        isGrowable: true
    }],
    ["pink_balls_tree", {
        name: "Pink Balls Tree",
        description: "A tree with pink ball-shaped flowers.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 9,
        basePrice: 130,
        generate: new PinkBallsTree(),
        isGrowable: true
    }],
    ["maple", {
        name: "Maple",
        description: "A colorful maple tree.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 10,
        basePrice: 150,
        generate: new Maple(),
        isGrowable: true
    }],
    ["wisteria", {
        name: "Wisteria",
        description: "A cascading wisteria vine.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 10,
        basePrice: 150,
        generate: new Wisteria(),
        isGrowable: true
    }],
    ["weeping_willow", {
        name: "Weeping Willow",
        description: "A graceful weeping willow tree.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 9,
        basePrice: 150,
        generate: new WeepingWillow(),
        isGrowable: true
    }],
    ["lit_tree", {
        name: "Lit Tree",
        description: "A christmas tree with lights.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 1,
        basePrice: 200,
        generate: new LocalEntity({ videoFilename: "lit_tree" }),
        isGrowable: true
    }],[
    "weathered", {
        name: "Weathered Tree",
        description: "A tree that has weathered many storms.",
        creator: "Nethical",
        donate: "https://digipaws.life/donate",
        variants: 5,
        basePrice: 180,
        generate: new Weathered(),
        isGrowable: false
    }
]
]);