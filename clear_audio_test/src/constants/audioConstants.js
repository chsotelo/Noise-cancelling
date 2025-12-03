export const AUDIO_CAPTURE_CONFIG = {
  CAPTURE_SAMPLE_RATE: 48000,
  CHANNELS: 1,
  TRANSMISSION_SAMPLE_RATE: 24000,
};

export const AudioServiceStatus = {
  IDLE: "idle",
  PERMISSION_PENDING: "permission_pending",
  INITIALIZING: "initializing",
  CAPTURING: "capturing",
  MUTED: "muted",
  ERROR: "error",
};
