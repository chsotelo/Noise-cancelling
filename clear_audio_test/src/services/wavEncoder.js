/* v1.0.0 */
/**
 * Escribe un string en un DataView.
 * @param {DataView} view El DataView donde escribir.
 * @param {number} offset El offset donde empezar a escribir.
 * @param {string} string El string a escribir.
 */
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Concatena múltiples buffers Int16Array en uno solo.
 * @param {Int16Array[]} buffers Array de buffers para concatenar.
 * @returns {Int16Array} Un único buffer concatenado.
 */
function concatInt16Arrays(buffers) {
  let totalLength = 0;
  for (const buffer of buffers) {
    totalLength += buffer.length;
  }

  const result = new Int16Array(totalLength);
  let offset = 0;
  for (const buffer of buffers) {
    result.set(buffer, offset);
    offset += buffer.length;
  }
  return result;
}

/**
 * Codifica datos PCM (Int16Array) en un Blob de audio/wav.
 * @param {Int16Array[]} pcmChunks Array de chunks de datos PCM16.
 * @param {number} sampleRate La tasa de muestreo (ej: 16000).
 * @param {number} numChannels El número de canales (ej: 1).
 * @returns {Blob} Un Blob que representa el archivo .wav.
 */
export function encodeWAV(pcmChunks, sampleRate, numChannels) {
  const pcmData = concatInt16Arrays(pcmChunks);
  const dataLength = pcmData.length * 2; // 2 bytes por muestra (Int16)
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // --- Cabecera RIFF ---
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true); // Tamaño total del archivo - 8
  writeString(view, 8, "WAVE");

  // --- Chunk "fmt " ---
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Tamaño del chunk fmt
  view.setUint16(20, 1, true); // Formato de audio (1 = PCM)
  view.setUint16(22, numChannels, true); // Número de canales
  view.setUint32(24, sampleRate, true); // Tasa de muestreo
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, numChannels * 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPorMuestra

  // --- Chunk "data" ---
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true); // Tamaño de los datos

  // --- Datos PCM ---
  let offset = 44;
  for (let i = 0; i < pcmData.length; i++, offset += 2) {
    view.setInt16(offset, pcmData[i], true);
  }

  return new Blob([view], { type: "audio/wav" });
}
