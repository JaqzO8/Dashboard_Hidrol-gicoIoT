import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  server: { host: "127.0.0.1", fs: { deny: ["**/.env*", "**/.git/**", "**/.tools/**", "**/.local-mqtt/**", "**/iot_code/**", "**/backend/**", "**/*.{crt,pem,key}"] } },
  build: {
    target: "es2022",
    sourcemap: false,
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
