import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";
const [database, station, output] = process.argv.slice(2);
if (!database || !station || !output) throw new Error("Uso: node tools/export-telemetry.mjs backend/data/sitpa.sqlite tingomaria-01 datos.json");
const db = new DatabaseSync(database, { readOnly: true });
try {
  const rows = db.prepare("SELECT data FROM telemetry WHERE station=? ORDER BY time,id").all(station).map(row => JSON.parse(row.data));
  writeFileSync(output, JSON.stringify(rows));
  console.log(`${rows.length} lecturas exportadas para evaluación local.`);
} finally { db.close(); }
