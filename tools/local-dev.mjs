import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
const root = fileURLToPath(new URL("..", import.meta.url));
if (!existsSync(new URL("../_site/index.html", import.meta.url))) throw new Error("Ejecute npm run build:github primero");
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const [args, cwd] of [
  [["tools/local-broker.mjs"], root],
  [["--env-file-if-exists=.env", "src/server.js"], fileURLToPath(new URL("../backend", import.meta.url))],
  [["server.mjs"], root],
]) {
  const child = spawn(process.execPath, args, { cwd, stdio: "inherit", windowsHide: true });
  children.push(child); child.on("exit", code => { if (!stopping) stop(code || 0); });
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
console.log("SITPA local: http://localhost:4173 · backend 8787 · broker de pruebas 1883. Sin simulación automática.");
