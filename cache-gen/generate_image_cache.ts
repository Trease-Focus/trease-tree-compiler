import { writeFile, mkdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { entities } from '../src/entities';
import type { Config } from '../src/types/config';
import { generateGrid, type TreeConfig } from '../src/grid_image';

const BASE_SEED = '0';
const OUTPUT_DIR = path.join(__dirname, '..', 'cache', 'images');

/**
 * SingleGridGenerator - Generates a single grid structure for each entity
 * and saves it under samples/single_grid
 */
export class SingleGridGenerator {
    private baseSeed: string;
    private outputDir: string;

    constructor(baseSeed: string = BASE_SEED, outputDir: string = OUTPUT_DIR) {
        this.baseSeed = baseSeed;
        this.outputDir = outputDir;
    }

    private getSeed(index: number): string {
        return `${this.baseSeed}${index.toString().padStart(4, '0')}`;
    }

    private async ensureOutputDir(): Promise<void> {
        if (!existsSync(this.outputDir)) {
            await mkdir(this.outputDir, { recursive: true });
            console.log(`✅ Created output directory: ${this.outputDir}`);
        }
    }

    private async generateSingleGrid(entityName: string, index: number, imagePath: string): Promise<void> {
        const outputPath = path.join(this.outputDir, `${entityName}_${index}_grid.png`);

        const treeConfig: TreeConfig = {
            imagePath,
            gridX: 0,
            gridY: 0,
            scale: 1
        };

        await generateGrid({
            trees: [treeConfig],
            outputFilename: outputPath,
            filter: 'winter'
        });
    }

    async generateAll(): Promise<void> {
        console.log(`\n🌳 Single Grid Generator`);
        console.log(`   Base Seed: ${this.baseSeed}`);
        console.log(`   Output: ${this.outputDir}\n`);

        await this.ensureOutputDir();

        console.log(`📦 Generating grids for ${entities.size} entities...\n`);

        for (const [entityName, entity] of entities) {
            const numVariations = entity.variants;
            console.log(`🔄 Processing: ${entityName} (${numVariations} variants)`);

            for (let i = 0; i < numVariations; i++) {
                const seed = this.getSeed(i);
                const entityConfig: Config = {
                    photoOnly: true,
                    width: 480,
                    height: 480,
                    fps: 25,
                    durationSeconds: 30,
                    seed: seed,
                    filename: 'video.webm',
                    imageFilename: 'image.png',
                    padding: 80,
                    save_as_file: true
                };

                try {
                    const result = await entity.generate.generate(null as any, undefined, entityConfig);
                    const tempPath = path.join(this.outputDir, `${entityName}_${i}.png`);

                    if (result.imagePath) {
                        await copyFile(result.imagePath, tempPath);
                        await this.generateSingleGrid(entityName, i, result.imagePath);
                    } else if (result.imageBuffer) {
                        await writeFile(tempPath, result.imageBuffer);
                        await this.generateSingleGrid(entityName, i, tempPath);
                    }
                } catch (error) {
                    console.error(`  ✗ Error generating ${entityName}_${i}:`, error);
                    
                    const samplePath = path.join(__dirname, '..', 'samples', `${entityName}.png`);
                    if (existsSync(samplePath)) {
                        console.log(`  ℹ Falling back to existing sample: ${samplePath}`);
                        await this.generateSingleGrid(entityName, i, samplePath);
                    }
                }
            }
            console.log(`  ✓ Generated ${numVariations} variations for ${entityName}`);
        }

        console.log(`\n✅ Single grid generation complete!`);
        console.log(`   Output directory: ${this.outputDir}\n`);
    }

    async generateForEntity(entityName: string): Promise<void> {
        await this.ensureOutputDir();

        const entity = entities.get(entityName);
        if (!entity) {
            console.error(`Entity "${entityName}" not found. Available entities:`);
            for (const name of entities.keys()) {
                console.log(`  - ${name}`);
            }
            return;
        }

        const numVariations = entity.variants;
        console.log(`\n🌳 Single Grid Generator - ${entityName}`);
        console.log(`   Base Seed: ${this.baseSeed}`);
        console.log(`   Variations: ${numVariations}\n`);

        console.log(`🔄 Processing: ${entityName}`);

        for (let i = 0; i < numVariations; i++) {
            const seed = this.getSeed(i);
            const entityConfig: Config = {
                photoOnly: true,
                width: 480,
                height: 480,
                fps: 25,
                durationSeconds: 30,
                seed: seed,
                filename: 'video.webm',
                imageFilename: 'image.png',
                padding: 80,
                save_as_file: true
            };

            try {
                const result = await entity.generate.generate(null as any, undefined, entityConfig);
                const tempPath = path.join(this.outputDir, `${entityName}_${i}.png`);

                if (result.imagePath) {
                    await copyFile(result.imagePath, tempPath);
                    await this.generateSingleGrid(entityName, i, result.imagePath);
                } else if (result.imageBuffer) {
                    await writeFile(tempPath, result.imageBuffer);
                    await this.generateSingleGrid(entityName, i, tempPath);
                }
            } catch (error) {
                console.error(`  \u2717 Error generating ${entityName}_${i}:`, error);
            }
        }

        console.log(`  \u2713 Generated ${numVariations} variations`);
        console.log(`\n✅ Done!`);
    }
}

async function main() {
    const generator = new SingleGridGenerator(BASE_SEED, OUTPUT_DIR);
    const entityArg = process.argv[2];
    
    if (entityArg) {
        await generator.generateForEntity(entityArg);
    } else {
        await generator.generateAll();
    }
}

main().catch(console.error);
