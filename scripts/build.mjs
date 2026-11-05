// Empaqueta los archivos de site/ dentro del Worker (globalThis.__ASSETS).
// Salida: dist/index.js, que es lo que publica `wrangler deploy`.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, relative, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SITE = join(ROOT, "site");
const DIST = join(ROOT, "dist");
const BINARY = new Set([".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff2"]);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (!e.name.startsWith(".")) out.push(p);
  }
  return out;
}

const assets = {};
for (const file of await walk(SITE)) {
  const key = "/" + relative(SITE, file).split("\\").join("/");
  const bin = BINARY.has(extname(file).toLowerCase());
  const buf = await readFile(file);
  assets[key] = bin ? { b64: true, data: buf.toString("base64") } : { data: buf.toString("utf8") };
}

await mkdir(DIST, { recursive: true });
await writeFile(join(DIST, "assets.js"), `globalThis.__ASSETS = ${JSON.stringify(assets)};\n`);
await writeFile(join(DIST, "index.js"), `import "./assets.js";\nexport { default } from "../src/worker.js";\n`);
console.log(`build: ${Object.keys(assets).length} archivos → dist/`);
