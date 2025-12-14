import {
  AUDIO_CAPTURE_CONFIG,
  AUDIO_MODES,
  AudioServiceStatus,
} from "../constants/audioConstants";
import { DeviceCapabilityDetector } from "../utils/deviceCapabilityDetector";
import { WasmLoader } from "../utils/wasmLoader";

class LocalAudioService {
  static instance;

  #status = AudioServiceStatus.IDLE;
  #errorMessage = null;
  #toastMessage = null;
  #devices = [];
  #selectedDeviceId = "default";

  // Estado del modo de procesamiento
  currentMode = null;
  currentModeConfig = null;
  runtimeMonitorId = null;

  onProcessedDataCallback = null;
  audioContext = null;
  stream = null;
  workletNode = null;
  microphoneSource = null;
  captureWorklet = null;
  dtlnInitialized = false;
  preInitContext = null;
  preInitWorklet = null;
  preInitSilentSource = null; // Para detener el loop infinito

  onStateChange = () => {};

  constructor() {
    this.handleDeviceChange = this.handleDeviceChange.bind(this);
  }

  static getInstance() {
    if (!LocalAudioService.instance) {
      LocalAudioService.instance = new LocalAudioService();
    }
    return LocalAudioService.instance;
  }

  init(onStateChangeCallback = null) {
    this.onStateChange = onStateChangeCallback || (() => {});

    navigator.mediaDevices.addEventListener(
      "devicechange",
      this.handleDeviceChange
    );
    this.#setState(AudioServiceStatus.IDLE);
    this.#updateDevices().catch(() => {});
  }

  async start(onProcessedData, forcedMode = null) {
    if (
      this.#status === AudioServiceStatus.CAPTURING ||
      this.#status === AudioServiceStatus.INITIALIZING
    ) {
      console.log(
        "[AudioService] Already starting/started, returning existing stream"
      );
      return this.stream;
    }

    this.#setState(AudioServiceStatus.INITIALIZING);
    this.onProcessedDataCallback = onProcessedData;

    // PASO 1: Detectar modo óptimo (PREMIUM o LIGHT)
    const detectedMode =
      forcedMode || (await DeviceCapabilityDetector.detectOptimalMode());
    this.currentMode = detectedMode;
    this.currentModeConfig = AUDIO_MODES[detectedMode];

    this.#setToast(`Audio Mode: ${this.currentModeConfig.name}`);

    try {
      await this.#updateDevices();
      await this.#setupAudioStream(this.#selectedDeviceId);
    } catch (error) {
      if (
        error.name === "NotReadableError" &&
        this.#selectedDeviceId !== "default"
      ) {
        this.#selectedDeviceId = "default";
        this.#setToast("Microphone is in use, switched to default device.");
        try {
          await this.#setupAudioStream(this.#selectedDeviceId);
        } catch (fallbackError) {
          this.#handleStreamError(fallbackError);
          throw fallbackError;
        }
      } else {
        this.#handleStreamError(error);
        throw error;
      }
    }

    try {
      await this.#setupAudioProcessing();
      this.unmute();
      return this.stream;
    } catch (processingError) {
      this.#handleStreamError(processingError);
      throw processingError;
    }
  }

  startProcessing() {
    // Tell worklet to start processing audio NOW and wait for first audio confirmation
    return new Promise((resolve) => {
      if (this.workletNode) {
        // Listen for first audio signal from worklet
        const firstAudioHandler = (event) => {
          if (event.data?.type === "firstAudio") {
            this.workletNode.port.removeEventListener(
              "message",
              firstAudioHandler
            );
            resolve();
          }
        };

        this.workletNode.port.addEventListener("message", firstAudioHandler);
        this.workletNode.port.postMessage("start");

        // Fallback: resolve after 500ms even if no audio detected
        setTimeout(() => {
          this.workletNode.port.removeEventListener(
            "message",
            firstAudioHandler
          );
          resolve();
        }, 500);
      } else {
        resolve();
      }
    });
  }

