// RNNoise Audio Worklet Source (LIGHT mode)
// Entrada: 48kHz nativo → RNNoise @ 48kHz → Salida: 24kHz
// Bundled with esbuild - imports Emscripten module directly

// Import the Emscripten-generated module
import createRNNWasmModule from "../../public/_worklets/rnnoise.js";

// Import audio processing utilities (same as DeepFilterNet)
import {
  AudioResampler,
  AudioDynamicProcessor,
  CircularBuffer,
} from "../../src/utils/audioResampler.js";

// RNNoise configuration (same architecture as DeepFilterNet)
const RNNOISE_CONFIG = {
  PROCESSING_RATE: 48000, // RNNoise procesa @ 48kHz
  OUTPUT_RATE: 24000, // Resampleado a 24kHz para backend
  FRAME_SIZE: 480, // 10ms @ 48kHz (frame nativo de RNNoise)
};

// Minimum chunk size for efficient resampling (must be even for 2:1 decimation)
const MIN_CHUNK_SIZE_48KHZ = 960; // 20ms @ 48kHz -> 10ms @ 24kHz

// Global WASM module instance
let rnnoiseWasmModule = null;
let rnnoiseInitPromise = null;

class RNNoiseLightProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    this.initialized = false;
    this.rnnoiseState = null;

    // Processing buffers @ 48kHz (RNNoise native)
    this.inputBuffer = new Float32Array(RNNOISE_CONFIG.FRAME_SIZE);
    this.outputBuffer = new Float32Array(RNNOISE_CONFIG.FRAME_SIZE);
    this.bufferPos = 0;

    // CRITICAL: Pre-initialization buffer to store audio BEFORE model is ready
    this.preInitBuffer = [];
    this.MAX_PREINIT_BUFFER = 48000 * 2; // 2 seconds max @ 48kHz

    // High-quality resampler (48kHz -> 24kHz with anti-aliasing)
    this.resampler = new AudioResampler();
    this.downsampleBuffer = new CircularBuffer(4096); // ~85ms buffer @ 48kHz

    // Dynamic audio processor (adaptive gain + soft limiter)
    this.dynamicProcessor = new AudioDynamicProcessor();

    // WASM heap buffers
    this.heapInputBuffer = null;
    this.heapOutputBuffer = null;

    // Output buffer tracking for smooth audio
    this.outputReadPos = 0;
    this.outputWritePos = 0;

    // Frame counter for metrics
    this.frameCount = 0;

    // CRITICAL: Control flag - only process audio when recording is active
    this.isRecordingActive = false;

    // Get WASM bytes from processor options
    this.wasmBytes = options?.processorOptions?.wasmBytes;

    console.log("[RNNoise LIGHT] Initializing...");
    console.log(
      "[RNNoise LIGHT] WASM bytes received:",
      this.wasmBytes ? "YES" : "NO"
    );

    // Listen for commands from main thread
    this.port.onmessage = (event) => {
      if (event.data === "start") {
        console.log("[RNNoise LIGHT] Recording started");
        this.isRecordingActive = true;
      } else if (event.data === "stop") {
        console.log("[RNNoise LIGHT] Recording stopped");
        this.isRecordingActive = false;
      } else if (event.data === "flush") {
        this.flushBuffers();
      } else if (event.data?.type === "cleanup") {
        console.log("[RNNoise LIGHT] Cleanup requested");
        this.cleanup();
      }
    };

    // Inicializar RNNoise
    this.initRNNoise();
  }

  async initRNNoise() {
    try {
      console.log("[RNNoise LIGHT] Initializing RNNoise WASM module...");

      // Initialize the Emscripten module only once
      if (!rnnoiseWasmModule && !rnnoiseInitPromise) {
        if (!this.wasmBytes) {
          throw new Error("WASM bytes not provided in processorOptions");
        }

        console.log("[RNNoise LIGHT] Creating Emscripten module...");

        // Create the Emscripten module with custom WASM bytes
        rnnoiseInitPromise = createRNNWasmModule({
          wasmBinary: this.wasmBytes,
          locateFile: (path) => {
            // Return empty path since we're providing wasmBinary directly
            return path;
          },
        });

        rnnoiseWasmModule = await rnnoiseInitPromise;
        console.log("[RNNoise LIGHT] ✅ Emscripten module created");
      } else if (rnnoiseInitPromise) {
        rnnoiseWasmModule = await rnnoiseInitPromise;
      }

      // Create RNNoise state
      this.rnnoiseState = rnnoiseWasmModule._rnnoise_create(null);

      if (!this.rnnoiseState) {
        throw new Error("Failed to create RNNoise state");
      }

      // Allocate buffers in WASM heap
      const heapSize =
        RNNOISE_CONFIG.FRAME_SIZE * Float32Array.BYTES_PER_ELEMENT;

      this.heapInputBuffer = rnnoiseWasmModule._malloc(heapSize);
      this.heapOutputBuffer = rnnoiseWasmModule._malloc(heapSize);

      if (!this.heapInputBuffer || !this.heapOutputBuffer) {
        throw new Error("Failed to allocate WASM heap buffers");
      }

      this.initialized = true;

      console.log("[RNNoise LIGHT] ✅ Initialized successfully!");
      console.log(
        `[RNNoise LIGHT] Processing: ${RNNOISE_CONFIG.PROCESSING_RATE}Hz → Output: ${RNNOISE_CONFIG.OUTPUT_RATE}Hz`
      );
      console.log(
        `[RNNoise LIGHT] Frame size: ${RNNOISE_CONFIG.FRAME_SIZE} samples (10ms @ 48kHz)`
      );

      // Notify main thread
      this.port.postMessage("ready");
    } catch (error) {
      console.error("[RNNoise LIGHT] ❌ Initialization failed:", error);
      this.port.postMessage({ type: "error", message: error.message });
    }
  }

  async loadRNNoiseWasm(wasmBytes) {
    // Crear un módulo Emscripten mínimo compatible
    // RNNoise usa Emscripten, necesitamos proporcionar el entorno

    const imports = {
      env: {
        memory: new WebAssembly.Memory({ initial: 256, maximum: 256 }),
        __memory_base: 0,
        __table_base: 0,
        table: new WebAssembly.Table({ initial: 0, element: "anyfunc" }),
        abort: () => console.error("WASM abort called"),
        _emscripten_memcpy_big: (dest, src, num) => {
          const mem = new Uint8Array(imports.env.memory.buffer);
          mem.copyWithin(dest, src, src + num);
          return dest;
        },
      },
    };

    const { instance } = await WebAssembly.instantiate(wasmBytes, imports);

    // Crear interfaz compatible con Emscripten
    const module = {
      _rnnoise_create: instance.exports.rnnoise_create,
      _rnnoise_destroy: instance.exports.rnnoise_destroy,
      _rnnoise_process_frame: instance.exports.rnnoise_process_frame,
      _malloc: instance.exports.malloc,
      _free: instance.exports.free,
      HEAPF32: new Float32Array(imports.env.memory.buffer),
      HEAP8: new Int8Array(imports.env.memory.buffer),
    };

    return module;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || !output || !output[0]) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];

    // CRITICAL: Only process audio when recording is active
    if (!this.isRecordingActive) {
      return true;
    }

    // Wait until initialized
    if (!this.initialized) {
      return true;
    }
    const blockSize = inputChannel.length;

    // Output buffer tracking
    let outputReadPos = this.outputReadPos || 0;
    let outputWritePos = this.outputWritePos || 0;

    // Process input samples @ 48kHz
    for (let i = 0; i < blockSize; i++) {
      // Accumulate input @ 48kHz
      this.inputBuffer[this.bufferPos++] = inputChannel[i];

      // When we have a complete frame @ 48kHz, process it
      if (this.bufferPos >= RNNOISE_CONFIG.FRAME_SIZE) {
        this.processFrame();
        this.bufferPos = 0;

        // Mark that we have a processed frame available
        outputWritePos = RNNOISE_CONFIG.FRAME_SIZE;
      }
    }

    // Accumulate processed frames @ 48kHz for resampling
    if (outputWritePos > 0) {
      // Push entire processed frame to downsample buffer
      for (let i = 0; i < RNNOISE_CONFIG.FRAME_SIZE; i++) {
        this.downsampleBuffer.push(this.outputBuffer[i]);
      }

      outputWritePos = 0;
      outputReadPos = 0;
    }

    // Check if we have enough samples @ 48kHz for resampling (same as DeepFilterNet)
    if (this.downsampleBuffer.length >= MIN_CHUNK_SIZE_48KHZ) {
      // Calculate how many complete chunks we can create (even number for proper decimation)
      const samplesToProcess = Math.floor(this.downsampleBuffer.length / 2) * 2;

      // Extract samples to process (zero-copy read)
      const input48k = this.downsampleBuffer.read(samplesToProcess);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 1: High-quality resampling with anti-aliasing FIR filter
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const resampled24k = this.resampler.resample48to24(input48k);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 2: Adaptive gain normalization + soft limiting
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const { processed, gainApplied, rms, peak, saturated } =
        this.dynamicProcessor.process(resampled24k);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 3: Convert Float32 [-1, 1] to PCM16 [-32768, 32767]
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const pcm16 = new Int16Array(processed.length);
      for (let i = 0; i < processed.length; i++) {
        const pcmValue = processed[i] * 32768;
        pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(pcmValue)));
      }

      // Log with audio metrics (throttled to avoid spam)
      this.frameCount++;
      if (this.frameCount % 50 === 0) {
        const satIcon = saturated ? "🔴" : "🟢";
        console.log(
          `[RNNoise LIGHT] ${satIcon} PCM16: ${pcm16.length} samples @ 24kHz | ` +
            `Gain: ${gainApplied.toFixed(2)}x | RMS: ${(rms * 100).toFixed(
              1
            )}% | Peak: ${(peak * 100).toFixed(1)}%`
        );
      }

      this.port.postMessage(
        {
          type: "pcm16",
          data: pcm16.buffer,
        },
        [pcm16.buffer]
      );
    }

    // Save state for next call
    this.outputReadPos = outputReadPos;
    this.outputWritePos = outputWritePos;

    // Silent output (we send data via postMessage, not audio output)
    if (outputChannel) {
      outputChannel.fill(0);
    }

    return true;
  }

  processFrame() {
    try {
      // Copiar input al heap de WASM
      rnnoiseWasmModule.HEAPF32.set(
        this.inputBuffer,
        this.heapInputBuffer / Float32Array.BYTES_PER_ELEMENT
      );

      // Procesar frame con RNNoise
      // rnnoise_process_frame devuelve VAD probability (no lo usamos aquí)
      rnnoiseWasmModule._rnnoise_process_frame(
        this.rnnoiseState,
        this.heapOutputBuffer,
        this.heapInputBuffer
      );

      // Copiar output del heap de WASM
      this.outputBuffer.set(
        rnnoiseWasmModule.HEAPF32.subarray(
          this.heapOutputBuffer / Float32Array.BYTES_PER_ELEMENT,
          this.heapOutputBuffer / Float32Array.BYTES_PER_ELEMENT +
            RNNOISE_CONFIG.FRAME_SIZE
        )
      );
    } catch (error) {
      console.error("[RNNoise LIGHT] Frame processing error:", error);
      // En caso de error, pasar audio sin procesar
      this.outputBuffer.set(this.inputBuffer);
    }
  }

  cleanup() {
    console.log("[RNNoise LIGHT] Cleaning up resources...");

    if (this.rnnoiseState && rnnoiseWasmModule) {
      try {
        rnnoiseWasmModule._rnnoise_destroy(this.rnnoiseState);
        console.log("[RNNoise LIGHT] ✅ RNNoise state destroyed");
      } catch (e) {
        console.warn("[RNNoise LIGHT] Error destroying state:", e);
      }
      this.rnnoiseState = null;
    }

    if (this.heapInputBuffer && rnnoiseWasmModule) {
      try {
        rnnoiseWasmModule._free(this.heapInputBuffer);
      } catch (e) {
        console.warn("[RNNoise LIGHT] Error freeing input buffer:", e);
      }
      this.heapInputBuffer = null;
    }

    if (this.heapOutputBuffer && rnnoiseWasmModule) {
      try {
        rnnoiseWasmModule._free(this.heapOutputBuffer);
      } catch (e) {
        console.warn("[RNNoise LIGHT] Error freeing output buffer:", e);
      }
      this.heapOutputBuffer = null;
    }

    this.initialized = false;
    console.log("[RNNoise LIGHT] ✅ Cleanup complete");
  }

  flushBuffers() {
    console.log("[RNNoise LIGHT] Flushing remaining buffers before stop...");

    if (!this.initialized) {
      console.log("[RNNoise LIGHT] Not initialized, nothing to flush");
      return;
    }

    // Process remaining samples in inputBuffer
    // Only process if we have a complete frame, otherwise discard to avoid artificial silence
    if (this.bufferPos >= RNNOISE_CONFIG.FRAME_SIZE) {
      console.log(
        `[RNNoise LIGHT] Flushing complete frame: ${this.bufferPos} samples`
      );

      // Process final frame
      this.processFrame();

      // Add to downsample buffer
      for (let i = 0; i < this.outputBuffer.length; i++) {
        this.downsampleBuffer.push(this.outputBuffer[i]);
      }

      this.bufferPos = 0;
    } else if (this.bufferPos > 0) {
      console.log(
        `[RNNoise LIGHT] Discarding incomplete frame: ${this.bufferPos} samples (< ${RNNOISE_CONFIG.FRAME_SIZE})`
      );
      // Clear incomplete frame
      this.bufferPos = 0;
    }

    // Send remaining downsample buffer
    if (this.downsampleBuffer.length > 0) {
      console.log(
        `[RNNoise LIGHT] Flushing ${this.downsampleBuffer.length} samples from downsampleBuffer`
      );

      // Process even number of samples for proper decimation
      const samplesToFlush = Math.floor(this.downsampleBuffer.length / 2) * 2;
      const input48k = this.downsampleBuffer.read(samplesToFlush);

      // Resample to 24kHz
      const resampled24k = this.resampler.resample48to24(input48k);

      const { processed } = this.dynamicProcessor.process(resampled24k);

      const pcm16 = new Int16Array(processed.length);
      for (let i = 0; i < processed.length; i++) {
        const pcmValue = processed[i] * 32768;
        pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(pcmValue)));
      }

      console.log(`[RNNoise LIGHT] ✅ Flushed final ${pcm16.length} samples`);

      this.port.postMessage(
        {
          type: "pcm16",
          data: pcm16.buffer,
        },
        [pcm16.buffer]
      );
    }

    console.log("[RNNoise LIGHT] ✅ Flush complete");
  }
}

registerProcessor("rnnoise-processor", RNNoiseLightProcessor);
