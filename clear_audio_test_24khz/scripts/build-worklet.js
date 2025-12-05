// Build script para bundlear deepfilter-worklet con esbuild
import * as esbuild from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function buildWorklets() {
  try {
    console.log("🔨 Building audio worklets...");

    // Build DeepFilterNet worklet (PREMIUM)
    console.log("  → DeepFilterNet (PREMIUM mode)...");
    await esbuild.build({
      entryPoints: [
        resolve(__dirname, "../src/worklets/deepfilter-worklet.source.js"),
      ],
      bundle: true,
      format: "esm",
      target: "es2020",
      outfile: resolve(__dirname, "../public/_worklets/deepfilter-worklet.js"),
      platform: "browser",
      loader: {
        ".wasm": "file",
      },
      minify: false,
      sourcemap: true,
      logLevel: "warning",
      assetNames: "[name]",
      publicPath: "./",
    });

    // Build RNNoise worklet (LIGHT)
    console.log("  → RNNoise (LIGHT mode)...");
    await esbuild.build({
      entryPoints: [
        resolve(__dirname, "../src/worklets/rnnoise-worklet.source.js"),
      ],
      bundle: true,
      format: "esm",
      target: "es2020",
      outfile: resolve(__dirname, "../public/_worklets/rnnoise-worklet.js"),
      platform: "browser",
      loader: {
        ".wasm": "file",
      },
      minify: false,
      sourcemap: true,
      logLevel: "warning",
      assetNames: "[name]",
      publicPath: "./",
    });

    console.log("✅ All worklets built successfully!");
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

buildWorklets();