  stop() {
    // Stop processing immediately - no more output
    if (this.workletNode) {
      this.workletNode.port.postMessage("stop");
      this.workletNode.port.postMessage("flush");
    }

    // Disconnect audio source to stop input flow
    if (this.microphoneSource) {
      this.microphoneSource.disconnect();
    }

    this.onProcessedDataCallback = null;
    this.#destroy();
    this.#setState(AudioServiceStatus.IDLE);
  }

  mute() {
    if (!this.stream) return;
    this.stream.getTracks().forEach((track) => (track.enabled = false));
    this.#setState(AudioServiceStatus.MUTED);
  }

  unmute() {
    if (!this.stream) return;
    this.stream.getTracks().forEach((track) => (track.enabled = true));
    this.#setState(AudioServiceStatus.CAPTURING);
  }

  setSelectedDevice(deviceId) {
    if (this.#selectedDeviceId === deviceId) return;
    this.#selectedDeviceId = deviceId;
    this.#notifyState();

    if (this.#status === AudioServiceStatus.CAPTURING) {
      this.stop();
      this.#setToast("Device changed. Please restart recording.");
    }
  }

  #setState(newStatus, errorMessage = null) {
    this.#status = newStatus;
    this.#errorMessage = errorMessage;
    this.#notifyState();
  }

