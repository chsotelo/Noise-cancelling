// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Modos de Procesamiento de Audio
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const AUDIO_MODES = {
  // ────────────────────────────────────────────────────────────
  // LIGHT: Fallback para dispositivos con capacidad limitada
  // ────────────────────────────────────────────────────────────
  LIGHT: {
    id: "LIGHT",
    name: "Light Mode (RNNoise)",
    description: "Fast noise suppression for low-end devices",

    CAPTURE_SAMPLE_RATE: 48000,
    PROCESSING_SAMPLE_RATE: 24000, // Procesa directo a 24kHz
    OUTPUT_SAMPLE_RATE: 24000, // Output obligatorio

    MODEL: "rnnoise", // RNNoise - stationary noise
    FRAME_SIZE: 480, // 20ms @ 24kHz (10ms @ 48kHz RNNoise internal)
    HOP_SIZE: 240, // 10ms overlap

    USE_RESAMPLER: false, // No necesita resampling

    // Métricas esperadas
    EXPECTED_LATENCY_MS: 35,
    EXPECTED_CPU_PERCENT: 10,
  },

  // ────────────────────────────────────────────────────────────
  // PREMIUM: Modo por defecto para dispositivos modernos (2025)
  // ────────────────────────────────────────────────────────────
  PREMIUM: {
    id: "PREMIUM",
    name: "Premium Mode (DeepFilterNet)",
    description: "SOTA quality for non-stationary noise @ 48kHz → 24kHz",

    CAPTURE_SAMPLE_RATE: 48000,
    PROCESSING_SAMPLE_RATE: 48000, // Máxima resolución espectral
    OUTPUT_SAMPLE_RATE: 24000, // Output obligatorio

    MODEL: "deepfilternet", // DeepFilterNet - non-stationary noise
    FRAME_SIZE: 480, // 10ms @ 48kHz
    HOP_SIZE: 240, // 5ms overlap (50%)

    USE_RESAMPLER: true, // Rubato 48k→24k
    RESAMPLER_CONFIG: {
      type: "rubato-fft", // Baja latencia
      quality: "high", // Filtro anti-aliasing
    },

    // Métricas esperadas
    EXPECTED_LATENCY_MS: 70,
    EXPECTED_CPU_PERCENT: 30,
  },
};

export const AUDIO_CAPTURE_CONFIG = {
  // Modo por defecto (se sobrescribe con detección automática)
  DEFAULT_MODE: "PREMIUM",

  // Detección automática de capacidad
  AUTO_DETECT_MODE: true,

  // Thresholds para switching dinámico
  CPU_THRESHOLD_DOWNGRADE: 75, // % - Si CPU > 75%, bajar a LIGHT
  CPU_THRESHOLD_UPGRADE: 40, // % - Si CPU < 40%, subir a PREMIUM

  // Output siempre a 24kHz (requisito obligatorio)
  TRANSMISSION_SAMPLE_RATE: 24000,
  CHANNELS: 1,

  // Configuración de captura
  ECHO_CANCELLATION: false,
  NOISE_SUPPRESSION: false, // Lo hace nuestra IA
  AUTO_GAIN_CONTROL: false,
};

export const AudioServiceStatus = {
  IDLE: "idle",
  PERMISSION_PENDING: "permission_pending",
  INITIALIZING: "initializing",
  CAPTURING: "capturing",
  MUTED: "muted",
  ERROR: "error",
};
