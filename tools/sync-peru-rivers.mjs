import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const endpoint = "https://www.idep.gob.pe/geoportal/rest/services/DATOS_GEOESPACIALES/PER%C3%9A_500K/MapServer/23/query";
const params = new URLSearchParams({
  where: "Nombre IS NOT NULL AND Nombre <> ' ' AND Rasgo_Prin LIKE 'Río%'",
  outFields: "Nombre",
  returnGeometry: "false",
  returnDistinctValues: "true",
  orderByFields: "Nombre",
  f: "json",
});

const response = await fetch(`${endpoint}?${params}`);
if (!response.ok) throw new Error(`El catálogo IGN respondió ${response.status}`);
const payload = await response.json();
if (payload.error) throw new Error(payload.error.message || "No fue posible consultar el catálogo IGN");

const smallWords = new Set(["de", "del", "la", "las", "los", "y"]);
function normalizeName(raw) {
  const cleaned = String(raw).normalize("NFC").replace(/\s+/g, " ").trim();
  const withoutPrefix = cleaned.replace(/^r[íi]o\s+/iu, "");
  const words = withoutPrefix.toLocaleLowerCase("es-PE").split(" ");
  const title = words.map((word, index) => index > 0 && smallWords.has(word) ? word : `${word.charAt(0).toLocaleUpperCase("es-PE")}${word.slice(1)}`).join(" ");
  return `Río ${title}`;
}

const names = [...new Set(payload.features.map(({ attributes }) => normalizeName(attributes.Nombre)).filter(name => name.length > 4))]
  .sort((a, b) => a.localeCompare(b, "es-PE"));

if (!names.includes("Río Huallaga")) throw new Error("El catálogo oficial no contiene el Río Huallaga");

const source = `// Catálogo generado desde la cartografía oficial IGN a escala 1:500 000.\n` +
  `// Fuente: ${endpoint.replace("/query", "")}\n` +
  `export const PERU_RIVERS = ${JSON.stringify(names, null, 2)};\n`;

await mkdir(resolve(root, "data"), { recursive: true });
await writeFile(resolve(root, "data", "peru-rivers.js"), source, "utf8");
console.log(`${names.length} ríos incorporados al catálogo nacional.`);
