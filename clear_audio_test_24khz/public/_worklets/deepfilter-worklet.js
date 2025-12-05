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
    this.downsampleBuffer = [];
    this.processedFrameCount = 0;
    this.FADEIN_FRAMES = 3;
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
    this.initializeWasm();
  }
  async initializeWasm() {
    try {
      if (!wasmInitialized && !wasmInitPromise) {
        console.log("[DeepFilter Worklet] Loading WASM binary...");
        if (!this.wasmBytes) {
          throw new Error("WASM bytes not provided in processorOptions");
        }
        const wasmBytes = this.wasmBytes;
        wasmInitPromise = df_default(wasmBytes);
        await wasmInitPromise;
        wasmInitialized = true;
        console.log("[DeepFilter Worklet] WASM module initialized");
      } else if (wasmInitPromise) {
        await wasmInitPromise;
      }
      console.log("[DeepFilter Worklet] Creating DeepFilterNet state...");
      const attenLim = 32;
      if (!this.modelBytes || this.modelBytes.byteLength < 100) {
        throw new Error(
          "DeepFilterNet requires valid model tar.gz - none provided"
        );
      }
      const modelArray = new Uint8Array(this.modelBytes);
      const isGzip = modelArray[0] === 31 && modelArray[1] === 139;
      console.log("[DeepFilter Worklet] Model validation:");
      console.log(
        "  Size:",
        (modelArray.byteLength / 1024 / 1024).toFixed(2),
        "MB"
      );
      console.log("  Gzip header:", isGzip ? "\u2713 Valid" : "\u2717 Invalid");
      console.log(
        "  First 16 bytes:",
        Array.from(modelArray.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join(" ")
      );
      if (!isGzip) {
        throw new Error(
          "Model is not a valid gzip file (missing magic bytes 1f 8b)"
        );
      }
      console.log("[DeepFilter Worklet] Attempting df_create...");
      this.dfState = df_create(modelArray, attenLim);
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
      console.log("[DeepFilter Worklet] \u2705 Initialized successfully");
      console.log("[DeepFilter Worklet] Frame length:", this.frameLength);
      this.port.postMessage("ready");
      console.log("[DeepFilter Worklet] Sent 'ready' message to main thread");
    } catch (error) {
      console.error("[DeepFilter Worklet] \u274C Initialization failed:", error);
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
    if (!this.initialized || !this.dfState) {
      if (output && output[0]) {
        output[0].set(input[0]);
      }
      return true;
    }
    const inputChannel = input[0];
    const outputChannel = output[0];
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
          if (this.processedFrameCount === this.FADEIN_FRAMES) {
            console.log(
              `[DeepFilter] \u2713 Fade-in complete, full volume audio now (applied to ${this.FADEIN_FRAMES} frames)`
            );
          }
        }
        for (let j = 0; j < processedFrame.length; j++) {
          this.downsampleBuffer.push(processedFrame[j]);
        }
      } catch (error) {
        console.error("[DeepFilter Worklet] Processing error:", error);
        for (let j = 0; j < frame.length; j++) {
          this.downsampleBuffer.push(frame[j]);
        }
      }
    }
    const MIN_CHUNK_SIZE_24KHZ = 2400;
    const MIN_CHUNK_SIZE_48KHZ = MIN_CHUNK_SIZE_24KHZ * 2;
    if (this.downsampleBuffer.length >= MIN_CHUNK_SIZE_48KHZ) {
      const samplesToProcess = Math.floor(this.downsampleBuffer.length / 2) * 2;
      const downsampledBuffer = [];
      for (let i = 0; i < samplesToProcess; i += 2) {
        downsampledBuffer.push(this.downsampleBuffer[i]);
      }
      this.downsampleBuffer.splice(0, samplesToProcess);
      const POST_GAIN = 4.5;
      const pcm16 = new Int16Array(downsampledBuffer.length);
      for (let i = 0; i < downsampledBuffer.length; i++) {
        let pcmValue = downsampledBuffer[i] * POST_GAIN * 32768;
        pcmValue = Math.max(-32768, Math.min(32767, pcmValue));
        pcm16[i] = Math.round(pcmValue);
      }
      console.log(
        `[DeepFilter] \u{1F4E4} Sending PCM16 chunk: ${pcm16.length} samples @ 24kHz (${(pcm16.length / 24e3 * 1e3).toFixed(1)}ms)`
      );
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
};
registerProcessor("deepfilter-processor", DeepFilterProcessor);
//# sourceMappingURL=deepfilter-worklet.js.map
