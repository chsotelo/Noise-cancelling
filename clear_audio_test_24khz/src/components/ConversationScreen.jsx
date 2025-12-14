import { useState, useRef, useCallback, useEffect } from "react";
import { localAudioService } from "../services/LocalAudioService";
import {
  AudioServiceStatus,
  AUDIO_CAPTURE_CONFIG,
} from "../constants/audioConstants";
import { encodeWAV } from "../services/wavEncoder";
import "./ConversationScreen.css";

export default function ConversationScreen({ config, onEndConversation }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState(null);

  // Audio URLs for playback
  const [originalAudioUrl, setOriginalAudioUrl] = useState(null);
  const [processedAudioUrl, setProcessedAudioUrl] = useState(null);

  // Audio stats
  const [audioStats, setAudioStats] = useState({
    originalDuration: 0,
    originalSize: 0,
    processedDuration: 0,
    processedSize: 0,
  });

  const mediaRecorderRef = useRef(null);
  const originalAudioChunksRef = useRef([]);
  const processedAudioChunksRef = useRef([]);
  const recordingStartTimeRef = useRef(null);
  const isInitializingRef = useRef(false);

  const handleProcessedData = useCallback((pcm16DataBuffer) => {
    // Only process if we're actively recording to avoid unnecessary memory allocation
    if (
      !mediaRecorderRef.current ||
      mediaRecorderRef.current.state !== "recording"
    ) {
      return;
    }

    // Avoid creating new Int16Array when not recording
    processedAudioChunksRef.current.push(new Int16Array(pcm16DataBuffer));
  }, []);

  const initializeAudioService = useCallback(async () => {
    try {
      setIsInitializing(true);
      setError(null);

      // Check if already initialized from a previous session
      if (
        localAudioService.stream &&
        localAudioService.getCurrentMode() === config.mode
      ) {
        console.log(
          "[ConversationScreen] Audio service already initialized, skipping"
        );
        setIsInitializing(false);
        return;
      }

      // Set selected device
      if (config.deviceId) {
        localAudioService.setSelectedDevice(config.deviceId);
      }

      // Start audio service with selected mode
      const originalStream = await localAudioService.start(
        handleProcessedData,
        config.mode
      );

      // Pre-load worklet but don't start recording yet
      await localAudioService.startProcessing();

      setIsInitializing(false);
    } catch (err) {
      setError(err.message || "Failed to initialize audio");
      setIsInitializing(false);
    }
  }, [config.mode, config.deviceId, handleProcessedData]);

  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (isInitializingRef.current) {
      console.log(
        "[ConversationScreen] Already initializing, skipping duplicate call"
      );
      return;
    }

    isInitializingRef.current = true;
    initializeAudioService();

    return () => {
      isInitializingRef.current = false;
      cleanup();
    };
  }, [initializeAudioService]);

  const generateAudioFiles = useCallback(() => {
    // Calculate recording duration from timestamps (same for both)
    const recordingDuration =
      (Date.now() - recordingStartTimeRef.current) / 1000;

    // Generate original audio
    if (originalAudioChunksRef.current.length > 0) {
      const originalBlob = new Blob(originalAudioChunksRef.current);
      const originalUrl = URL.createObjectURL(originalBlob);
      setOriginalAudioUrl(originalUrl);

      // Calculate stats
      setAudioStats((prev) => ({
        ...prev,
        originalDuration: recordingDuration,
        originalSize: (originalBlob.size / 1024).toFixed(2),
      }));
    }

    // Generate processed audio
    if (processedAudioChunksRef.current.length > 0) {
      const allChunks = processedAudioChunksRef.current;

      let totalSamples = 0;
      for (const chunk of allChunks) {
        totalSamples += chunk.length;
      }

      const processedBlob = encodeWAV(
        allChunks,
        AUDIO_CAPTURE_CONFIG.TRANSMISSION_SAMPLE_RATE,
        AUDIO_CAPTURE_CONFIG.CHANNELS
      );

      const processedUrl = URL.createObjectURL(processedBlob);
      setProcessedAudioUrl(processedUrl);

      // Calculate stats - use same duration as original (both recorded for same time)
      const actualDuration =
        totalSamples / AUDIO_CAPTURE_CONFIG.TRANSMISSION_SAMPLE_RATE;
      console.log(
        `[Audio Stats] Recording time: ${recordingDuration.toFixed(
          2
        )}s | Processed samples duration: ${actualDuration.toFixed(2)}s`
      );

      setAudioStats((prev) => ({
        ...prev,
        processedDuration: recordingDuration,
        processedSize: (processedBlob.size / 1024).toFixed(2),
      }));
    }
  }, []);

  const cleanupRecordings = useCallback(() => {
    if (originalAudioUrl) {
      URL.revokeObjectURL(originalAudioUrl);
      setOriginalAudioUrl(null);
    }
    if (processedAudioUrl) {
      URL.revokeObjectURL(processedAudioUrl);
      setProcessedAudioUrl(null);
    }

    originalAudioChunksRef.current = [];
    processedAudioChunksRef.current = [];

    setAudioStats({
      originalDuration: 0,
      originalSize: 0,
      processedDuration: 0,
      processedSize: 0,
    });
  }, [originalAudioUrl, processedAudioUrl]);

  const startRecording = useCallback(async () => {
    try {
      // Clear previous recordings
      cleanupRecordings();

      // Get original stream
      const originalStream = localAudioService.stream;

      if (!originalStream) {
        throw new Error("Audio stream not available");
      }

      // Setup MediaRecorder for original audio
      const recorder = new MediaRecorder(originalStream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          originalAudioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        generateAudioFiles();
      };

      // Start worklet processing
      localAudioService.workletNode?.port.postMessage("start");

      // Start MediaRecorder
      recordingStartTimeRef.current = Date.now();
      recorder.start();

      setIsRecording(true);
    } catch (err) {
      setError(err.message || "Failed to start recording");
    }
  }, [cleanupRecordings, generateAudioFiles]);

  const stopRecording = useCallback(() => {
    try {
      // Stop MediaRecorder
      mediaRecorderRef.current?.stop();

      // Stop worklet processing
      localAudioService.workletNode?.port.postMessage("stop");
      localAudioService.workletNode?.port.postMessage("flush");

      setIsRecording(false);
    } catch (err) {
      setError(err.message || "Failed to stop recording");
    }
  }, []);

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  }, [isRecording, stopRecording, startRecording]);

  const cleanup = () => {
    cleanupRecordings();
    localAudioService.fullReset(); // Use fullReset instead of stop
  };

  const handleEndConversation = () => {
    cleanup();
    onEndConversation();
  };

  const hasRecordings = originalAudioUrl || processedAudioUrl;

  return (
    <div className="conversation-screen">
      <div className="conversation-header">
        <div className="header-content">
          <h1>Conversation in Progress</h1>
          <p className="mode-info">
            Active mode: <strong>{localAudioService.getCurrentMode()}</strong>
          </p>
        </div>
        <button className="end-button" onClick={handleEndConversation}>
          End Conversation
        </button>
      </div>

      <div className="conversation-content">
        {/* Initializing State */}
        {isInitializing && (
          <div className="status-card initializing">
            <div className="spinner"></div>
            <p>Preparing audio system...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="status-card error">
            <p>{error}</p>
          </div>
        )}

        {/* Recording Control */}
        {!isInitializing && !error && (
          <div className="recording-control">
            <button
              className={`mic-button ${isRecording ? "recording" : "muted"}`}
              onClick={handleToggleRecording}>
              {isRecording ? (
                <>
                  <span className="mic-icon recording">●</span>
                  <span className="mic-label">Recording...</span>
                </>
              ) : (
                <>
                  <span className="mic-icon">🎙</span>
                  <span className="mic-label">Press to record</span>
                </>
              )}
            </button>

            {isRecording && (
              <div className="recording-indicator">
                <div className="pulse"></div>
                <span>Recording active</span>
              </div>
            )}
          </div>
        )}

        {/* Audio Summaries (shown after stopping recording) */}
        {!isRecording && hasRecordings && (
          <div className="audio-summaries">
            <h2>Audio Summary</h2>

            <div className="summary-grid">
              {/* Original Audio */}
              <div className="summary-card">
                <h3>Original Audio</h3>
                {import.meta.env.DEV && (
                  <div className="summary-stats">
                    <div className="stat">
                      <span className="stat-label">Duration:</span>
                      <span className="stat-value">
                        {audioStats.originalDuration.toFixed(2)}s
                      </span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Size:</span>
                      <span className="stat-value">
                        {audioStats.originalSize} KB
                      </span>
                    </div>
                  </div>
                )}
                {originalAudioUrl && (
                  <audio
                    controls
                    src={originalAudioUrl}
                    className="audio-player"></audio>
                )}
              </div>

              {/* Processed Audio */}
              <div className="summary-card">
                <h3>Processed Audio</h3>
                {import.meta.env.DEV && (
                  <div className="summary-stats">
                    <div className="stat">
                      <span className="stat-label">Duration:</span>
                      <span className="stat-value">
                        {audioStats.processedDuration.toFixed(2)}s
                      </span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Size:</span>
                      <span className="stat-value">
                        {audioStats.processedSize} KB
                      </span>
                    </div>
                  </div>
                )}
                {processedAudioUrl && (
                  <audio
                    controls
                    src={processedAudioUrl}
                    className="audio-player"></audio>
                )}
              </div>
            </div>

            <button
              className="new-recording-button"
              onClick={cleanupRecordings}>
              New Recording
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
