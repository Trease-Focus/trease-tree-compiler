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


const defaultEntity: Entity = {
    name: "Tree",
    description: "A generic tree.",
    creator: "Nethical",
    donate: "https://digipaws.life/donate",
    variants: 1,
    basePrice: 100,
    generate: new Tree(),
    isGrowable: true
};

export const entities: Map<string, Entity> = new Map<string, Entity>([
    ["tree", {
        ...defaultEntity,
    }],
    ["sakura", {
        ...defaultEntity,
        name: "Sakura",
        description: "A beautiful cherry blossom tree.",
        basePrice: 150,
        generate: new Sakura(),
    }],
    ["sunflower", {
        ...defaultEntity,
        name: "Sunflower",
        description: "A bright sunflower.",
        basePrice: 50,
        generate: new Sunflower(),
    }],
    ["cedar", {
        ...defaultEntity,
        name: "Cedar",
        description: "A tall cedar tree.",
        basePrice: 60,
        generate: new Cedar(),
    }],
    ["lavender", {
        ...defaultEntity,
        name: "Lavender",
        description: "Fragrant lavender plant.",
        basePrice: 100,
        generate: new Lavender(),
    }],
    ["pink_balls_tree", {
        ...defaultEntity,
        name: "Pink Balls Tree",
        description: "A tree with pink ball-shaped flowers.",
        basePrice: 130,
        generate: new PinkBallsTree(),
    }],
    ["maple", {
        ...defaultEntity,
        name: "Maple",
        description: "A colorful maple tree.",
        basePrice: 150,
        generate: new Maple(),
    }],
    ["wisteria", {
        ...defaultEntity,
        name: "Wisteria",
        description: "A cascading wisteria vine.",
        basePrice: 150,
        generate: new Wisteria(),
    }],
    ["weeping_willow", {
        ...defaultEntity,
        name: "Weeping Willow",
        description: "A graceful weeping willow tree.",
        basePrice: 150,
        generate: new WeepingWillow(),
    }],
    ["lit_tree", {
        ...defaultEntity,
        name: "Lit Tree",
        description: "A christmas tree with lights.",
        basePrice: 200,
        generate: new LocalEntity({ videoFilename: "lit_tree" }),
    }],
    ["weathered", {
        ...defaultEntity,
        name: "Weathered Tree",
        description: "A tree that has weathered many storms.",
        basePrice: 180,
        generate: new Weathered(),
        isGrowable: false
    }]
]);