import { mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { entities } from '../src/entities';
import type { Config } from '../src/types/config';
import { generateGridVideo } from '../src/grid_video';

const BASE_SEED = '0';
const OUTPUT_DIR = path.join(__dirname, '..', 'cache', 'video');
const IMAGES_DIR = path.join(__dirname, '..', 'cache', 'images');
const TREE_SCALE = 1;

/**
 * VideoGenerator - Generates videos for each entity
 * and saves them under cache/video
 */
export class VideoGenerator {
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

    async generateAll(): Promise<void> {
        console.log(`\n🎬 Video Generator`);
        console.log(`   Base Seed: ${this.baseSeed}`);
        console.log(`   Output: ${this.outputDir}\n`);

        await this.ensureOutputDir();

        console.log(`📦 Generating videos for ${entities.size} entities...\n`);

        for (const [entityName, entity] of entities) {
            const numVariations = entity.variants;
            console.log(`🔄 Processing: ${entityName} (${numVariations} variants)`);

            for (let i = 0; i < numVariations; i++) {
                const seed = this.getSeed(i);
                const entityConfig: Config = {
                    photoOnly: false,
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

                    if (result.videoPath) {
                        const treePngPath = path.join(IMAGES_DIR, `${entityName}_${i}.png`);
                        const gridOutputPath = path.join(this.outputDir, `${entityName}_${i}.webm`);
                        
                        await generateGridVideo(treePngPath, result.videoPath, gridOutputPath, TREE_SCALE,"winter");
                        
                        // Delete the original non-grid video
                        if (existsSync(result.videoPath) && result.videoPath.includes('/cache/')) {
                            await unlink(result.videoPath);
                        }
                    } else {
                        console.error(`  ✗ No video generated for ${entityName}_${i}`);
                    }
                } catch (error) {
                    console.error(`  ✗ Error generating ${entityName}_${i}:`, error);
                }
            }
            console.log(`  ✓ Generated ${numVariations} variations for ${entityName}`);
        }

        console.log(`\n✅ Video generation complete!`);
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
        console.log(`\n🎬 Video Generator - ${entityName}`);
        console.log(`   Base Seed: ${this.baseSeed}`);
        console.log(`   Variations: ${numVariations}\n`);

        console.log(`🔄 Processing: ${entityName}`);

        for (let i = 0; i < numVariations; i++) {
            const seed = this.getSeed(i);
            const entityConfig: Config = {
                photoOnly: false,
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

                if (result.videoPath) {
                    const treePngPath = path.join(IMAGES_DIR, `${entityName}_${i}.png`);
                    const gridOutputPath = path.join(this.outputDir, `${entityName}_${i}.webm`);
                    
                    await generateGridVideo(treePngPath, result.videoPath, gridOutputPath, TREE_SCALE,"winter");
                    
                    // Delete the original non-grid video
                    if (existsSync(result.videoPath) && result.videoPath.includes('/cache/')) {
                        await unlink(result.videoPath);
                    }
                } else {
                    console.error(`  ✗ No video generated for ${entityName}_${i}`);
                }
            } catch (error) {
                console.error(`  ✗ Error generating ${entityName}_${i}:`, error);
            }
        }

        console.log(`  ✓ Generated ${numVariations} variations`);
        console.log(`\n✅ Done!`);
    }
}

async function main() {
    const generator = new VideoGenerator(BASE_SEED, OUTPUT_DIR);
    const entityArg = process.argv[2];

    if (entityArg) {
        await generator.generateForEntity(entityArg);
    } else {
        await generator.generateAll();
    }
}

main().catch(console.error);
