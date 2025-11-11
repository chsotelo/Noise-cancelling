/**
 * Utilidad simple para detectar el mejor codec de audio
 */

export const BrowserCapabilities = {
  /**
   * Detecta el mejor codec de audio soportado por MediaRecorder
   * Necesario para compatibilidad con Safari/iOS
   */
  getBestAudioCodec() {
    if (!MediaRecorder || !MediaRecorder.isTypeSupported) {
      return "audio/webm"; // Fallback básico
    }

    const codecs = [
      "audio/webm;codecs=opus",
      "audio/webm;codecs=vorbis",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];

    for (const codec of codecs) {
      if (MediaRecorder.isTypeSupported(codec)) {
        return codec;
      }
    }

    return "audio/webm"; // Fallback
  },
};
