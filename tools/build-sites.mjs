import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "server"), { recursive: true });

const [sourceHtml, css, js] = await Promise.all([
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "styles.css"), "utf8"),
  readFile(resolve(root, "app.js"), "utf8"),
]);

const html = sourceHtml
  .replace(/\s*<link rel="stylesheet" href="styles\.css">/, `\n  <style>${css}</style>`)
  .replace(/\s*<script type="module" src="app\.js"><\/script>/, `\n  <script type="module">${js}<\/script>`);

const worker = `const HTML = ${JSON.stringify(html)};
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/" && url.pathname !== "/index.html") {
      return new Response("No encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    return new Response(HTML, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
        "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://api.thingspeak.com; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
      },
    });
  },
};
`;

await writeFile(resolve(dist, "server", "index.js"), worker, "utf8");
console.log(`Producción generada: ${dist}`);
