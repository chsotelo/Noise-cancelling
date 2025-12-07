// DeepFilterNet Audio Worklet Source (para bundlear con esbuild)
// Este archivo importa df.js y crea el processor

import init, {
  df_create,
  df_get_frame_length,
  df_process_frame,
  df_set_post_filter_beta,
} from "../../public/_worklets/df.js";

import {
  AudioResampler,
  AudioDynamicProcessor,
} from "../../src/utils/audioResampler.js";

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

    // High-quality resampler (48kHz -> 24kHz with anti-aliasing)
    this.resampler = new AudioResampler();
    this.downsampleBuffer = [];

    // Dynamic audio processor (adaptive gain + soft limiter)
    this.dynamicProcessor = new AudioDynamicProcessor();

    // Frame counter for fade-in (avoid initial click/pop from STFT warmup)
    // Optimized: Minimal fade-in to preserve first words
    this.processedFrameCount = 0;
    this.FADEIN_FRAMES = 1; // Apply fade-in to first frame only (~10ms)

    // CRITICAL: Control flag - only process audio when recording is active
    this.isRecordingActive = false;

    // Sample counter to track exactly what we process
    this.totalSamplesReceived = 0;
    this.totalSamplesProcessed = 0;
    this.recordingStartSample = null;
    this.recordingStopSample = null;

    // Get WASM bytes from processor options
    this.wasmBytes = options?.processorOptions?.wasmBytes;
    this.modelBytes = options?.processorOptions?.modelBytes;

    // Listen for commands from main thread
    this.port.onmessage = (event) => {
      if (event.data === "start") {
        this.isRecordingActive = true;
        this.totalSamplesReceived = 0;
        this.totalSamplesProcessed = 0;
        this.totalOutputSamples = 0;
        this.firstSampleTime = null;
        this.recordingStartSample = null;
        this.recordingStopSample = null;
      } else if (event.data === "stop") {
        this.recordingStopSample = this.totalSamplesReceived;
        this.isRecordingActive = false;
      } else if (event.data === "flush") {
        this.flushBuffers();
      }
    };

    // Initialize WASM module
    this.initializeWasm();
  }

  async initializeWasm() {
    try {
      // Solo inicializar WASM una vez
      if (!wasmInitialized && !wasmInitPromise) {
        // Use WASM bytes from main thread
        if (!this.wasmBytes) {
          throw new Error("WASM bytes not provided in processorOptions");
        }

        const wasmBytes = this.wasmBytes;

        // Initialize WASM
        wasmInitPromise = init(wasmBytes);
        await wasmInitPromise;

        wasmInitialized = true;
      } else if (wasmInitPromise) {
        // Esperar a que termine la inicialización en curso
        await wasmInitPromise;
      }

      // Cargar modelo desde main thread o usar modelo embebido
      // Attenuation limit in dB: higher values = more aggressive noise suppression
      // CRITICAL: Too high removes soft speech, too low doesn't clean noise
      // Sweet spot: 30-35dB for non-stationary noise (keyboards, clicks, background)
      // Values: 28dB = gentle, 30dB = balanced, 32dB = moderate-aggressive, 35dB = aggressive
      // OPTIMIZED: 30dB for balanced noise suppression with maximum voice clarity
      const attenLim = 30; // Balanced cleaning

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

      if (!isGzip) {
        throw new Error(
          "Model is not a valid gzip file (missing magic bytes 1f 8b)"
        );
      }

      // Try creating with the provided model
      this.dfState = df_create(modelArray, attenLim);

      // CRITICAL: Enable post-filter for non-stationary noise (keyboard, clicks, transient sounds)
      // Beta range: 0.04 = gentle, 0.06 = light, 0.08 = moderate, 0.10 = strong
      // OPTIMIZED: 0.06 for clean noise removal without affecting voice clarity
      const postFilterBeta = 0.06;
      df_set_post_filter_beta(this.dfState, postFilterBeta);

      this.frameLength = df_get_frame_length(this.dfState);

      this.initialized = true;

      // CRITICAL: Notify main thread that worklet is ready
      this.port.postMessage("ready");
    } catch (error) {
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

    const inputChannel = input[0];
    const outputChannel = output[0];

    // Count ALL samples (even before recording starts)
    this.totalSamplesReceived += inputChannel.length;

    // CRITICAL: Only process audio when recording is active
    // This prevents buffering audio BEFORE user presses "Start Recording"
    if (!this.isRecordingActive) {
      return true;
    }

    // Wait until initialized
    if (!this.initialized || !this.dfState) {
      return true;
    }

    // Track first sample time and START of recording
    if (this.recordingStartSample === null) {
      this.recordingStartSample =
        this.totalSamplesReceived - inputChannel.length; // Mark where recording STARTED
      this.firstSampleTime = currentTime;
      this.processedFrameCount = 0;

      // Notify main thread that first audio has arrived - safe to start MediaRecorder
      this.port.postMessage({ type: "firstAudio" });
    }

    // Accumulate current input samples
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
        }

        // Add all processed samples to downsample buffer (no skipping)
        for (let j = 0; j < processedFrame.length; j++) {
          this.downsampleBuffer.push(processedFrame[j]);
        }
      } catch (error) {
        // En caso de error, pass through
        for (let j = 0; j < frame.length; j++) {
          this.downsampleBuffer.push(frame[j]);
        }
      }
    }

    // High-quality resample 48kHz → 24kHz with anti-aliasing filter
    // ULTRA LOW LATENCY: Send immediately after each frame is processed
    // Target: ~10ms @ 24kHz = 240 samples (minimal buffering)
    const MIN_CHUNK_SIZE_24KHZ = 240; // 10ms @ 24kHz (ultra low latency)
    const MIN_CHUNK_SIZE_48KHZ = MIN_CHUNK_SIZE_24KHZ * 2; // Need double at 48kHz

    // Check if we have enough samples @ 48kHz to produce output
    if (this.downsampleBuffer.length >= MIN_CHUNK_SIZE_48KHZ) {
      // Calculate how many complete chunks we can create (even number for proper decimation)
      const samplesToProcess = Math.floor(this.downsampleBuffer.length / 2) * 2;

      // Extract samples to process
      const input48k = new Float32Array(samplesToProcess);
      for (let i = 0; i < samplesToProcess; i++) {
        input48k[i] = this.downsampleBuffer[i];
      }

      // Remove processed samples, keep remainder for next iteration
      this.downsampleBuffer.splice(0, samplesToProcess);

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
        // Already normalized and limited, just convert to PCM16
        const pcmValue = processed[i] * 32768;
        pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(pcmValue)));
      }

      // Track output samples
      this.totalSamplesProcessed += pcm16.length;
      this.totalOutputSamples += pcm16.length;

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

  flushBuffers() {
    if (!this.initialized || !this.dfState) {
      return;
    }

    // Process remaining samples in inputBuffer
    // If we have enough for a frame, process it. Otherwise, discard incomplete frame
    // to avoid adding artificial silence
    if (this.inputBuffer.length >= this.frameLength) {
      // Process final complete frame
      const frameArray = this.inputBuffer.splice(0, this.frameLength);
      const frame = new Float32Array(frameArray);

      try {
        const processedFrame = df_process_frame(this.dfState, frame);
        for (let j = 0; j < processedFrame.length; j++) {
          this.downsampleBuffer.push(processedFrame[j]);
        }
      } catch (error) {
        // Silent error handling
      }
    } else if (this.inputBuffer.length > 0) {
      // Clear incomplete frame to avoid artificial duration extension
      this.inputBuffer = [];
    }

    // Process remaining samples in downsampleBuffer
    if (this.downsampleBuffer.length > 0) {
      // Process whatever we have (even if less than MIN_CHUNK_SIZE)
      const samplesToProcess = Math.floor(this.downsampleBuffer.length / 2) * 2;

      if (samplesToProcess >= 2) {
        const input48k = new Float32Array(samplesToProcess);
        for (let i = 0; i < samplesToProcess; i++) {
          input48k[i] = this.downsampleBuffer[i];
        }
        this.downsampleBuffer.splice(0, samplesToProcess);

        const resampled24k = this.resampler.resample48to24(input48k);
        const { processed } = this.dynamicProcessor.process(resampled24k);

        const pcm16 = new Int16Array(processed.length);
        for (let i = 0; i < processed.length; i++) {
          const pcmValue = processed[i] * 32768;
          pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(pcmValue)));
        }

        this.port.postMessage(
          {
            type: "pcm16",
            data: pcm16.buffer,
          },
          [pcm16.buffer]
        );
      }
    }
  }
}

registerProcessor("deepfilter-processor", DeepFilterProcessor);
