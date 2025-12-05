// RNNoise Audio Worklet Source (LIGHT mode @ 24kHz)
// Bundled with esbuild - imports Emscripten module directly

// Import the Emscripten-generated module
import createRNNWasmModule from "../../public/_worklets/rnnoise.js";

// RNNoise configuration
const RNNOISE_CONFIG = {
  SAMPLE_RATE: 24000,
  FRAME_SIZE: 480, // RNNoise uses 480 samples per frame (10ms @ 48kHz)
  PCM_FREQUENCY: 48000, // RNNoise internally works at 48kHz
};

// Global WASM module instance
let rnnoiseWasmModule = null;
let rnnoiseInitPromise = null;

class RNNoiseLightProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    this.initialized = false;
    this.rnnoiseState = null;

    // Processing buffers
    this.inputBuffer = new Float32Array(RNNOISE_CONFIG.FRAME_SIZE);
    this.outputBuffer = new Float32Array(RNNOISE_CONFIG.FRAME_SIZE);
    this.bufferPos = 0;

    // Accumulation buffer for sending larger chunks (reduce fragmentation)
    this.accumulatedOutput = [];
    this.MIN_SEND_SIZE = 2400; // 100ms @ 24kHz

    // WASM heap buffers
    this.heapInputBuffer = null;
    this.heapOutputBuffer = null;

    // Output buffer tracking for smooth audio
    this.outputReadPos = 0;
    this.outputWritePos = 0;

    // Get WASM bytes from processor options
    this.wasmBytes = options?.processorOptions?.wasmBytes;

    console.log("[RNNoise LIGHT] Initializing...");
    console.log(
      "[RNNoise LIGHT] WASM bytes received:",
      this.wasmBytes ? "YES" : "NO"
    );

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

      console.log("[RNNoise LIGHT] ✅ Initialized successfully @ 24kHz");
      console.log("  Frame size:", RNNOISE_CONFIG.FRAME_SIZE);
      console.log("  Sample rate:", RNNOISE_CONFIG.SAMPLE_RATE);

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
    if (!this.initialized) {
      // Mientras se inicializa, pass-through
      if (inputs[0] && outputs[0] && inputs[0][0] && outputs[0][0]) {
        outputs[0][0].set(inputs[0][0]);
      }
      return true;
    }

    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || !output || !output[0]) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];
    const blockSize = inputChannel.length;

    // Output buffer tracking
    let outputReadPos = this.outputReadPos || 0;
    let outputWritePos = this.outputWritePos || 0;

    // Process input samples
    for (let i = 0; i < blockSize; i++) {
      // Accumulate input
      this.inputBuffer[this.bufferPos++] = inputChannel[i];

      // When we have a complete frame, process it
      if (this.bufferPos >= RNNOISE_CONFIG.FRAME_SIZE) {
        this.processFrame();
        this.bufferPos = 0;

        // Mark that we have a processed frame available
        outputWritePos = RNNOISE_CONFIG.FRAME_SIZE;
      }
    }

    // Accumulate processed frames before sending
    // RNNoise already outputs at 24kHz, no downsampling needed
    if (outputWritePos > 0) {
      // Add processed frame to accumulation buffer
      for (let i = 0; i < RNNOISE_CONFIG.FRAME_SIZE; i++) {
        this.accumulatedOutput.push(this.outputBuffer[i]);
      }

      outputWritePos = 0;
      outputReadPos = 0;
    }

    // Send accumulated frames when we have enough data (100ms chunks)
    if (this.accumulatedOutput.length >= this.MIN_SEND_SIZE) {
      // Convert Float32 [-1, 1] to PCM16 [-32768, 32767]
      const pcm16 = new Int16Array(this.accumulatedOutput.length);
      for (let i = 0; i < this.accumulatedOutput.length; i++) {
        const sample = Math.max(-1, Math.min(1, this.accumulatedOutput[i]));
        pcm16[i] = sample < 0 ? sample * 32768 : sample * 32767;
      }

      this.port.postMessage(
        {
          type: "pcm16",
          data: pcm16.buffer,
        },
        [pcm16.buffer]
      );

      // Clear accumulated buffer
      this.accumulatedOutput = [];
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
}

registerProcessor("rnnoise-processor", RNNoiseLightProcessor);
