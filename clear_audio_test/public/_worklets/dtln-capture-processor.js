// This worklet captures the denoised audio from DTLN and converts it to PCM16 chunks
// Input: Denoised audio at 16kHz from DTLN (comes through the 'input' parameter)
// Output: PCM16 ArrayBuffer chunks sent via port.postMessage

class DtlnCaptureProcessor extends AudioWorkletProcessor {
  _chunkSize = 1024; // 1024 samples at 16kHz = 64ms of audio
  _buffer = new Float32Array(this._chunkSize);
  _bufferPosition = 0;

  // Pre-emphasis muy suave solo para nitidez (no para filtrar)
  _lastSample = 0;
  _preEmphasis = 0.85; // Muy conservador

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
    // Convert Float32 to Int16 (PCM16) con un toque de nitidez
    const outputPcm16 = new Int16Array(this._chunkSize);

    for (let i = 0; i < this._chunkSize; i++) {
      // Pre-emphasis muy suave (solo realza un poco las frecuencias altas)
      const emphasized = this._buffer[i] - this._preEmphasis * this._lastSample;
      this._lastSample = this._buffer[i];

      // Mezcla muy conservadora: 90% original + 10% emphasized (solo un toque)
      const enhanced = 0.9 * this._buffer[i] + 0.1 * emphasized;

      // Boost de 1.4x
      const boosted = enhanced * 1.4;

      // Clamp y convertir a PCM16
      const s = Math.max(-1, Math.min(1, boosted));
      outputPcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Send the PCM16 buffer to the main thread using transferable for efficiency
    this.port.postMessage(outputPcm16.buffer, [outputPcm16.buffer]);
  }
}

registerProcessor("dtln-capture-processor", DtlnCaptureProcessor);
