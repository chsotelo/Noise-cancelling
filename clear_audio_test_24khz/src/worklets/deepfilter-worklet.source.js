// DeepFilterNet Audio Worklet Source (para bundlear con esbuild)
// Este archivo importa df.js y crea el processor

import init, {
  df_create,
  df_get_frame_length,
  df_process_frame,
  df_set_post_filter_beta,
} from "../../public/_worklets/df.js";

// Variable global para el WASM inicializado
let wasmInitialized = false;
let wasmInitPromise = null;

class DeepFilterProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    this.sampleRate = 48000;
    this.initialized = false;
    this.dfState = null;
    this.frameLength = 0;

    // Input buffer for accumulating samples
    this.inputBuffer = [];

    // Downsampling state for 48kHz -> 24kHz
    this.downsampleBuffer = [];

    // Frame counter for fade-in (avoid initial click/pop from STFT warmup)
    // Instead of skipping frames, we apply a smooth fade-in
    this.processedFrameCount = 0;
    this.FADEIN_FRAMES = 3; // Apply fade-in to first 3 frames (~60ms)

    // Get WASM bytes from processor options
    this.wasmBytes = options?.processorOptions?.wasmBytes;
    this.modelBytes = options?.processorOptions?.modelBytes;

    console.log("[DeepFilter Worklet] Initializing DeepFilterNet WASM...");
    console.log(
      "[DeepFilter Worklet] WASM bytes received:",
      this.wasmBytes ? "YES" : "NO"
    );
    console.log(
      "[DeepFilter Worklet] Model bytes received:",
      this.modelBytes ? "YES" : "NO"
    );

    // Initialize WASM module
    this.initializeWasm();
  }

  async initializeWasm() {
    try {
      // Solo inicializar WASM una vez
      if (!wasmInitialized && !wasmInitPromise) {
        console.log("[DeepFilter Worklet] Loading WASM binary...");

        // Use WASM bytes from main thread
        if (!this.wasmBytes) {
          throw new Error("WASM bytes not provided in processorOptions");
        }

        const wasmBytes = this.wasmBytes;

        // Initialize WASM
        wasmInitPromise = init(wasmBytes);
        await wasmInitPromise;

        wasmInitialized = true;
        console.log("[DeepFilter Worklet] WASM module initialized");
      } else if (wasmInitPromise) {
        // Esperar a que termine la inicialización en curso
        await wasmInitPromise;
      }

      // Cargar modelo desde main thread o usar modelo embebido
      console.log("[DeepFilter Worklet] Creating DeepFilterNet state...");
      // Attenuation limit in dB: higher values = more aggressive noise suppression
      // CRITICAL: Too high removes soft speech, too low doesn't clean noise
      // Sweet spot for voice preservation: 30-35dB
      // Values: 28dB = gentle, 32dB = voice-priority, 35dB = balanced, 40dB = noise-priority
      const attenLim = 32; // Voice-priority: maximum soft speech preservation

      // DeepFilterNet WASM analysis:
      // - Compiled with "default-model" feature (has embedded model)
      // - BUT df_create API doesn't expose a way to use it
      // - Always calls DfParams::from_bytes(model_bytes)
      // - Empty array → panic at flate2/tar extraction
      // - Invalid tar.gz → unreachable panic
      //
      // Root cause: The tar.gz might be corrupted OR WASM lacks zlib/tar support
      // Test: Validate gzip magic bytes and try anyway

      if (!this.modelBytes || this.modelBytes.byteLength < 100) {
        throw new Error(
          "DeepFilterNet requires valid model tar.gz - none provided"
        );
      }

      const modelArray = new Uint8Array(this.modelBytes);

      // Validate gzip header (1f 8b)
      const isGzip = modelArray[0] === 0x1f && modelArray[1] === 0x8b;
      console.log("[DeepFilter Worklet] Model validation:");
      console.log(
        "  Size:",
        (modelArray.byteLength / 1024 / 1024).toFixed(2),
        "MB"
      );
      console.log("  Gzip header:", isGzip ? "✓ Valid" : "✗ Invalid");
      console.log(
        "  First 16 bytes:",
        Array.from(modelArray.slice(0, 16))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ")
      );

      if (!isGzip) {
        throw new Error(
          "Model is not a valid gzip file (missing magic bytes 1f 8b)"
        );
      }

      // Try creating with the provided model
      console.log("[DeepFilter Worklet] Attempting df_create...");
      this.dfState = df_create(modelArray, attenLim);

      // CRITICAL: Enable post-filter for non-stationary noise (keyboard, clicks, transient sounds)
      // Beta range: 0.05 = light, 0.08 = moderate, 0.10 = balanced-aggressive, 0.12+ = very aggressive
      // Slightly more aggressive to catch transient noises without hurting voice
      const postFilterBeta = 0.1;
      df_set_post_filter_beta(this.dfState, postFilterBeta);
      console.log(
        "[DeepFilter Worklet] Post-filter enabled with beta=",
        postFilterBeta
      );

      this.frameLength = df_get_frame_length(this.dfState);
      console.log(
        "[DeepFilter Worklet] Frame length obtained:",
        this.frameLength
      );

      this.initialized = true;
      console.log("[DeepFilter Worklet] ✅ Initialized successfully");
      console.log("[DeepFilter Worklet] Frame length:", this.frameLength);

      // CRITICAL: Notify main thread that worklet is ready
      this.port.postMessage("ready");
      console.log("[DeepFilter Worklet] Sent 'ready' message to main thread");
    } catch (error) {
      console.error("[DeepFilter Worklet] ❌ Initialization failed:", error);
      this.initialized = false;
      this.port.postMessage({ type: "error", message: error.message });
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0]) {
      return true;
    }

    // Pass through if not initialized
    if (!this.initialized || !this.dfState) {
      if (output && output[0]) {
        output[0].set(input[0]);
      }
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];

    // Accumulate input samples
    for (let i = 0; i < inputChannel.length; i++) {
      this.inputBuffer.push(inputChannel[i]);
    }

    // Process complete frames
    while (this.inputBuffer.length >= this.frameLength) {
      // Extract frame
      const frameArray = this.inputBuffer.splice(0, this.frameLength);
      const frame = new Float32Array(frameArray);

      // Input validation removed for cleaner logs

      try {
        // Process with DeepFilterNet
        const processedFrame = df_process_frame(this.dfState, frame);

        this.processedFrameCount++;

        // Apply fade-in to first few frames to avoid initial click/pop
        // This is smoother than skipping frames and preserves all audio
        if (this.processedFrameCount <= this.FADEIN_FRAMES) {
          const fadeRatio = this.processedFrameCount / this.FADEIN_FRAMES;
          // Smooth cubic fade-in curve
          const fadeFactor = fadeRatio * fadeRatio * (3 - 2 * fadeRatio);

          for (let j = 0; j < processedFrame.length; j++) {
            processedFrame[j] *= fadeFactor;
          }

          if (this.processedFrameCount === this.FADEIN_FRAMES) {
            console.log(
              `[DeepFilter] ✓ Fade-in complete, full volume audio now (applied to ${this.FADEIN_FRAMES} frames)`
            );
          }
        }

        // Add all processed samples to downsample buffer (no skipping)
        for (let j = 0; j < processedFrame.length; j++) {
          this.downsampleBuffer.push(processedFrame[j]);
        }
      } catch (error) {
        console.error("[DeepFilter Worklet] Processing error:", error);
        // En caso de error, pass through
        for (let j = 0; j < frame.length; j++) {
          this.downsampleBuffer.push(frame[j]);
        }
      }
    }

    // Downsample 48kHz → 24kHz and send when we have enough data
    // DeepFilterNet frame: 480 samples @ 48kHz = 10ms
    // Target: Send chunks of ~100ms @ 24kHz = 2400 samples
    // Need: 2400 * 2 = 4800 samples @ 48kHz before downsampling
    const MIN_CHUNK_SIZE_24KHZ = 2400; // 100ms @ 24kHz
    const MIN_CHUNK_SIZE_48KHZ = MIN_CHUNK_SIZE_24KHZ * 2; // Need double at 48kHz

    // Process count tracking removed for cleaner logs

    // Check if we have enough samples @ 48kHz to produce 100ms @ 24kHz
    if (this.downsampleBuffer.length >= MIN_CHUNK_SIZE_48KHZ) {
      // Calculate how many complete chunks we can create
      const samplesToProcess = Math.floor(this.downsampleBuffer.length / 2) * 2; // Even number
      const downsampledBuffer = [];

      // Downsample: keep every other sample (48kHz → 24kHz)
      for (let i = 0; i < samplesToProcess; i += 2) {
        downsampledBuffer.push(this.downsampleBuffer[i]);
      }

      // Remove processed samples, keep remainder for next iteration
      this.downsampleBuffer.splice(0, samplesToProcess);

      // Convert Float32 [-1, 1] to PCM16 [-32768, 32767] with gain compensation
      // CRITICAL FIX: Apply gain DURING PCM16 conversion, not before
      // This preserves the full dynamic range processed by DeepFilterNet
      // With attenLim=32dB (voice-priority), need slightly more gain
      const POST_GAIN = 4.5; // Balanced amplification for attenLim=32dB

      const pcm16 = new Int16Array(downsampledBuffer.length);
      for (let i = 0; i < downsampledBuffer.length; i++) {
        // Apply gain directly in PCM16 space to avoid float clamping
        let pcmValue = downsampledBuffer[i] * POST_GAIN * 32768;

        // Clamp to PCM16 range AFTER gain
        pcmValue = Math.max(-32768, Math.min(32767, pcmValue));
        pcm16[i] = Math.round(pcmValue);
      }

      console.log(
        `[DeepFilter] 📤 Sending PCM16 chunk: ${
          pcm16.length
        } samples @ 24kHz (${((pcm16.length / 24000) * 1000).toFixed(1)}ms)`
      );

      this.port.postMessage(
        {
          type: "pcm16",
          data: pcm16.buffer,
        },
        [pcm16.buffer]
      );
    }

    // Silent output (we send data via postMessage, not audio output)
    if (outputChannel) {
      outputChannel.fill(0);
    }

    return true;
  }
}

registerProcessor("deepfilter-processor", DeepFilterProcessor);
