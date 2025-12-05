// public/_worklets/rnnoise.js
var createRNNWasmModule = (() => {
  var _scriptDir = typeof document !== "undefined" && document.currentScript ? document.currentScript.src : void 0;
  return (function(createRNNWasmModule2) {
    createRNNWasmModule2 = createRNNWasmModule2 || {};
    null;
    var Module = typeof createRNNWasmModule2 != "undefined" ? createRNNWasmModule2 : {};
    var readyPromiseResolve, readyPromiseReject;
    Module["ready"] = new Promise(function(resolve, reject) {
      readyPromiseResolve = resolve;
      readyPromiseReject = reject;
    });
    var moduleOverrides = Object.assign({}, Module);
    var arguments_ = [];
    var thisProgram = "./this.program";
    var quit_ = (status, toThrow) => {
      throw toThrow;
    };
    var ENVIRONMENT_IS_WEB = typeof window == "object";
    var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";
    var ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string";
    var scriptDirectory = "";
    function locateFile(path) {
      if (Module["locateFile"]) {
        return Module["locateFile"](path, scriptDirectory);
      }
      return scriptDirectory + path;
    }
    var read_, readAsync, readBinary, setWindowTitle;
    if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href;
      } else if (typeof document != "undefined" && document.currentScript) {
        scriptDirectory = document.currentScript.src;
      }
      if (_scriptDir) {
        scriptDirectory = _scriptDir;
      }
      if (scriptDirectory.indexOf("blob:") !== 0) {
        scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1);
      } else {
        scriptDirectory = "";
      }
      {
        read_ = (url) => {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          xhr.send(null);
          return xhr.responseText;
        };
        if (ENVIRONMENT_IS_WORKER) {
          readBinary = (url) => {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.responseType = "arraybuffer";
            xhr.send(null);
            return new Uint8Array(xhr.response);
          };
        }
        readAsync = (url, onload, onerror) => {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, true);
          xhr.responseType = "arraybuffer";
          xhr.onload = () => {
            if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
              onload(xhr.response);
              return;
            }
            onerror();
          };
          xhr.onerror = onerror;
          xhr.send(null);
        };
      }
      setWindowTitle = (title) => document.title = title;
    } else {
    }
    var out = Module["print"] || console.log.bind(console);
    var err = Module["printErr"] || console.warn.bind(console);
    Object.assign(Module, moduleOverrides);
    moduleOverrides = null;
    if (Module["arguments"]) arguments_ = Module["arguments"];
    if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
    if (Module["quit"]) quit_ = Module["quit"];
    var wasmBinary;
    if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
    var noExitRuntime = Module["noExitRuntime"] || true;
    if (typeof WebAssembly != "object") {
      abort("no native wasm support detected");
    }
    var wasmMemory;
    var ABORT = false;
    var EXITSTATUS;
    var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
    function updateGlobalBufferAndViews(buf) {
      buffer = buf;
      Module["HEAP8"] = HEAP8 = new Int8Array(buf);
      Module["HEAP16"] = HEAP16 = new Int16Array(buf);
      Module["HEAP32"] = HEAP32 = new Int32Array(buf);
      Module["HEAPU8"] = HEAPU8 = new Uint8Array(buf);
      Module["HEAPU16"] = HEAPU16 = new Uint16Array(buf);
      Module["HEAPU32"] = HEAPU32 = new Uint32Array(buf);
      Module["HEAPF32"] = HEAPF32 = new Float32Array(buf);
      Module["HEAPF64"] = HEAPF64 = new Float64Array(buf);
    }
    var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 16777216;
    var wasmTable;
    var __ATPRERUN__ = [];
    var __ATINIT__ = [];
    var __ATPOSTRUN__ = [];
    var runtimeInitialized = false;
    function preRun() {
      if (Module["preRun"]) {
        if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
        while (Module["preRun"].length) {
          addOnPreRun(Module["preRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPRERUN__);
    }
    function initRuntime() {
      runtimeInitialized = true;
      callRuntimeCallbacks(__ATINIT__);
    }
    function postRun() {
      if (Module["postRun"]) {
        if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
        while (Module["postRun"].length) {
          addOnPostRun(Module["postRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPOSTRUN__);
    }
    function addOnPreRun(cb) {
      __ATPRERUN__.unshift(cb);
    }
    function addOnInit(cb) {
      __ATINIT__.unshift(cb);
    }
    function addOnPostRun(cb) {
      __ATPOSTRUN__.unshift(cb);
    }
    var runDependencies = 0;
    var runDependencyWatcher = null;
    var dependenciesFulfilled = null;
    function addRunDependency(id) {
      runDependencies++;
      if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies);
      }
    }
    function removeRunDependency(id) {
      runDependencies--;
      if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies);
      }
      if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
        }
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled;
          dependenciesFulfilled = null;
          callback();
        }
      }
    }
    function abort(what) {
      {
        if (Module["onAbort"]) {
          Module["onAbort"](what);
        }
      }
      what = "Aborted(" + what + ")";
      err(what);
      ABORT = true;
      EXITSTATUS = 1;
      what += ". Build with -sASSERTIONS for more info.";
      var e = new WebAssembly.RuntimeError(what);
      readyPromiseReject(e);
      throw e;
    }
    var dataURIPrefix = "data:application/octet-stream;base64,";
    function isDataURI(filename) {
      return filename.startsWith(dataURIPrefix);
    }
    var wasmBinaryFile;
    wasmBinaryFile = "rnnoise.wasm";
    if (!isDataURI(wasmBinaryFile)) {
      wasmBinaryFile = locateFile(wasmBinaryFile);
    }
    function getBinary(file) {
      try {
        if (file == wasmBinaryFile && wasmBinary) {
          return new Uint8Array(wasmBinary);
        }
        if (readBinary) {
          return readBinary(file);
        } else {
          throw "both async and sync fetching of the wasm failed";
        }
      } catch (err2) {
        abort(err2);
      }
    }
    function getBinaryPromise() {
      if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
        if (typeof fetch == "function") {
          return fetch(wasmBinaryFile, {
            credentials: "same-origin"
          }).then(function(response) {
            if (!response["ok"]) {
              throw "failed to load wasm binary file at '" + wasmBinaryFile + "'";
            }
            return response["arrayBuffer"]();
          }).catch(function() {
            return getBinary(wasmBinaryFile);
          });
        }
      }
      return Promise.resolve().then(function() {
        return getBinary(wasmBinaryFile);
      });
    }
    function createWasm() {
      var info = {
        "a": asmLibraryArg
      };
      function receiveInstance(instance, module) {
        var exports2 = instance.exports;
        Module["asm"] = exports2;
        wasmMemory = Module["asm"]["c"];
        updateGlobalBufferAndViews(wasmMemory.buffer);
        wasmTable = Module["asm"]["k"];
        addOnInit(Module["asm"]["d"]);
        removeRunDependency("wasm-instantiate");
      }
      addRunDependency("wasm-instantiate");
      function receiveInstantiationResult(result) {
        receiveInstance(result["instance"]);
      }
      function instantiateArrayBuffer(receiver) {
        return getBinaryPromise().then(function(binary) {
          return WebAssembly.instantiate(binary, info);
        }).then(function(instance) {
          return instance;
        }).then(receiver, function(reason) {
          err("failed to asynchronously prepare wasm: " + reason);
          abort(reason);
        });
      }
      function instantiateAsync() {
        if (!wasmBinary && typeof WebAssembly.instantiateStreaming == "function" && !isDataURI(wasmBinaryFile) && typeof fetch == "function") {
          return fetch(wasmBinaryFile, {
            credentials: "same-origin"
          }).then(function(response) {
            var result = WebAssembly.instantiateStreaming(response, info);
            return result.then(receiveInstantiationResult, function(reason) {
              err("wasm streaming compile failed: " + reason);
              err("falling back to ArrayBuffer instantiation");
              return instantiateArrayBuffer(receiveInstantiationResult);
            });
          });
        } else {
          return instantiateArrayBuffer(receiveInstantiationResult);
        }
      }
      if (Module["instantiateWasm"]) {
        try {
          var exports = Module["instantiateWasm"](info, receiveInstance);
          return exports;
        } catch (e) {
          err("Module.instantiateWasm callback failed with error: " + e);
          return false;
        }
      }
      instantiateAsync().catch(readyPromiseReject);
      return {};
    }
    function callRuntimeCallbacks(callbacks) {
      while (callbacks.length > 0) {
        var callback = callbacks.shift();
        if (typeof callback == "function") {
          callback(Module);
          continue;
        }
        var func = callback.func;
        if (typeof func == "number") {
          if (callback.arg === void 0) {
            getWasmTableEntry(func)();
          } else {
            getWasmTableEntry(func)(callback.arg);
          }
        } else {
          func(callback.arg === void 0 ? null : callback.arg);
        }
      }
    }
    function getWasmTableEntry(funcPtr) {
      return wasmTable.get(funcPtr);
    }
    function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.copyWithin(dest, src, src + num);
    }
    function getHeapMax() {
      return 2147483648;
    }
    function emscripten_realloc_buffer(size) {
      try {
        wasmMemory.grow(size - buffer.byteLength + 65535 >>> 16);
        updateGlobalBufferAndViews(wasmMemory.buffer);
        return 1;
      } catch (e) {
      }
    }
    function _emscripten_resize_heap(requestedSize) {
      var oldSize = HEAPU8.length;
      requestedSize = requestedSize >>> 0;
      var maxHeapSize = getHeapMax();
      if (requestedSize > maxHeapSize) {
        return false;
      }
      let alignUp = (x, multiple) => x + (multiple - x % multiple) % multiple;
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
        var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));
        var replacement = emscripten_realloc_buffer(newSize);
        if (replacement) {
          return true;
        }
      }
      return false;
    }
    var asmLibraryArg = {
      "b": _emscripten_memcpy_big,
      "a": _emscripten_resize_heap
    };
    var asm = createWasm();
    var ___wasm_call_ctors = Module["___wasm_call_ctors"] = function() {
      return (___wasm_call_ctors = Module["___wasm_call_ctors"] = Module["asm"]["d"]).apply(null, arguments);
    };
    var _rnnoise_init = Module["_rnnoise_init"] = function() {
      return (_rnnoise_init = Module["_rnnoise_init"] = Module["asm"]["e"]).apply(null, arguments);
    };
    var _rnnoise_create = Module["_rnnoise_create"] = function() {
      return (_rnnoise_create = Module["_rnnoise_create"] = Module["asm"]["f"]).apply(null, arguments);
    };
    var _malloc = Module["_malloc"] = function() {
      return (_malloc = Module["_malloc"] = Module["asm"]["g"]).apply(null, arguments);
    };
    var _rnnoise_destroy = Module["_rnnoise_destroy"] = function() {
      return (_rnnoise_destroy = Module["_rnnoise_destroy"] = Module["asm"]["h"]).apply(null, arguments);
    };
    var _free = Module["_free"] = function() {
      return (_free = Module["_free"] = Module["asm"]["i"]).apply(null, arguments);
    };
    var _rnnoise_process_frame = Module["_rnnoise_process_frame"] = function() {
      return (_rnnoise_process_frame = Module["_rnnoise_process_frame"] = Module["asm"]["j"]).apply(null, arguments);
    };
    var calledRun;
    dependenciesFulfilled = function runCaller() {
      if (!calledRun) run();
      if (!calledRun) dependenciesFulfilled = runCaller;
    };
    function run(args) {
      args = args || arguments_;
      if (runDependencies > 0) {
        return;
      }
      preRun();
      if (runDependencies > 0) {
        return;
      }
      function doRun() {
        if (calledRun) return;
        calledRun = true;
        Module["calledRun"] = true;
        if (ABORT) return;
        initRuntime();
        readyPromiseResolve(Module);
        if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
        postRun();
      }
      if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout(function() {
          setTimeout(function() {
            Module["setStatus"]("");
          }, 1);
          doRun();
        }, 1);
      } else {
        doRun();
      }
    }
    Module["run"] = run;
    if (Module["preInit"]) {
      if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
      while (Module["preInit"].length > 0) {
        Module["preInit"].pop()();
      }
    }
    run();
    return createRNNWasmModule2.ready;
  });
})();
var rnnoise_default = createRNNWasmModule;

