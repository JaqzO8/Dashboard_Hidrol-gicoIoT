import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// Servir únicamente el artefacto compilado; nunca secretos, firmware, BD o Git.
const root = join(dirname(fileURLToPath(import.meta.url)), "_site");
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

createServer(async (req, res) => {
  try {
    const requested = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    const relative = requested === "/" ? "index.html" : requested.slice(1);
    const file = normalize(join(root, relative));
    if (!file.startsWith(normalize(root) + (process.platform === "win32" ? "\\" : "/")) || relative.split(/[\\/]/).some(segment => segment.startsWith("."))) throw new Error("Ruta no permitida");
    if (!(await stat(file)).isFile()) throw new Error("No encontrado");
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("No encontrado");
  }
}).listen(port, "127.0.0.1", () => console.log(`SITPA disponible en http://localhost:${port}`));
