// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Audio Processing Modes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const AUDIO_MODES = {
  // ────────────────────────────────────────────────────────────────
  // LIGHT: Fallback for devices with limited capacity
  // ────────────────────────────────────────────────────────────────
  LIGHT: {
    id: "LIGHT",
    name: "Light Mode",
    description: "Fast noise suppression for clean environments",

    CAPTURE_SAMPLE_RATE: 48000,
    PROCESSING_SAMPLE_RATE: 48000, // RNNoise processes @ 48kHz
    OUTPUT_SAMPLE_RATE: 24000, // Resampled to 24kHz for backend

    MODEL: "rnnoise", // RNNoise - stationary noise
    FRAME_SIZE: 480, // 10ms @ 48kHz (RNNoise native frame)
    HOP_SIZE: 240, // 5ms overlap

    USE_RESAMPLER: true, // AudioResampler 48kHz→24kHz with FIR anti-aliasing

    // Expected metrics
    EXPECTED_LATENCY_MS: 35,
    EXPECTED_CPU_PERCENT: 10,
  },

  // ────────────────────────────────────────────────────────────
  // PREMIUM: Default mode for modern devices (2025)
  // ────────────────────────────────────────────────────────────
  PREMIUM: {
    id: "PREMIUM",
    name: "Premium Mode",
    description: "SOTA quality for noisy environments @ 48kHz → 24kHz",

    CAPTURE_SAMPLE_RATE: 48000,
    PROCESSING_SAMPLE_RATE: 48000, // Maximum spectral resolution
    OUTPUT_SAMPLE_RATE: 24000, // Required output

    MODEL: "deepfilternet", // DeepFilterNet - non-stationary noise
    FRAME_SIZE: 480, // 10ms @ 48kHz
    HOP_SIZE: 240, // 5ms overlap (50%)

    USE_RESAMPLER: true, // Rubato 48k→24k
    RESAMPLER_CONFIG: {
      type: "rubato-fft", // Low latency
      quality: "high", // Anti-aliasing filter
    },

    // Expected metrics
    EXPECTED_LATENCY_MS: 70,
    EXPECTED_CPU_PERCENT: 30,
  },
};

export const AUDIO_CAPTURE_CONFIG = {
  // Default mode (overridden with automatic detection)
  DEFAULT_MODE: "PREMIUM",

  // Automatic capability detection
  AUTO_DETECT_MODE: true,

  // Thresholds for dynamic switching
  CPU_THRESHOLD_DOWNGRADE: 75, // % - If CPU > 75%, downgrade to LIGHT
  CPU_THRESHOLD_UPGRADE: 40, // % - If CPU < 40%, upgrade to PREMIUM

  // Output always at 24kHz (mandatory requirement)
  TRANSMISSION_SAMPLE_RATE: 24000,
  CHANNELS: 1,

  // Capture configuration
  ECHO_CANCELLATION: false,
  NOISE_SUPPRESSION: false, // Our AI handles this
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
