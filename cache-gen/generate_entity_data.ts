import { entities } from "../src/entities";
import { writeFileSync } from "fs";
import { join } from "path";

const entityIds = Array.from(entities.keys());

const entityList = entityIds.map(id => {
    const entity = entities.get(id)!;
    return {
        id,
        name: entity.name,
        description: entity.description,
        creator: entity.creator,
        donate: entity.donate,
        variants: entity.variants,
        basePrice: entity.basePrice
    };
});

const outputPath = join(__dirname, "../cache/entity_data.json");

const data = {
    entities: entityList,
    count: entityList.length
};

writeFileSync(outputPath, JSON.stringify(data, null, 2));

console.log(`Generated entity data with ${entityList.length} entities:`);
entityList.forEach(e => console.log(`  - ${e.id}: ${e.name} (${e.variants} variants, $${e.basePrice})`));
