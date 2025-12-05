// WASM Loader Helper
// Carga archivos WASM en el main thread y los prepara para pasar al AudioWorklet

export class WasmLoader {
  static async loadDeepFilterNetWasm() {
    try {
      console.log("[WASM Loader] Loading DeepFilterNet WASM...");

      const wasmUrl = "/Noise-cancelling/_worklets/df_bg.wasm";
      const response = await fetch(wasmUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch WASM: ${response.status}`);
      }

      const wasmBytes = await response.arrayBuffer();

      console.log(
        "[WASM Loader] ✅ DeepFilterNet WASM loaded:",
        (wasmBytes.byteLength / 1024 / 1024).toFixed(2),
        "MB"
      );

      return wasmBytes;
    } catch (error) {
      console.error("[WASM Loader] Failed to load DeepFilterNet WASM:", error);
      throw error;
    }
  }

  static async loadRNNoiseWasm() {
    try {
      console.log("[WASM Loader] Loading RNNoise WASM...");

      const wasmUrl = "/Noise-cancelling/_worklets/rnnoise.wasm";
      const response = await fetch(wasmUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch WASM: ${response.status}`);
      }

      const wasmBytes = await response.arrayBuffer();

      console.log(
        "[WASM Loader] ✅ RNNoise WASM loaded:",
        (wasmBytes.byteLength / 1024).toFixed(2),
        "KB"
      );

      return wasmBytes;
    } catch (error) {
      console.error("[WASM Loader] Failed to load RNNoise WASM:", error);
      throw error;
    }
  }

  static async loadDeepFilterNetModel() {
    try {
      console.log("[WASM Loader] Loading DeepFilterNet model...");

      // Use .bin extension to prevent Vite from auto-decompressing the .gz file
      const modelUrl =
        "/Noise-cancelling/models/DeepFilterNet3_onnx.tar.gz.bin";
      const response = await fetch(modelUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch model: ${response.status}`);
      }

      const modelBytes = await response.arrayBuffer();

      console.log(
        "[WASM Loader] ✅ DeepFilterNet model loaded:",
        (modelBytes.byteLength / 1024 / 1024).toFixed(2),
        "MB"
      );

      return modelBytes;
    } catch (error) {
      console.error("[WASM Loader] Failed to load DeepFilterNet model:", error);
      throw error;
    }
  }
}
