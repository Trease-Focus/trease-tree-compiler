import type { Config } from "../types/config";
import type { GeneratorResult } from "../types/generator-result";

export interface Generate {
    generate(CONFIG?: Config): Promise<GeneratorResult>;
    getInfo(Config?: Config): Promise<GeneratorResult>;
}