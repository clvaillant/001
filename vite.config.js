import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { renameSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Renames the emitted single-file index.html to rgemergence.html so that
// `npm run build` yields exactly dist/rgemergence.html.
function renameToRgemergence() {
  return {
    name: "rename-to-rgemergence",
    closeBundle() {
      const dist = resolve(__dirname, "dist");
      const from = resolve(dist, "index.html");
      const to = resolve(dist, "rgemergence.html");
      if (existsSync(from)) renameSync(from, to);
    },
  };
}

export default defineConfig({
  plugins: [viteSingleFile(), renameToRgemergence()],
  build: {
    target: "es2020",
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    outDir: "dist",
  },
});
