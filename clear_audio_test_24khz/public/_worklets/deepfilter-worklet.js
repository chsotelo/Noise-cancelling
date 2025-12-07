// public/_worklets/df.js
var wasm;
var heap = new Array(128).fill(void 0);
heap.push(void 0, null, true, false);
function getObject(idx) {
  return heap[idx];
}
var heap_next = heap.length;
function dropObject(idx) {
  if (idx < 132) return;
  heap[idx] = heap_next;
  heap_next = idx;
}
function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}
var cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : { decode: () => {
  throw Error("TextDecoder not available");
} };
if (typeof TextDecoder !== "undefined") {
  cachedTextDecoder.decode();
}
var cachedUint8Memory0 = null;
function getUint8Memory0() {
  if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
    cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8Memory0;
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}
function addHeapObject(obj) {
  if (heap_next === heap.length) heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  heap[idx] = obj;
  return idx;
}
function df_get_frame_length(st) {
  const ret = wasm.df_get_frame_length(st);
  return ret >>> 0;
}
var cachedFloat32Memory0 = null;
function getFloat32Memory0() {
  if (cachedFloat32Memory0 === null || cachedFloat32Memory0.byteLength === 0) {
    cachedFloat32Memory0 = new Float32Array(wasm.memory.buffer);
  }
  return cachedFloat32Memory0;
}
var WASM_VECTOR_LEN = 0;
function passArrayF32ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 4, 4) >>> 0;
  getFloat32Memory0().set(arg, ptr / 4);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function df_process_frame(st, input) {
  const ptr0 = passArrayF32ToWasm0(input, wasm.__wbindgen_malloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.df_process_frame(st, ptr0, len0);
  return takeObject(ret);
}
function df_set_post_filter_beta(st, beta) {
  wasm.df_set_post_filter_beta(st, beta);
}
function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8Memory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function df_create(model_bytes, atten_lim) {
  const ptr0 = passArray8ToWasm0(model_bytes, wasm.__wbindgen_malloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.df_create(ptr0, len0, atten_lim);
  return ret >>> 0;
}
function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm.__wbindgen_exn_store(addHeapObject(e));
  }
}
var DFStateFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_dfstate_free(ptr >>> 0));
async function __wbg_load(module2, imports) {
  if (typeof Response === "function" && module2 instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module2, imports);
      } catch (e) {
        if (module2.headers.get("Content-Type") != "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module2.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module2, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module: module2 };
    } else {
      return instance;
    }
  }
}
function __wbg_get_imports() {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
    takeObject(arg0);
  };
  imports.wbg.__wbg_crypto_566d7465cdbb6b7a = function(arg0) {
    const ret = getObject(arg0).crypto;
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_is_object = function(arg0) {
    const val = getObject(arg0);
    const ret = typeof val === "object" && val !== null;
    return ret;
  };
  imports.wbg.__wbg_process_dc09a8c7d59982f6 = function(arg0) {
    const ret = getObject(arg0).process;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_versions_d98c6400c6ca2bd8 = function(arg0) {
    const ret = getObject(arg0).versions;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_node_caaf83d002149bd5 = function(arg0) {
    const ret = getObject(arg0).node;
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_is_string = function(arg0) {
    const ret = typeof getObject(arg0) === "string";
    return ret;
  };
  imports.wbg.__wbg_require_94a9da52636aacbf = function() {
    return handleError(function() {
      const ret = module.require;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_is_function = function(arg0) {
    const ret = typeof getObject(arg0) === "function";
    return ret;
  };
  imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_msCrypto_0b84745e9245cdf6 = function(arg0) {
    const ret = getObject(arg0).msCrypto;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_randomFillSync_290977693942bf03 = function() {
    return handleError(function(arg0, arg1) {
      getObject(arg0).randomFillSync(takeObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_getRandomValues_260cc23a41afad9a = function() {
    return handleError(function(arg0, arg1) {
      getObject(arg0).getRandomValues(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_newnoargs_e258087cd0daa0ea = function(arg0, arg1) {
    const ret = new Function(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_63b92bc8671ed464 = function(arg0) {
    const ret = new Uint8Array(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_9efabd6b6d2ce46d = function(arg0) {
    const ret = new Float32Array(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_buffer_12d079cc21e14bdb = function(arg0) {
    const ret = getObject(arg0).buffer;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newwithbyteoffsetandlength_aa4a17c33a06e5cb = function(arg0, arg1, arg2) {
    const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newwithlength_e9b4878cebadb3d3 = function(arg0) {
    const ret = new Uint8Array(arg0 >>> 0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_set_a47bac70306a19a7 = function(arg0, arg1, arg2) {
    getObject(arg0).set(getObject(arg1), arg2 >>> 0);
  };
  imports.wbg.__wbg_subarray_a1f73cd4b5b42fe1 = function(arg0, arg1, arg2) {
    const ret = getObject(arg0).subarray(arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newwithbyteoffsetandlength_4a659d079a1650e0 = function(arg0, arg1, arg2) {
    const ret = new Float32Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_self_ce0dbfc45cf2f5be = function() {
    return handleError(function() {
      const ret = self.self;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_window_c6fb939a7f436783 = function() {
    return handleError(function() {
      const ret = window.window;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_globalThis_d1e6af4856ba331b = function() {
    return handleError(function() {
      const ret = globalThis.globalThis;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_global_207b558942527489 = function() {
    return handleError(function() {
      const ret = global.global;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_is_undefined = function(arg0) {
    const ret = getObject(arg0) === void 0;
    return ret;
  };
  imports.wbg.__wbg_call_27c0f87801dedf93 = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg0).call(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
    const ret = getObject(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_call_b3ca7c6051f9bec1 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbindgen_memory = function() {
    const ret = wasm.memory;
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_throw = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
  };
  return imports;
}
function __wbg_init_memory(imports, maybe_memory) {
}
function __wbg_finalize_init(instance, module2) {
  wasm = instance.exports;
  __wbg_init.__wbindgen_wasm_module = module2;
  cachedFloat32Memory0 = null;
  cachedUint8Memory0 = null;
  return wasm;
}
async function __wbg_init(input) {
  if (wasm !== void 0) return wasm;
  if (typeof input === "undefined") {
    input = new URL("df_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports();
  if (typeof input === "string" || typeof Request === "function" && input instanceof Request || typeof URL === "function" && input instanceof URL) {
    input = fetch(input);
  }
  __wbg_init_memory(imports);
  const { instance, module: module2 } = await __wbg_load(await input, imports);
  return __wbg_finalize_init(instance, module2);
}
var df_default = __wbg_init;

// src/utils/audioResampler.js
var AudioResampler = class {
  constructor() {
    this.decimationFactor = 2;
    this.cutoffFreq = 0.4;
    this.filterOrder = 63;
    this.beta = 7.5;
    this.filterCoeffs = this.designKaiserLowpass(
      this.filterOrder,
      this.cutoffFreq,
      this.beta
    );
    this.stateBuffer = new Float32Array(this.filterOrder);
    this.statePos = 0;
    console.log(
      `[Resampler] Initialized: ${this.filterOrder}-tap Kaiser FIR, cutoff=${this.cutoffFreq}`
    );
  }
  /**
   * Design Kaiser-windowed lowpass FIR filter
   * @param {number} order - Filter order (number of taps)
   * @param {number} cutoff - Normalized cutoff frequency (0-1)
   * @param {number} beta - Kaiser window beta parameter
   * @returns {Float32Array} Filter coefficients
   */
  designKaiserLowpass(order, cutoff, beta) {
    const M = order;
    const coeffs = new Float32Array(M + 1);
    const center = M / 2;
    for (let n = 0; n <= M; n++) {
      if (n === center) {
        coeffs[n] = 2 * cutoff;
      } else {
        const x = (n - center) * Math.PI;
        coeffs[n] = Math.sin(2 * cutoff * x) / x * this.kaiserWindow(n, M, beta);
      }
    }
    const sum = coeffs.reduce((a, b) => a + b, 0);
    for (let i = 0; i <= M; i++) {
      coeffs[i] /= sum;
    }
    return coeffs;
  }
  /**
   * Kaiser window function
   * @param {number} n - Sample index
   * @param {number} M - Window length - 1
   * @param {number} beta - Shape parameter
   * @returns {number} Window value
   */
  kaiserWindow(n, M, beta) {
    const arg = beta * Math.sqrt(1 - Math.pow(2 * n / M - 1, 2));
    return this.besselI0(arg) / this.besselI0(beta);
  }
  /**
   * Modified Bessel function of the first kind, order 0
   * Used in Kaiser window calculation
   * @param {number} x - Input value
   * @returns {number} I0(x)
   */
  besselI0(x) {
    let sum = 1;
    let term = 1;
    let m = 1;
    while (m < 25) {
      term *= x * x / (4 * m * m);
      sum += term;
      m++;
    }
    return sum;
  }
  /**
   * Apply FIR filter to input buffer
   * @param {Float32Array} input - Input samples @ 48kHz
   * @returns {Float32Array} Filtered samples @ 48kHz
   */
  applyFirFilter(input) {
    const output = new Float32Array(input.length);
    const M = this.filterOrder;
    for (let n = 0; n < input.length; n++) {
      let sum = 0;
      for (let k = 0; k <= M; k++) {
        const idx = n - k;
        let sample;
        if (idx >= 0) {
          sample = input[idx];
        } else {
          const stateIdx = (this.statePos + idx + this.stateBuffer.length) % this.stateBuffer.length;
          sample = this.stateBuffer[stateIdx];
        }
        sum += this.filterCoeffs[k] * sample;
      }
      output[n] = sum;
    }
    for (let i = 0; i < Math.min(M, input.length); i++) {
      this.stateBuffer[(this.statePos + i) % this.stateBuffer.length] = input[input.length - M + i];
    }
    this.statePos = (this.statePos + Math.min(M, input.length)) % this.stateBuffer.length;
    return output;
  }
  /**
   * Resample 48kHz → 24kHz with anti-aliasing
   * @param {Float32Array} input48k - Input samples @ 48kHz
   * @returns {Float32Array} Output samples @ 24kHz
   */
  resample48to24(input48k) {
    const filtered = this.applyFirFilter(input48k);
    const outputLength = Math.floor(filtered.length / this.decimationFactor);
    const output24k = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      output24k[i] = filtered[i * this.decimationFactor];
    }
    return output24k;
  }
  /**
   * Reset filter state (call when starting new stream)
   */
  reset() {
    this.stateBuffer.fill(0);
    this.statePos = 0;
  }
};
var AudioDynamicProcessor = class {
  constructor() {
    this.targetRMS = 0.58;
    this.noiseGateThreshold = 8e-4;
    this.smoothingFactor = 0.88;
    this.previousGain = 1;
  }
  /**
   * Calculate RMS (Root Mean Square) level of audio buffer
   * @param {Float32Array} buffer
   * @returns {number} RMS level (0-1)
   */
  calculateRMS(buffer) {
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSquares += buffer[i] * buffer[i];
    }
    return Math.sqrt(sumSquares / buffer.length);
  }
  /**
   * Calculate peak level of audio buffer
   * @param {Float32Array} buffer
   * @returns {number} Peak level (0-1)
   */
  calculatePeak(buffer) {
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const abs = Math.abs(buffer[i]);
      if (abs > peak) peak = abs;
    }
    return peak;
  }
  /**
   * Process audio buffer - SIMPLIFICADO para claridad
   * @param {Float32Array} buffer - Input buffer
   * @returns {Object} {processed: Float32Array, gainApplied: number, rms: number, peak: number, saturated: boolean}
   */
  process(buffer) {
    const rms = this.calculateRMS(buffer);
    const peak = this.calculatePeak(buffer);
    let targetGain = 1;
    if (rms < this.noiseGateThreshold) {
      targetGain = 0.25;
    } else if (rms < 0.35) {
      targetGain = Math.min(this.targetRMS / Math.max(rms, 8e-3), 2.5);
    } else if (rms < 0.55) {
      targetGain = Math.max(0.95, this.targetRMS / rms);
    } else {
      targetGain = 0.95;
    }
    if (peak * targetGain > 0.96) {
      targetGain = 0.93 / peak;
    }
    let smoothFactor = this.smoothingFactor;
    if (targetGain < this.previousGain) {
      smoothFactor = 0.75;
    }
    const gain = this.previousGain * smoothFactor + targetGain * (1 - smoothFactor);
    this.previousGain = gain;
    const processed = new Float32Array(buffer.length);
    let saturated = false;
    for (let i = 0; i < buffer.length; i++) {
      let sample = buffer[i] * gain;
      const absValue = Math.abs(sample);
      if (absValue > 0.8) {
        const excess = absValue - 0.8;
        const kneeWidth = 0.16;
        if (excess < kneeWidth) {
          const ratio = excess / kneeWidth;
          const curve = ratio * ratio * (3 - 2 * ratio);
          const compressed = 0.8 + excess * (1 - curve * 0.5);
          sample = sample / absValue * Math.min(compressed, 0.96);
        } else {
          sample = sample / absValue * 0.96;
          saturated = true;
        }
      }
      processed[i] = sample;
    }
    return {
      processed,
      gainApplied: gain,
      rms,
      peak,
      saturated
    };
  }
};

// src/worklets/deepfilter-worklet.source.js
var wasmInitialized = false;
var wasmInitPromise = null;
var DeepFilterProcessor = class extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.sampleRate = 48e3;
    this.initialized = false;
    this.dfState = null;
    this.frameLength = 0;
    this.inputBuffer = [];
    this.resampler = new AudioResampler();
    this.downsampleBuffer = [];
    this.dynamicProcessor = new AudioDynamicProcessor();
    this.processedFrameCount = 0;
    this.FADEIN_FRAMES = 1;
    this.isRecordingActive = false;
    this.totalSamplesReceived = 0;
    this.totalSamplesProcessed = 0;
    this.recordingStartSample = null;
    this.recordingStopSample = null;
    this.wasmBytes = options?.processorOptions?.wasmBytes;
    this.modelBytes = options?.processorOptions?.modelBytes;
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
    this.initializeWasm();
  }
  async initializeWasm() {
    try {
      if (!wasmInitialized && !wasmInitPromise) {
        if (!this.wasmBytes) {
          throw new Error("WASM bytes not provided in processorOptions");
        }
        const wasmBytes = this.wasmBytes;
        wasmInitPromise = df_default(wasmBytes);
        await wasmInitPromise;
        wasmInitialized = true;
      } else if (wasmInitPromise) {
        await wasmInitPromise;
      }
      const attenLim = 30;
      if (!this.modelBytes || this.modelBytes.byteLength < 100) {
        throw new Error(
          "DeepFilterNet requires valid model tar.gz - none provided"
        );
      }
      const modelArray = new Uint8Array(this.modelBytes);
      const isGzip = modelArray[0] === 31 && modelArray[1] === 139;
      if (!isGzip) {
        throw new Error(
          "Model is not a valid gzip file (missing magic bytes 1f 8b)"
        );
      }
      this.dfState = df_create(modelArray, attenLim);
      const postFilterBeta = 0.06;
      df_set_post_filter_beta(this.dfState, postFilterBeta);
      this.frameLength = df_get_frame_length(this.dfState);
      this.initialized = true;
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
    this.totalSamplesReceived += inputChannel.length;
    if (!this.isRecordingActive) {
      return true;
    }
    if (!this.initialized || !this.dfState) {
      return true;
    }
    if (this.recordingStartSample === null) {
      this.recordingStartSample = this.totalSamplesReceived - inputChannel.length;
      this.firstSampleTime = currentTime;
      this.processedFrameCount = 0;
      this.port.postMessage({ type: "firstAudio" });
    }
    for (let i = 0; i < inputChannel.length; i++) {
      this.inputBuffer.push(inputChannel[i]);
    }
    while (this.inputBuffer.length >= this.frameLength) {
      const frameArray = this.inputBuffer.splice(0, this.frameLength);
      const frame = new Float32Array(frameArray);
      try {
        const processedFrame = df_process_frame(this.dfState, frame);
        this.processedFrameCount++;
        if (this.processedFrameCount <= this.FADEIN_FRAMES) {
          const fadeRatio = this.processedFrameCount / this.FADEIN_FRAMES;
          const fadeFactor = fadeRatio * fadeRatio * (3 - 2 * fadeRatio);
          for (let j = 0; j < processedFrame.length; j++) {
            processedFrame[j] *= fadeFactor;
          }
        }
        for (let j = 0; j < processedFrame.length; j++) {
          this.downsampleBuffer.push(processedFrame[j]);
        }
      } catch (error) {
        for (let j = 0; j < frame.length; j++) {
          this.downsampleBuffer.push(frame[j]);
        }
      }
    }
    const MIN_CHUNK_SIZE_24KHZ = 240;
    const MIN_CHUNK_SIZE_48KHZ = MIN_CHUNK_SIZE_24KHZ * 2;
    if (this.downsampleBuffer.length >= MIN_CHUNK_SIZE_48KHZ) {
      const samplesToProcess = Math.floor(this.downsampleBuffer.length / 2) * 2;
      const input48k = new Float32Array(samplesToProcess);
      for (let i = 0; i < samplesToProcess; i++) {
        input48k[i] = this.downsampleBuffer[i];
      }
      this.downsampleBuffer.splice(0, samplesToProcess);
      const resampled24k = this.resampler.resample48to24(input48k);
      const { processed, gainApplied, rms, peak, saturated } = this.dynamicProcessor.process(resampled24k);
      const pcm16 = new Int16Array(processed.length);
      for (let i = 0; i < processed.length; i++) {
        const pcmValue = processed[i] * 32768;
        pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(pcmValue)));
      }
      this.totalSamplesProcessed += pcm16.length;
      this.totalOutputSamples += pcm16.length;
      this.port.postMessage(
        {
          type: "pcm16",
          data: pcm16.buffer
        },
        [pcm16.buffer]
      );
    }
    if (outputChannel) {
      outputChannel.fill(0);
    }
    return true;
  }
  flushBuffers() {
    if (!this.initialized || !this.dfState) {
      return;
    }
    if (this.inputBuffer.length >= this.frameLength) {
      const frameArray = this.inputBuffer.splice(0, this.frameLength);
      const frame = new Float32Array(frameArray);
      try {
        const processedFrame = df_process_frame(this.dfState, frame);
        for (let j = 0; j < processedFrame.length; j++) {
          this.downsampleBuffer.push(processedFrame[j]);
        }
      } catch (error) {
      }
    } else if (this.inputBuffer.length > 0) {
      this.inputBuffer = [];
    }
    if (this.downsampleBuffer.length > 0) {
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
            data: pcm16.buffer
          },
          [pcm16.buffer]
        );
      }
    }
  }
};
registerProcessor("deepfilter-processor", DeepFilterProcessor);
//# sourceMappingURL=deepfilter-worklet.js.map
