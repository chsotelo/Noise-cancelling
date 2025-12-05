import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/Noise-cancelling/",
  server: {
    // Necesario para que SharedArrayBuffer (usado por WASM) funcione en dev
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  assetsInclude: ["**/*.wasm", "**/*.tar.gz"],
  worker: {
    format: "es",
  },
  // Ensure tar.gz files are served as-is without decompression
  build: {
    assetsInlineLimit: 0,
  },
});
