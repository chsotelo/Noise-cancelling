// This worklet captures the denoised audio from DTLN and converts it to PCM16 chunks
// Input: Denoised audio at 16kHz from DTLN (comes through the 'input' parameter)
// Output: PCM16 ArrayBuffer chunks sent via port.postMessage

/**
 * ⚙️ CONFIGURACIÓN DE PROCESAMIENTO
 * Para ajustar estos valores, ver: src/constants/audioProcessingConfig.js
 */
const CONFIG = {
  CHUNK_SIZE: 1024, // Tamaño del buffer (samples)
  PRE_EMPHASIS: 0.85, // Realce de frecuencias altas (0.0-0.97)
  VOLUME_BOOST: 1.4, // Amplificación de volumen (1.0-2.0)
  MIX_ORIGINAL_RATIO: 0.9, // % señal original (resto es procesado)
};

class DtlnCaptureProcessor extends AudioWorkletProcessor {
  _chunkSize = CONFIG.CHUNK_SIZE;
  _buffer = new Float32Array(this._chunkSize);
  _bufferPosition = 0;

  // Pre-emphasis para nitidez de voz
  _lastSample = 0;
  _preEmphasis = CONFIG.PRE_EMPHASIS;

  constructor() {
    super();
  }

  process(inputs, outputs) {
    // The input comes from DTLN worklet (denoised audio at 16kHz)
    const inputData = inputs[0]?.[0];

    if (!inputData || inputData.length === 0) {
      return true;
    }

    // Accumulate data in the buffer
    const remainingSpace = this._chunkSize - this._bufferPosition;
    const dataToCopy = Math.min(inputData.length, remainingSpace);

    this._buffer.set(inputData.subarray(0, dataToCopy), this._bufferPosition);
    this._bufferPosition += dataToCopy;

    // When buffer is full, process and send
    if (this._bufferPosition >= this._chunkSize) {
      this._processAndSend();

      // Handle any remaining data
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
    // Convert Float32 to Int16 (PCM16) con nitidez configurable
    const outputPcm16 = new Int16Array(this._chunkSize);

    for (let i = 0; i < this._chunkSize; i++) {
      // Pre-emphasis (realza frecuencias altas para nitidez)
      const emphasized = this._buffer[i] - this._preEmphasis * this._lastSample;
      this._lastSample = this._buffer[i];

      // Mezcla configurable: original + procesado
      const mixProcessed = 1.0 - CONFIG.MIX_ORIGINAL_RATIO;
      const enhanced =
        CONFIG.MIX_ORIGINAL_RATIO * this._buffer[i] + mixProcessed * emphasized;

      // Boost de volumen
      const boosted = enhanced * CONFIG.VOLUME_BOOST;

      // Clamp y convertir a PCM16
      const s = Math.max(-1, Math.min(1, boosted));
      outputPcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Send the PCM16 buffer to the main thread using transferable for efficiency
    this.port.postMessage(outputPcm16.buffer, [outputPcm16.buffer]);
  }
}

registerProcessor("dtln-capture-processor", DtlnCaptureProcessor);
