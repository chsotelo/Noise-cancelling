/**
 * Ejemplo de procesamiento de audio en tiempo real con chunks
 * Este código muestra cómo integrar DTLN para limpieza en streaming
 */

const SAMPLE_RATE = 16000;

class RealtimeNoiseSuppressionStream {
  constructor() {
    this.audioContext = null;
    this.workletNode = null;
    this.isInitialized = false;
    this.outputChunks = [];
  }

  /**
   * Inicializa el contexto de audio y el worklet
   */
  async initialize() {
    if (this.isInitialized) return;

    // Crear contexto de audio con la tasa de muestreo adecuada
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });

    // Cargar el módulo AudioWorklet
    await this.audioContext.audioWorklet.addModule("audio-worklet.js");

    // Crear el nodo procesador
    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      "NoiseSuppressionWorker",
      {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { disableMetrics: false },
      }
    );

    // Esperar a que el módulo WASM esté listo
    await new Promise((resolve) => {
      this.workletNode.port.onmessage = (event) => {
        if (event.data === "ready") {
          console.log("DTLN module ready for real-time processing");
          resolve();
        } else {
          // Recibir métricas opcionales
          console.log("Metrics:", event.data);
        }
      };
    });

    this.isInitialized = true;
  }

  /**
   * Procesa audio desde el micrófono en tiempo real
   * @returns {MediaStreamAudioDestinationNode} Nodo con el stream procesado
   */
  async processFromMicrophone() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Obtener acceso al micrófono
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: SAMPLE_RATE,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // Crear fuente desde el micrófono
    const source = this.audioContext.createMediaStreamSource(stream);

    // Crear destino para el stream procesado
    const destination = this.audioContext.createMediaStreamDestination();

    // Conectar: Micrófono -> DTLN Worklet -> Destino
    source.connect(this.workletNode);
    this.workletNode.connect(destination);

    // Retornar el stream procesado
    return {
      stream: destination.stream,
      rawStream: stream,
      stop: () => {
        stream.getTracks().forEach((track) => track.stop());
        source.disconnect();
      },
    };
  }

  /**
   * Procesa un chunk de audio (Float32Array) y devuelve el resultado procesado
   * @param {Float32Array} audioChunk - Chunk de audio a procesar (debe ser mono, 16kHz)
   * @returns {Promise<Float32Array>} Audio procesado
   */
  async processChunk(audioChunk) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve) => {
      // Crear buffer de audio
      const buffer = this.audioContext.createBuffer(
        1, // mono
        audioChunk.length,
        SAMPLE_RATE
      );
      buffer.copyToChannel(audioChunk, 0);

      // Crear contexto offline para procesar este chunk
      const offlineCtx = new OfflineAudioContext(
        1,
        audioChunk.length,
        SAMPLE_RATE
      );

      // Copiar el worklet al contexto offline
      offlineCtx.audioWorklet.addModule("audio-worklet.js").then(() => {
        const processor = new AudioWorkletNode(
          offlineCtx,
          "NoiseSuppressionWorker"
        );

        processor.port.onmessage = (event) => {
          if (event.data === "ready") {
            const source = offlineCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(processor);
            processor.connect(offlineCtx.destination);
            source.start();

            offlineCtx.startRendering().then((processedBuffer) => {
              resolve(processedBuffer.getChannelData(0));
            });
          }
        };
      });
    });
  }

  /**
   * Procesa un MediaStream existente (por ejemplo, de screen capture, archivo, etc)
   * @param {MediaStream} inputStream - Stream de entrada a procesar
   * @returns {MediaStream} Stream procesado sin ruido
   */
  async processExistingStream(inputStream) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Crear fuente desde el stream
    const source = this.audioContext.createMediaStreamSource(inputStream);

    // Crear destino para el stream procesado
    const destination = this.audioContext.createMediaStreamDestination();

    // Conectar: Stream -> DTLN Worklet -> Destino
    source.connect(this.workletNode);
    this.workletNode.connect(destination);

    return destination.stream;
  }

  /**
   * Limpia recursos
   */
  dispose() {
    if (this.workletNode) {
      this.workletNode.disconnect();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.isInitialized = false;
  }
}

// ============================================
// EJEMPLOS DE USO
// ============================================

/**
 * Ejemplo 1: Procesar micrófono en tiempo real
 */
async function example1_RealtimeMicrophone() {
  const processor = new RealtimeNoiseSuppressionStream();

  // Inicializar y procesar
  const { stream, rawStream, stop } = await processor.processFromMicrophone();

  // El 'stream' ya contiene el audio limpio y se puede usar directamente
  // Por ejemplo, para enviarlo a un RTCPeerConnection (WebRTC):

  // const peerConnection = new RTCPeerConnection();
  // stream.getAudioTracks().forEach(track => {
  //   peerConnection.addTrack(track, stream);
  // });

  // O para reproducirlo localmente:
  const audio = new Audio();
  audio.srcObject = stream;
  audio.play();

  // Detener después de 10 segundos
  setTimeout(() => {
    stop();
    processor.dispose();
  }, 10000);
}

/**
 * Ejemplo 2: Procesar chunks individuales (útil para WebSocket, etc)
 */
async function example2_ProcessChunks() {
  const processor = new RealtimeNoiseSuppressionStream();
  await processor.initialize();

  // Simular recibir chunks de audio (por ejemplo, desde WebSocket)
  const incomingChunk = new Float32Array(512); // Tu chunk de audio
  // ... llenar con datos reales ...

  // Procesar el chunk
  const cleanChunk = await processor.processChunk(incomingChunk);

  // Ahora puedes enviar 'cleanChunk' a donde necesites
  // Por ejemplo: websocket.send(cleanChunk.buffer)
  console.log("Chunk procesado:", cleanChunk);
}

/**
 * Ejemplo 3: Procesar un stream existente (ej: grabación de pantalla)
 */
async function example3_ProcessScreenCapture() {
  const processor = new RealtimeNoiseSuppressionStream();

  // Obtener stream de captura de pantalla
  const screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });

  // Procesar solo el audio
  const cleanStream = await processor.processExistingStream(screenStream);

  // Combinar video original con audio limpio
  const videoTrack = screenStream.getVideoTracks()[0];
  const cleanAudioTrack = cleanStream.getAudioTracks()[0];

  const finalStream = new MediaStream([videoTrack, cleanAudioTrack]);

  // Usar el stream final (ej: grabar con MediaRecorder)
  const recorder = new MediaRecorder(finalStream);
  recorder.start();
}

/**
 * Ejemplo 4: Para integración con WebRTC (videollamadas)
 */
async function example4_WebRTCIntegration() {
  const processor = new RealtimeNoiseSuppressionStream();
  const { stream: cleanStream, stop } = await processor.processFromMicrophone();

  // Crear conexión WebRTC
  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  // Agregar el track de audio limpio
  cleanStream.getAudioTracks().forEach((track) => {
    peerConnection.addTrack(track, cleanStream);
  });

  // ... resto de la configuración de WebRTC (offer/answer, ICE, etc) ...

  return { peerConnection, stop };
}

// Exportar para usar en tu aplicación
if (typeof module !== "undefined" && module.exports) {
  module.exports = RealtimeNoiseSuppressionStream;
}
