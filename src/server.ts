import Bao from "baojs";
import { randomBytes } from "crypto";
import { DEFAULT_CONFIG, type Config } from "./types/config";
import { entities } from "./entities";

const app = new Bao();

app.get("/", (ctx) => {
  return ctx.sendText("Hello World!");
});

app.get("/image", async (ctx) => {
    const url = new URL(ctx.req.url);
    const config: Config = {
        ...DEFAULT_CONFIG,
        photoOnly: true,
        seed: url.searchParams.get("seed") || randomBytes(16).toString('hex'),
    };
    const generator = entities.get(url.searchParams.get("type") || "tree");
    if (!generator) {
        return ctx.sendText("Generator not found", {status: 404});
    }
    const result = await generator.generate(config);
    if (!result.imageBuffer) {
        return ctx.sendText("Image generation failed", {status: 500});
    }

    return ctx.sendRaw(new Response(result.imageBuffer, { headers: { 'Content-Type': 'image/png',  } }));
});


app.get("/treeInfo", async (ctx) => {
    const url = new URL(ctx.req.url);
    const config: Config = {
        ...DEFAULT_CONFIG,
        photoOnly: true,
        seed: url.searchParams.get("seed") || randomBytes(16).toString('hex'),
    };
    const generator = entities.get("tree");
    if (!generator) {
        return ctx.sendText("Generator not found", {status: 404});
    }
    const result = await generator.getInfo(config);
    if (!result.trunkStartPosition) {
        return ctx.sendText("Tree info generation failed", {status: 500});
    }

    return ctx.sendJson({
        trunkStartPosition: result.trunkStartPosition
    });
});

const server = app.listen({ port: 3000 });

console.log(`Server listening on http://localhost:${server.port}`);
