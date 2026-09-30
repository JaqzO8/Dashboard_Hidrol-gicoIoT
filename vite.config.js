import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        tendencias: resolve(root, "tendencias.html"),
        ambiente: resolve(root, "ambiente.html"),
        redNacional: resolve(root, "red-nacional.html"),
        registros: resolve(root, "registros.html")
      }
    }
  },
});
