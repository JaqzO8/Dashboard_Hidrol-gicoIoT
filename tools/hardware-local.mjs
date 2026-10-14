import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { root, localDirectory } from "./hardware-config.mjs";
if (!existsSync(resolve(root, "_site/index.html"))) throw new Error("Ejecute npm run build:github primero");
if (!existsSync(resolve(localDirectory, "backend.env"))) throw new Error("Ejecute prepare:hardware con la IPv4 LAN primero");
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const [args, cwd] of [
  [["tools/hardware-broker.mjs"], root],
  [[`--env-file=${resolve(localDirectory, "backend.env")}`, "src/server.js"], resolve(root, "backend")],
  [["server.mjs"], root],
]) {
  const child = spawn(process.execPath, args, { cwd, stdio: "inherit", windowsHide: true });
  children.push(child);
  child.on("error", () => stop(1));
  child.on("exit", code => { if (!stopping) stop(code || 0); });
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
console.log("SITPA banco ESP32: web http://localhost:4173; broker TLS 8883. Sin simulación automática. Ctrl+C detiene todo.");
