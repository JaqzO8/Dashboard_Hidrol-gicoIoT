import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "dist");
const client = resolve(root, ".sites-client");
const vite = resolve(root, "node_modules", "vite", "bin", "vite.js");

await rm(dist, { recursive: true, force: true });
await rm(client, { recursive: true, force: true });
await exec(process.execPath, [vite, "build", "--outDir", client, "--emptyOutDir"], { cwd: root });
await mkdir(resolve(dist, "server"), { recursive: true });

async function filesWithin(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesWithin(path) : [path];
  }))).flat();
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const assets = {};
for (const file of await filesWithin(client)) {
  const pathname = `/${relative(client, file).replaceAll("\\", "/")}`;
  assets[pathname] = {
    body: (await readFile(file)).toString("base64"),
    type: mime[extname(file).toLowerCase()] || "application/octet-stream",
  };
}

const worker = `const ASSETS = ${JSON.stringify(assets)};
const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const asset = ASSETS[pathname];
    if (!asset) return new Response("No encontrado", { status: 404 });
    const immutable = pathname.startsWith("/assets/");
    return new Response(decode(asset.body), { headers: {
      "content-type": asset.type,
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      "content-security-policy": "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://api.thingspeak.com; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-content-type-options": "nosniff"
    }});
  }
};`;

await writeFile(resolve(dist, "server", "index.js"), worker, "utf8");
await rm(client, { recursive: true, force: true });
console.log(`Producción modular generada: ${dist}`);
