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
      return;
    }
    this.#setState(AudioServiceStatus.INITIALIZING);
    this.onProcessedDataCallback = onProcessedData;

    // PASO 1: Detectar modo óptimo (PREMIUM o LIGHT)
    const detectedMode =
      forcedMode || (await DeviceCapabilityDetector.detectOptimalMode());
    this.currentMode = detectedMode;
    this.currentModeConfig = AUDIO_MODES[detectedMode];

    console.log(
      `🚀 Starting audio service in ${detectedMode} mode`,
      this.currentModeConfig
    );

    this.#setToast(`Audio Mode: ${this.currentModeConfig.name}`);

    try {
      await this.#updateDevices();
      await this.#setupAudioStream(this.#selectedDeviceId);
    } catch (error) {
      if (
        error.name === "NotReadableError" &&
        this.#selectedDeviceId !== "default"
      ) {
        console.warn(
          `Mic '${this.#selectedDeviceId}' is in use. Falling back to default.`
        );
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

  stop() {
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
        console.error(
          `Failed to load ${this.currentMode} worklet module:`,
          moduleError
        );
        throw new Error(`${this.currentMode} module loading failed`);
      }

      // Load WASM for pre-initialization
      console.log(`📦 Pre-loading WASM for ${this.currentMode} mode...`);
      let wasmBytes, modelBytes;

      if (this.currentMode === "PREMIUM") {
        [wasmBytes, modelBytes] = await Promise.all([
          WasmLoader.loadDeepFilterNetWasm(),
          WasmLoader.loadDeepFilterNetModel(),
        ]);
        console.log(
          `✓ Pre-loaded DeepFilterNet WASM (${wasmBytes.byteLength} bytes) and model (${modelBytes.byteLength} bytes)`
        );
      } else {
        wasmBytes = await WasmLoader.loadRNNoiseWasm();
        console.log(
          `✓ Pre-loaded RNNoise WASM (${wasmBytes.byteLength} bytes)`
        );
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

      const silent = tempContext.createBufferSource();
      silent.buffer = tempContext.createBuffer(
        1,
        1,
        this.currentModeConfig.PROCESSING_SAMPLE_RATE
      );
      silent.loop = true;
      silent.connect(tempWorklet);
      silent.start();

      this.preInitContext = tempContext;
      this.preInitWorklet = tempWorklet;
      this.dtlnInitialized = true;
      console.log(
        `${this.currentMode} model pre-initialization successful @ ${this.currentModeConfig.PROCESSING_SAMPLE_RATE}Hz`
      );
    } catch (error) {
      console.error("Model pre-initialization failed:", error);
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
        deviceId: deviceId === "default" ? undefined : { exact: deviceId },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // No forzar channelCount, dejar que el navegador decida
      },
    });
  }

  async #setupAudioProcessing() {
    try {
      const processingRate = this.currentModeConfig.PROCESSING_SAMPLE_RATE;

      console.log(
        `⚙️ Setting up audio processing @ ${processingRate}Hz (${this.currentMode} mode)`
      );

      // Reutilizar el contexto pre-inicializado si está disponible
      if (this.preInitContext && this.preInitContext.state !== "closed") {
        this.audioContext = this.preInitContext;
        this.workletNode = this.preInitWorklet;
        this.preInitContext = null;
        this.preInitWorklet = null;

        if (this.audioContext.state === "suspended") {
          await this.audioContext.resume();
        }

        console.log("✓ Reusing pre-initialized AudioContext");

        // Asegurarse de que el worklet esté listo
        if (!this.dtlnInitialized) {
          console.warn("Model was not properly initialized");
          throw new Error("Model not ready, forcing re-initialization");
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
        console.log(`📦 Loading WASM for ${this.currentMode} mode...`);
        let wasmBytes, modelBytes;

        if (this.currentMode === "PREMIUM") {
          // DeepFilterNet requires both WASM binary and model
          [wasmBytes, modelBytes] = await Promise.all([
            WasmLoader.loadDeepFilterNetWasm(),
            WasmLoader.loadDeepFilterNetModel(),
          ]);
          console.log(
            `✓ Loaded DeepFilterNet WASM (${wasmBytes.byteLength} bytes) and model (${modelBytes.byteLength} bytes)`
          );
        } else {
          // RNNoise only needs WASM binary
          wasmBytes = await WasmLoader.loadRNNoiseWasm();
          console.log(`✓ Loaded RNNoise WASM (${wasmBytes.byteLength} bytes)`);
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
          new Promise((resolve) => {
            this.workletNode.port.onmessage = (event) => {
              if (event.data === "ready") resolve(true);
            };
          }),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(`${this.currentMode} model initialization timeout`)
                ),
              10000
            )
          ),
        ]);

        if (!modelReady) {
          throw new Error(`${this.currentMode} model failed to initialize`);
        }

        console.log(`✓ ${this.currentMode} model initialized successfully`);
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
        console.error("Failed to connect audio nodes:", connectionError);
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

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PASO FINAL: Iniciar monitoreo de rendimiento
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      this.#startRuntimeMonitoring();
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

    this.runtimeMonitorId = DeviceCapabilityDetector.monitorRuntime(
      (action) => {
        if (action === "DOWNGRADE" && this.currentMode === "PREMIUM") {
          console.warn("⚠️ CPU overload detected, switching to LIGHT mode");
          this.#setToast("Switching to Light mode due to high CPU usage");
          // TODO: Implementar hot-swap de modo sin reiniciar
          // Por ahora solo alertamos
        } else if (action === "UPGRADE" && this.currentMode === "LIGHT") {
          console.log("✅ CPU available, can upgrade to PREMIUM mode");
          this.#setToast("Device can handle Premium mode");
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
    // Solo cerrar si no estamos reutilizando el contexto
    if (this.audioContext && this.audioContext.state !== "closed") {
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
