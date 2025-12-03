import {
  AUDIO_CAPTURE_CONFIG,
  AudioServiceStatus,
} from "../constants/audioConstants";

class LocalAudioService {
  static instance;

  #status = AudioServiceStatus.IDLE;
  #errorMessage = null;
  #toastMessage = null;
  #devices = [];
  #selectedDeviceId = "default";

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

  init(onStateChangeCallback = null, options = {}) {
    this.onStateChange = onStateChangeCallback || (() => {});

    navigator.mediaDevices.addEventListener(
      "devicechange",
      this.handleDeviceChange
    );
    this.#setState(AudioServiceStatus.IDLE);
    this.#updateDevices().catch(() => {});

    // Pre-inicializar DTLN si está habilitado
    if (options.preInitializeDTLN) {
      this.#preInitializeDTLN().catch((error) => {
        console.warn("DTLN pre-initialization failed:", error);
      });
    }
  }

  async start(onProcessedData) {
    if (
      this.#status === AudioServiceStatus.CAPTURING ||
      this.#status === AudioServiceStatus.INITIALIZING
    ) {
      return;
    }
    this.#setState(AudioServiceStatus.INITIALIZING);
    this.onProcessedDataCallback = onProcessedData;

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
      const tempContext = new (window.AudioContext ||
        window.webkitAudioContext)({
        sampleRate: AUDIO_CAPTURE_CONFIG.TRANSMISSION_SAMPLE_RATE,
      });

      // Verificar estado del contexto
      if (tempContext.state === "suspended") {
        await tempContext.resume();
      }

      const workletURL = new URL(
        `${import.meta.env.BASE_URL}_worklets/dtln-audio-worklet.js`,
        window.location.origin
      );

      try {
        await tempContext.audioWorklet.addModule(workletURL.href);
      } catch (moduleError) {
        console.error("Failed to load DTLN worklet module:", moduleError);
        throw new Error("DTLN module loading failed");
      }

      const tempWorklet = new AudioWorkletNode(
        tempContext,
        "NoiseSuppressionWorker",
        {
          processorOptions: { disableMetrics: true },
        }
      );

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
      silent.buffer = tempContext.createBuffer(1, 1, AUDIO_CAPTURE_CONFIG.TRANSMISSION_SAMPLE_RATE);
      silent.loop = true;
      silent.connect(tempWorklet);
      silent.start();

      this.preInitContext = tempContext;
      this.preInitWorklet = tempWorklet;
      this.dtlnInitialized = true;
      console.log("DTLN pre-initialization successful");
    } catch (error) {
      console.error("DTLN pre-initialization failed:", error);
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
      // Reutilizar el contexto pre-inicializado si está disponible
      if (this.preInitContext && this.preInitContext.state !== "closed") {
        this.audioContext = this.preInitContext;
        this.workletNode = this.preInitWorklet;
        this.preInitContext = null;
        this.preInitWorklet = null;

        if (this.audioContext.state === "suspended") {
          await this.audioContext.resume();
        }

        console.log("Reusing pre-initialized AudioContext");

        // Asegurarse de que el worklet esté listo
        // El worklet pre-inicializado ya debería estar listo, pero verificamos
        if (!this.dtlnInitialized) {
          console.warn("DTLN was not properly initialized");
          // Forzar re-inicialización
          throw new Error("DTLN not ready, forcing re-initialization");
        }
      } else {
        // Crear nuevo contexto si no hay pre-inicialización
        this.audioContext = new (window.AudioContext ||
          window.webkitAudioContext)({
          sampleRate: AUDIO_CAPTURE_CONFIG.TRANSMISSION_SAMPLE_RATE,
        });
        if (this.audioContext.state === "suspended")
          await this.audioContext.resume();

        const workletURL = new URL(
          `${import.meta.env.BASE_URL}_worklets/dtln-audio-worklet.js`,
          window.location.origin
        );
        await this.audioContext.audioWorklet.addModule(workletURL.href);

        this.workletNode = new AudioWorkletNode(
          this.audioContext,
          "NoiseSuppressionWorker",
          {
            processorOptions: { disableMetrics: true },
          }
        );

        // Wait for DTLN module to be ready with timeout
        const dtlnReady = await Promise.race([
          new Promise((resolve) => {
            this.workletNode.port.onmessage = (event) => {
              if (event.data === "ready") resolve(true);
            };
          }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("DTLN initialization timeout")),
              10000
            )
          ),
        ]);

        if (!dtlnReady) {
          throw new Error("DTLN module failed to initialize");
        }
      }

      const captureWorkletURL = new URL(
        `${import.meta.env.BASE_URL}_worklets/dtln-capture-processor.js`,
        window.location.origin
      );

      try {
        await this.audioContext.audioWorklet.addModule(captureWorkletURL.href);
      } catch (moduleError) {
        console.error("Failed to load capture worklet module:", moduleError);
        throw new Error("Capture processor module loading failed");
      }

      this.captureWorklet = new AudioWorkletNode(
        this.audioContext,
        "dtln-capture-processor"
      );

      this.microphoneSource = this.audioContext.createMediaStreamSource(
        this.stream
      );

      // Conectar nodos de audio
      try {
        this.microphoneSource.connect(this.workletNode);
        this.workletNode.connect(this.captureWorklet);
      } catch (connectionError) {
        console.error("Failed to connect audio nodes:", connectionError);
        throw new Error("Audio processing pipeline connection failed");
      }

      this.captureWorklet.port.onmessage = (event) => {
        if (this.#status !== AudioServiceStatus.CAPTURING) return;

        const pcm16DataBuffer = event.data;
        if (!pcm16DataBuffer || pcm16DataBuffer.byteLength === 0) return;

        console.log({ data: pcm16DataBuffer });

        if (this.onProcessedDataCallback) {
          this.onProcessedDataCallback(pcm16DataBuffer);
        }
      };
    } catch (error) {
      console.error("Audio processing setup failed:", error);
      this.#status = AudioServiceStatus.ERROR;
      this.#errorMessage =
        error.message || "Failed to initialize audio processing";
      this.#notifyState();
      throw error;
    }
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
}

export const localAudioService = LocalAudioService.getInstance();