  #setToast(message) {
    this.#toastMessage = message;
    this.#notifyState();
    setTimeout(() => {
      this.#toastMessage = null;
      this.#notifyState();
    }, 4000);
  }

  #notifyState() {
    this.onStateChange({
      status: this.#status,
      errorMessage: this.#errorMessage,
      toastMessage: this.#toastMessage,
      devices: [...this.#devices],
      selectedDeviceId: this.#selectedDeviceId,
    });
  }

  async #preInitializeDTLN() {
    if (this.dtlnInitialized) return;

    try {
      // AudioContext a la tasa del modo actual
      const sampleRate = this.currentModeConfig.PROCESSING_SAMPLE_RATE;

      const tempContext = new (window.AudioContext ||
        window.webkitAudioContext)({
        sampleRate: sampleRate,
      });

      // Verificar estado del contexto
      if (tempContext.state === "suspended") {
        await tempContext.resume();
      }

      // Seleccionar el worklet según el modo
      const workletPath = this.getWorkletPath(this.currentMode);
      const workletURL = new URL(
        `${import.meta.env.BASE_URL}${workletPath}`,
        window.location.origin
      );

      try {
        await tempContext.audioWorklet.addModule(workletURL.href);
      } catch (moduleError) {
        throw new Error(`${this.currentMode} module loading failed`);
      }

      // Load WASM for pre-initialization
      let wasmBytes, modelBytes;

      if (this.currentMode === "PREMIUM") {
        [wasmBytes, modelBytes] = await Promise.all([
          WasmLoader.loadDeepFilterNetWasm(),
          WasmLoader.loadDeepFilterNetModel(),
        ]);
      } else {
        wasmBytes = await WasmLoader.loadRNNoiseWasm();
      }

      const processorName = this.getProcessorName(this.currentMode);
      const tempWorklet = new AudioWorkletNode(tempContext, processorName, {
        processorOptions: {
          disableMetrics: true,
          mode: this.currentMode,
          wasmBytes,
          modelBytes,
        },
      });

      // Esperar inicialización con timeout más robusto
      const initPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("DTLN pre-initialization timeout"));
        }, 5000);

        tempWorklet.port.onmessage = (event) => {
          if (event.data === "ready") {
            clearTimeout(timeout);
            resolve();
          }
        };
      });

      await initPromise;

      // FIXED: NO usar loop infinito - solo mantener contexto activo brevemente
      const silent = tempContext.createBufferSource();
      silent.buffer = tempContext.createBuffer(
        1,
        tempContext.sampleRate, // 1 segundo de silencio
        this.currentModeConfig.PROCESSING_SAMPLE_RATE
      );
      silent.loop = false; // CRITICAL: NO loop infinito
      silent.connect(tempWorklet);
      silent.start();

      this.preInitContext = tempContext;
      this.preInitWorklet = tempWorklet;
      this.preInitSilentSource = silent; // Guardar referencia
      this.dtlnInitialized = true;
    } catch (error) {
      // Limpiar recursos si falló
      if (this.preInitContext) {
        try {
          this.preInitContext.close();
        } catch {}
        this.preInitContext = null;
      }
      this.preInitWorklet = null;
      throw error;
    }
  }

  async #setupAudioStream(deviceId) {
    this.#destroyStream();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Safari-compatible: use string directly instead of { exact: deviceId }
        deviceId: deviceId === "default" ? undefined : deviceId,

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // Disable all browser processing - we handle everything in worklets
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // Request highest quality capture settings
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        sampleRate: { ideal: 48000 }, // Maximum sample rate for best frequency resolution
        sampleSize: { ideal: 16 }, // 16-bit PCM (standard for voice)
        channelCount: { ideal: 1 }, // Mono (required for processing)

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // Advanced constraints for studio-grade capture
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        latency: { ideal: 0.01 }, // 10ms target latency (low-latency mode)

        // Advanced processing disabled (some browsers support these)
        googEchoCancellation: false,
        googAutoGainControl: false,
        googNoiseSuppression: false,
        googHighpassFilter: false,
        googTypingNoiseDetection: false,
        googAudioMirroring: false,
      },
    });
  }

  async #setupAudioProcessing() {
    try {
      const processingRate = this.currentModeConfig.PROCESSING_SAMPLE_RATE;

      // Reutilizar el contexto pre-inicializado si está disponible
      if (this.preInitContext && this.preInitContext.state !== "closed") {
        console.log(`[${this.currentMode}] Reusing pre-initialized context`);
        this.audioContext = this.preInitContext;
        this.workletNode = this.preInitWorklet;

        // FIXED: Detener silentSource antes de perder la referencia
        if (this.preInitSilentSource) {
          try {
            this.preInitSilentSource.stop();
            this.preInitSilentSource.disconnect();
          } catch (e) {
            // Ya estaba detenido, ignorar
          }
          this.preInitSilentSource = null;
        }

        this.preInitContext = null;
        this.preInitWorklet = null;

        if (this.audioContext.state === "suspended") {
          await this.audioContext.resume();
        }

        // Asegurarse de que el worklet esté listo
        if (!this.dtlnInitialized) {
          throw new Error("Model not ready, forcing re-initialization");
        }
      } else if (
        this.audioContext &&
        this.audioContext.state !== "closed" &&
        this.audioContext.sampleRate === processingRate
      ) {
        // Reutilizar audioContext existente si coincide con el sample rate
        console.log(`[${this.currentMode}] Reusing existing AudioContext`);

        if (this.audioContext.state === "suspended") {
          await this.audioContext.resume();
        }

        // Necesitamos crear un nuevo worklet node
        const workletPath = this.getWorkletPath(this.currentMode);
        const workletURL = new URL(
          `${import.meta.env.BASE_URL}${workletPath}`,
          window.location.origin
        );

        try {
          await this.audioContext.audioWorklet.addModule(workletURL.href);
        } catch (e) {
          // Module might already be loaded
          console.log("Worklet module already loaded or error:", e.message);
        }

        // Load WASM files based on current mode
        let wasmBytes, modelBytes;

        if (this.currentMode === "PREMIUM") {
          [wasmBytes, modelBytes] = await Promise.all([
            WasmLoader.loadDeepFilterNetWasm(),
            WasmLoader.loadDeepFilterNetModel(),
          ]);
        } else {
          wasmBytes = await WasmLoader.loadRNNoiseWasm();
        }

        const processorName = this.getProcessorName(this.currentMode);
        this.workletNode = new AudioWorkletNode(
          this.audioContext,
          processorName,
          {
            processorOptions: {
              disableMetrics: true,
              mode: this.currentMode,
              wasmBytes,
              modelBytes,
            },
          }
        );

        // Store current mode on worklet for reuse checks
        this.workletNode._currentMode = this.currentMode;

        // Wait for ready message
        const modelReady = await Promise.race([
          new Promise((resolve, reject) => {
            const readyHandler = (event) => {
              console.log(`[${this.currentMode}] Worklet message:`, event.data);
              if (event.data === "ready") {
                console.log(`[${this.currentMode}] ✅ Model ready`);
                this.workletNode.port.removeEventListener(
                  "message",
                  readyHandler
                );
                resolve(true);
              } else if (event.data?.type === "error") {
                console.error(
                  `[${this.currentMode}] ❌ Initialization error:`,
                  event.data.message
                );
                this.workletNode.port.removeEventListener(
                  "message",
                  readyHandler
                );
                reject(new Error(event.data.message));
              }
            };
            this.workletNode.port.addEventListener("message", readyHandler);
            this.workletNode.port.start();
          }),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `${this.currentMode} model initialization timeout (15s)`
                  )
                ),
              15000
            )
          ),
        ]);

        if (!modelReady) {
          throw new Error(`${this.currentMode} model failed to initialize`);
        }
      } else {
        // Crear nuevo contexto a la tasa del modo actual
        this.audioContext = new (window.AudioContext ||
          window.webkitAudioContext)({
          sampleRate: processingRate,
        });

        if (this.audioContext.state === "suspended") {
          await this.audioContext.resume();
        }

        const workletPath = this.getWorkletPath(this.currentMode);
        const workletURL = new URL(
          `${import.meta.env.BASE_URL}${workletPath}`,
          window.location.origin
        );
        await this.audioContext.audioWorklet.addModule(workletURL.href);

        // Load WASM files based on current mode
        let wasmBytes, modelBytes;

        if (this.currentMode === "PREMIUM") {
          // DeepFilterNet requires both WASM binary and model
          [wasmBytes, modelBytes] = await Promise.all([
            WasmLoader.loadDeepFilterNetWasm(),
            WasmLoader.loadDeepFilterNetModel(),
          ]);
        } else {
          // RNNoise only needs WASM binary
          wasmBytes = await WasmLoader.loadRNNoiseWasm();
        }

        const processorName = this.getProcessorName(this.currentMode);
        this.workletNode = new AudioWorkletNode(
          this.audioContext,
          processorName,
          {
            processorOptions: {
              disableMetrics: true,
              mode: this.currentMode,
              wasmBytes,
              modelBytes,
            },
          }
        );

        // Wait for model to be ready with timeout
        const modelReady = await Promise.race([
          new Promise((resolve, reject) => {
            const readyHandler = (event) => {
              console.log(`[${this.currentMode}] Worklet message:`, event.data);
              if (event.data === "ready") {
                console.log(`[${this.currentMode}] ✅ Model ready`);
                this.workletNode.port.removeEventListener(
                  "message",
                  readyHandler
                );
                resolve(true);
              } else if (event.data?.type === "error") {
                console.error(
                  `[${this.currentMode}] ❌ Initialization error:`,
                  event.data.message
                );
                this.workletNode.port.removeEventListener(
                  "message",
                  readyHandler
                );
                reject(new Error(event.data.message));
              }
            };
            this.workletNode.port.addEventListener("message", readyHandler);
            this.workletNode.port.start(); // Ensure port is started
          }),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `${this.currentMode} model initialization timeout (10s)`
                  )
                ),
              15000 // Increased timeout to 15s for WASM initialization
            )
          ),
        ]);

        if (!modelReady) {
          throw new Error(`${this.currentMode} model failed to initialize`);
        }
      }

      // Verify audioContext and workletNode are valid before continuing
      if (!this.audioContext || this.audioContext.state === "closed") {
        throw new Error("AudioContext is not available or was closed");
      }

      if (!this.workletNode) {
        throw new Error("WorkletNode was not created");
      }

      if (!this.stream) {
        throw new Error("MediaStream is not available");
      }

      this.microphoneSource = this.audioContext.createMediaStreamSource(
        this.stream
      );

      // Conectar micrófono directamente al worklet de procesamiento
      // Micrófono → Worklet (RNNoise/DeepFilterNet) @ 24kHz/48kHz
      try {
        this.microphoneSource.connect(this.workletNode);
        // No conectar a destination - solo procesamos, no reproducimos
      } catch (connectionError) {
        console.error(
          "[AudioService] Connection error details:",
          connectionError
        );
        throw new Error("Audio processing pipeline connection failed");
      }

      // Recibir audio procesado directamente del worklet
      this.workletNode.port.onmessage = (event) => {
        if (this.#status !== AudioServiceStatus.CAPTURING) return;

        const message = event.data;

        // Handle different message types
        if (message.type === "pcm16") {
          const pcm16DataBuffer = message.data;
          if (!pcm16DataBuffer || pcm16DataBuffer.byteLength === 0) return;

          // El output SIEMPRE es @ 24kHz (requisito obligatorio)
          // En PREMIUM: el worklet hace 48k→24k internamente
          // En LIGHT: el worklet procesa directo @ 24k

          if (this.onProcessedDataCallback) {
            this.onProcessedDataCallback(pcm16DataBuffer);
          }
        }
      };

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO FINAL: Iniciar monitoreo de rendimiento (DISABLED)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Runtime monitoring disabled - causes CPU overhead itself
      // this.#startRuntimeMonitoring();
    } catch (error) {
      console.error("Audio processing setup failed:", error);
      this.#status = AudioServiceStatus.ERROR;
      this.#errorMessage =
        error.message || "Failed to initialize audio processing";
      this.#notifyState();
      throw error;
    }
  }

  #startRuntimeMonitoring() {
    // Cancelar monitoreo previo si existe
    if (this.runtimeMonitorId) {
      clearInterval(this.runtimeMonitorId);
    }

    let upgradeLogged = false;
    let downgradeLogged = false;

    this.runtimeMonitorId = DeviceCapabilityDetector.monitorRuntime(
      (action) => {
        if (action === "DOWNGRADE" && this.currentMode === "PREMIUM") {
          if (!downgradeLogged) {
            console.warn("⚠️ CPU overload detected, switching to LIGHT mode");
            this.#setToast("Switching to Light mode due to high CPU usage");
            downgradeLogged = true;
            upgradeLogged = false;
          }
          // TODO: Implementar hot-swap de modo sin reiniciar
          // Por ahora solo alertamos
        } else if (action === "UPGRADE" && this.currentMode === "LIGHT") {
          if (!upgradeLogged) {
            console.log("✅ CPU available, can upgrade to PREMIUM mode");
            this.#setToast("Device can handle Premium mode");
            upgradeLogged = true;
            downgradeLogged = false;
          }
        }
      }
    );
  }

  #handleStreamError(error) {
    let message;
    switch (error.name) {
      case "NotAllowedError":
        message =
          "Microphone permission denied. Please enable it in your settings.";
        break;
      case "NotFoundError":
        message =
          "The selected microphone was not found. It might be disconnected.";
        break;
      case "NotReadableError":
        message = "The microphone is currently in use by another application.";
        break;
      default:
        message =
          "An unexpected error occurred while accessing the microphone.";
        break;
    }

    console.error(`LocalAudioService Error: ${error.name}`, error);
    this.#destroy();
    this.#setState(AudioServiceStatus.ERROR, message);
  }

  async #updateDevices() {
    const tempStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.#devices = devices.filter((device) => device.kind === "audioinput");
    tempStream.getTracks().forEach((track) => track.stop());
    this.#notifyState();
  }

  async handleDeviceChange() {
    if (
      this.#status !== AudioServiceStatus.IDLE &&
      this.#status !== AudioServiceStatus.PERMISSION_PENDING
    ) {
      await this.#updateDevices().catch(() => {});
      const isSelectedDeviceConnected = this.#devices.some(
        (d) => d.deviceId === this.#selectedDeviceId
      );
      if (!isSelectedDeviceConnected && this.#selectedDeviceId !== "default") {
        this.#setToast(
          "Your microphone has been disconnected, switching to default."
        );
        this.setSelectedDevice("default");
      }
    }
  }

  #destroyStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  #destroy() {
    this.#destroyStream();
    if (this.captureWorklet) {
      this.captureWorklet.port.onmessage = null;
      this.captureWorklet.disconnect();
      this.captureWorklet = null;
    }
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.microphoneSource) {
      this.microphoneSource.disconnect();
      this.microphoneSource = null;
    }
    // Close audio context only if it's NOT the pre-init context
    if (
      this.audioContext &&
      this.audioContext.state !== "closed" &&
      this.audioContext !== this.preInitContext
    ) {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.onProcessedDataCallback = null;
  }

  cleanup() {
    this.stop();

    // Detener monitoreo de rendimiento
    if (this.runtimeMonitorId) {
      clearInterval(this.runtimeMonitorId);
      this.runtimeMonitorId = null;
    }

    // FIXED: Detener silentSource antes de cerrar contexto
    if (this.preInitSilentSource) {
      try {
        this.preInitSilentSource.stop();
        this.preInitSilentSource.disconnect();
      } catch (e) {
        // Ya estaba detenido
      }
      this.preInitSilentSource = null;
    }

    if (this.preInitWorklet) {
      this.preInitWorklet.disconnect();
      this.preInitWorklet = null;
    }
    if (this.preInitContext && this.preInitContext.state !== "closed") {
      this.preInitContext.close();
      this.preInitContext = null;
    }
    this.dtlnInitialized = false;

    navigator.mediaDevices.removeEventListener(
      "devicechange",
      this.handleDeviceChange
    );
  }

  /**
   * Full reset - cleanup everything and return to initial state
   * Used when ending conversation and returning to setup screen
   */
  fullReset() {
    console.log("[AudioService] Full reset initiated");

    // Stop any active processing
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: "cleanup" });
        this.workletNode.port.postMessage("stop");
        this.workletNode.port.postMessage("flush");
        this.workletNode.port.close();
        this.workletNode.disconnect();
      } catch (e) {
        console.warn("Error cleaning worklet:", e);
      }
      this.workletNode = null;
    }

    // Disconnect audio source
    if (this.microphoneSource) {
      try {
        this.microphoneSource.disconnect();
      } catch (e) {
        console.warn("Error disconnecting mic source:", e);
      }
      this.microphoneSource = null;
    }

    // Stop and cleanup stream
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
      });
      this.stream = null;
    }

    // Clear callbacks
    this.onProcessedDataCallback = null;

    // IMPORTANT: Do NOT destroy audioContext - keep it for reuse
    // Just disconnect nodes but preserve the context

    // Clear mode state
    this.currentMode = null;
    this.currentModeConfig = null;

    // Stop monitoring
    if (this.runtimeMonitorId) {
      clearInterval(this.runtimeMonitorId);
      this.runtimeMonitorId = null;
    }

    // Stop pre-init resources
    if (this.preInitSilentSource) {
      try {
        this.preInitSilentSource.stop();
        this.preInitSilentSource.disconnect();
      } catch (e) {
        // Already stopped
      }
      this.preInitSilentSource = null;
    }

    // Reset dtln flag so it can be re-initialized
    this.dtlnInitialized = false;

    // Reset to idle state
    this.#setState(AudioServiceStatus.IDLE);

    console.log("[AudioService] Full reset complete - ready for new session");
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // API Pública adicional
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  getCurrentMode() {
    return this.currentMode;
  }

  getCurrentModeConfig() {
    return this.currentModeConfig;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Helpers para selección de worklets
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  getWorkletPath(mode) {
    const workletMap = {
      LIGHT: "_worklets/rnnoise-worklet.js", // O dtln-audio-worklet.js
      PREMIUM: "_worklets/deepfilter-worklet.js", // DeepFilterNet WASM
    };

    return workletMap[mode] || workletMap.LIGHT;
  }

  getProcessorName(mode) {
    const processorMap = {
      LIGHT: "rnnoise-processor", // RNNoise processor
      PREMIUM: "deepfilter-processor", // DeepFilterNet processor
    };

    return processorMap[mode] || processorMap.LIGHT;
  }
}

export const localAudioService = LocalAudioService.getInstance();