// src/worklets/rnnoise-worklet.source.js
var RNNOISE_CONFIG = {
  SAMPLE_RATE: 24e3,
  FRAME_SIZE: 480,
  // RNNoise uses 480 samples per frame (10ms @ 48kHz)
  PCM_FREQUENCY: 48e3
  // RNNoise internally works at 48kHz
};
var rnnoiseWasmModule = null;
var rnnoiseInitPromise = null;
var RNNoiseLightProcessor = class extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.initialized = false;
    this.rnnoiseState = null;
    this.inputBuffer = new Float32Array(RNNOISE_CONFIG.FRAME_SIZE);
    this.outputBuffer = new Float32Array(RNNOISE_CONFIG.FRAME_SIZE);
    this.bufferPos = 0;
    this.accumulatedOutput = [];
    this.MIN_SEND_SIZE = 2400;
    this.heapInputBuffer = null;
    this.heapOutputBuffer = null;
    this.outputReadPos = 0;
    this.outputWritePos = 0;
    this.wasmBytes = options?.processorOptions?.wasmBytes;
    console.log("[RNNoise LIGHT] Initializing...");
    console.log(
      "[RNNoise LIGHT] WASM bytes received:",
      this.wasmBytes ? "YES" : "NO"
    );
    this.initRNNoise();
  }
  async initRNNoise() {
    try {
      console.log("[RNNoise LIGHT] Initializing RNNoise WASM module...");
      if (!rnnoiseWasmModule && !rnnoiseInitPromise) {
        if (!this.wasmBytes) {
          throw new Error("WASM bytes not provided in processorOptions");
        }
        console.log("[RNNoise LIGHT] Creating Emscripten module...");
        rnnoiseInitPromise = rnnoise_default({
          wasmBinary: this.wasmBytes,
          locateFile: (path) => {
            return path;
          }
        });
        rnnoiseWasmModule = await rnnoiseInitPromise;
        console.log("[RNNoise LIGHT] \u2705 Emscripten module created");
      } else if (rnnoiseInitPromise) {
        rnnoiseWasmModule = await rnnoiseInitPromise;
      }
      this.rnnoiseState = rnnoiseWasmModule._rnnoise_create(null);
      if (!this.rnnoiseState) {
        throw new Error("Failed to create RNNoise state");
      }
      const heapSize = RNNOISE_CONFIG.FRAME_SIZE * Float32Array.BYTES_PER_ELEMENT;
      this.heapInputBuffer = rnnoiseWasmModule._malloc(heapSize);
      this.heapOutputBuffer = rnnoiseWasmModule._malloc(heapSize);
      if (!this.heapInputBuffer || !this.heapOutputBuffer) {
        throw new Error("Failed to allocate WASM heap buffers");
      }
      this.initialized = true;
      console.log("[RNNoise LIGHT] \u2705 Initialized successfully @ 24kHz");
      console.log("  Frame size:", RNNOISE_CONFIG.FRAME_SIZE);
      console.log("  Sample rate:", RNNOISE_CONFIG.SAMPLE_RATE);
      this.port.postMessage("ready");
    } catch (error) {
      console.error("[RNNoise LIGHT] \u274C Initialization failed:", error);
      this.port.postMessage({ type: "error", message: error.message });
    }
  }
  async loadRNNoiseWasm(wasmBytes) {
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
        }
      }
    };
    const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
    const module = {
      _rnnoise_create: instance.exports.rnnoise_create,
      _rnnoise_destroy: instance.exports.rnnoise_destroy,
      _rnnoise_process_frame: instance.exports.rnnoise_process_frame,
      _malloc: instance.exports.malloc,
      _free: instance.exports.free,
      HEAPF32: new Float32Array(imports.env.memory.buffer),
      HEAP8: new Int8Array(imports.env.memory.buffer)
    };
    return module;
  }
  process(inputs, outputs) {
    if (!this.initialized) {
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
    let outputReadPos = this.outputReadPos || 0;
    let outputWritePos = this.outputWritePos || 0;
    for (let i = 0; i < blockSize; i++) {
      this.inputBuffer[this.bufferPos++] = inputChannel[i];
      if (this.bufferPos >= RNNOISE_CONFIG.FRAME_SIZE) {
        this.processFrame();
        this.bufferPos = 0;
        outputWritePos = RNNOISE_CONFIG.FRAME_SIZE;
      }
    }
    if (outputWritePos > 0) {
      for (let i = 0; i < RNNOISE_CONFIG.FRAME_SIZE; i++) {
        this.accumulatedOutput.push(this.outputBuffer[i]);
      }
      outputWritePos = 0;
      outputReadPos = 0;
    }
    if (this.accumulatedOutput.length >= this.MIN_SEND_SIZE) {
      const pcm16 = new Int16Array(this.accumulatedOutput.length);
      for (let i = 0; i < this.accumulatedOutput.length; i++) {
        const sample = Math.max(-1, Math.min(1, this.accumulatedOutput[i]));
        pcm16[i] = sample < 0 ? sample * 32768 : sample * 32767;
      }
      this.port.postMessage(
        {
          type: "pcm16",
          data: pcm16.buffer
        },
        [pcm16.buffer]
      );
      this.accumulatedOutput = [];
    }
    this.outputReadPos = outputReadPos;
    this.outputWritePos = outputWritePos;
    if (outputChannel) {
      outputChannel.fill(0);
    }
    return true;
  }
  processFrame() {
    try {
      rnnoiseWasmModule.HEAPF32.set(
        this.inputBuffer,
        this.heapInputBuffer / Float32Array.BYTES_PER_ELEMENT
      );
      rnnoiseWasmModule._rnnoise_process_frame(
        this.rnnoiseState,
        this.heapOutputBuffer,
        this.heapInputBuffer
      );
      this.outputBuffer.set(
        rnnoiseWasmModule.HEAPF32.subarray(
          this.heapOutputBuffer / Float32Array.BYTES_PER_ELEMENT,
          this.heapOutputBuffer / Float32Array.BYTES_PER_ELEMENT + RNNOISE_CONFIG.FRAME_SIZE
        )
      );
    } catch (error) {
      console.error("[RNNoise LIGHT] Frame processing error:", error);
      this.outputBuffer.set(this.inputBuffer);
    }
  }
};
registerProcessor("rnnoise-processor", RNNoiseLightProcessor);
//# sourceMappingURL=rnnoise-worklet.js.map
