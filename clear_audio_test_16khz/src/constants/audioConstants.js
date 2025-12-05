export const AUDIO_CAPTURE_CONFIG = {
  // Sample rate para captura y procesamiento (DTLN requiere 16kHz)
  CAPTURE_SAMPLE_RATE: 48000,

  // Procesamiento AI (DTLN está entrenado para 16kHz)
  AI_PROCESSING_RATE: 16000,

  // Salida final (mismo que procesamiento por ahora)
  TRANSMISSION_SAMPLE_RATE: 16000,

  // Canales de audio
  CHANNELS: 1,
};

export const AudioServiceStatus = {
  IDLE: "idle",
  PERMISSION_PENDING: "permission_pending",
  INITIALIZING: "initializing",
  CAPTURING: "capturing",
  MUTED: "muted",
  ERROR: "error",
};
