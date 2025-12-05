/**
 * DTLN Capture Processor - Conversión a PCM16
 *
 * FLUJO:
 * 1. Input: Audio procesado por DTLN a 16kHz (Float32)
 * 2. Procesamiento: Pre-emphasis + volume boost
 * 3. Output: PCM16 chunks a 16kHz para transmisión
 */

const CONFIG = {
  SAMPLE_RATE: 16000, // Audio procesado por DTLN
  CHUNK_SIZE: 1024, // Tamaño del buffer
  PRE_EMPHASIS: 0.85, // Realce de frecuencias altas
  VOLUME_BOOST: 1.4, // Amplificación de volumen
  MIX_ORIGINAL_RATIO: 0.9, // Mezcla señal original
};

class DtlnCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Buffer de acumulación
    this._buffer = new Float32Array(CONFIG.CHUNK_SIZE);
    this._bufferPosition = 0;

    // Pre-emphasis state
    this._lastSample = 0;

    console.log("[DTLN Capture] Initialized at 16kHz");
  }

  process(inputs, outputs) {
    // Input: Audio procesado por DTLN a 16kHz
    const inputData = inputs[0]?.[0];

    if (!inputData || inputData.length === 0) {
      return true;
    }

    // Acumular datos en el buffer
    const remainingSpace = CONFIG.CHUNK_SIZE - this._bufferPosition;
    const dataToCopy = Math.min(inputData.length, remainingSpace);

    this._buffer.set(inputData.subarray(0, dataToCopy), this._bufferPosition);
    this._bufferPosition += dataToCopy;

    // Cuando el buffer está lleno, procesar y enviar
    if (this._bufferPosition >= CONFIG.CHUNK_SIZE) {
      this._processAndSend();

      // Manejar datos restantes
      const remaining = inputData.length - dataToCopy;
      if (remaining > 0) {
        this._buffer.set(inputData.subarray(dataToCopy), 0);
        this._bufferPosition = remaining;
      } else {
        this._bufferPosition = 0;
      }
    }

    return true;
  }

  _processAndSend() {
    // Convertir Float32 a Int16 (PCM16) con procesamiento de audio
    const outputPcm16 = new Int16Array(CONFIG.CHUNK_SIZE);

    for (let i = 0; i < CONFIG.CHUNK_SIZE; i++) {
      // Pre-emphasis (realza frecuencias altas para claridad vocal)
      const emphasized =
        this._buffer[i] - CONFIG.PRE_EMPHASIS * this._lastSample;
      this._lastSample = this._buffer[i];

      // Mezcla: original + procesado
      const mixProcessed = 1.0 - CONFIG.MIX_ORIGINAL_RATIO;
      const enhanced =
        CONFIG.MIX_ORIGINAL_RATIO * this._buffer[i] + mixProcessed * emphasized;

      // Boost de volumen
      const boosted = enhanced * CONFIG.VOLUME_BOOST;

      // Clamp y convertir a PCM16
      const clamped = Math.max(-1, Math.min(1, boosted));
      outputPcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }

    // Enviar PCM16 a 16kHz al main thread
    this.port.postMessage(outputPcm16.buffer, [outputPcm16.buffer]);
  }
}

registerProcessor("dtln-capture-processor", DtlnCaptureProcessor);
