import { useState, useRef, useEffect, useCallback } from "react";
import { localAudioService } from "./services/LocalAudioService";
import {
  AudioServiceStatus,
  AUDIO_CAPTURE_CONFIG,
} from "./constants/audioConstants";
import { encodeWAV } from "./services/wavEncoder";
import "./App.css";

function App() {
  const [appState, setAppState] = useState({
    status: AudioServiceStatus.IDLE,
    errorMessage: null,
    toastMessage: null,
    devices: [],
    selectedDeviceId: "default",
  });

  const [isRecording, setIsRecording] = useState(false);
  const [originalAudioUrl, setOriginalAudioUrl] = useState(null);
  const [processedAudioUrl, setProcessedAudioUrl] = useState(null);
  const [selectedMode, setSelectedMode] = useState("AUTO"); // AUTO, LIGHT, PREMIUM
  const mediaRecorderRef = useRef(null);
  const originalAudioChunksRef = useRef([]);
  const processedAudioChunksRef = useRef([]);
  const isMountedRef = useRef(true);
  const recordingStartTimeRef = useRef(null);
  const recordingStopTimeRef = useRef(null);

  const handleAudioStateChange = useCallback((newState) => {
    setAppState(newState);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    localAudioService.init(handleAudioStateChange);
    return () => {
      isMountedRef.current = false;
      localAudioService.cleanup();
    };
  }, [handleAudioStateChange]);

  useEffect(() => {
    return () => {
      if (originalAudioUrl) URL.revokeObjectURL(originalAudioUrl);
      if (processedAudioUrl) URL.revokeObjectURL(processedAudioUrl);
    };
  }, [originalAudioUrl, processedAudioUrl]);

  const handleProcessedData = useCallback((pcm16DataBuffer) => {
    if (!isMountedRef.current) return;
    const chunk = new Int16Array(pcm16DataBuffer);
    processedAudioChunksRef.current.push(chunk);
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
    // Limpiar arrays de forma agresiva
    originalAudioChunksRef.current.length = 0;
    processedAudioChunksRef.current.length = 0;
  }, [originalAudioUrl, processedAudioUrl]);

  const handleStartRecording = async () => {
    if (isRecording) return;

    // Limpiar grabaciones anteriores
    cleanupRecordings();

    try {
      // Determinar modo forzado (si no es AUTO)
      const forcedMode = selectedMode === "AUTO" ? null : selectedMode;

      // Iniciar el servicio. Nos devuelve el stream original.
      const originalStream = await localAudioService.start(
        handleProcessedData,
        forcedMode
      );

      // --- Configurar MediaRecorder para el audio ORIGINAL ---
      // Use default codec (browser will choose best available)
      const recorder = new MediaRecorder(originalStream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          originalAudioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        // Verificar que el componente siga montado
        if (!isMountedRef.current) {
          return;
        }

        // --- Generar audio ORIGINAL ---
        if (originalAudioChunksRef.current.length > 0) {
          const originalBlob = new Blob(originalAudioChunksRef.current);
          const originalUrl = URL.createObjectURL(originalBlob);
          setOriginalAudioUrl(originalUrl);
        }

        // --- Generar audio PROCESADO ---
        if (processedAudioChunksRef.current.length > 0) {
          // NO truncar - usar TODOS los samples recibidos del worklet
          // El worklet ya hace flush completo y envía exactamente lo que debe
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
          setProcessedAudioUrl(URL.createObjectURL(processedBlob));
        }
      };

      // CRITICAL: Wait for worklet to receive first audio, THEN start MediaRecorder
      await localAudioService.startProcessing();

      // NOW start recording - this ensures MediaRecorder starts exactly when worklet has real audio
      recordingStartTimeRef.current = Date.now();
      recorder.start();

      setIsRecording(true);
    } catch (error) {
      // El servicio de audio ya habrá puesto su propio estado de error
    }
  };

  const handleStopRecording = useCallback(() => {
    if (!isRecording) return;

    recordingStopTimeRef.current = Date.now();

    // CRITICAL ORDER: Stop MediaRecorder FIRST to mark the exact stop point
    mediaRecorderRef.current?.stop();

    // Then stop audio processing and flush buffers
    localAudioService.stop();

    setIsRecording(false);
  }, [isRecording]);
  const handleDeviceChange = (e) => {
    localAudioService.setSelectedDevice(e.target.value);
  };

  const { status, errorMessage, toastMessage, devices, selectedDeviceId } =
    appState;
  const isLoading = status === AudioServiceStatus.INITIALIZING;

  return (
    <div className="container">
      {errorMessage && <div className="toast error">{errorMessage}</div>}
      {toastMessage && <div className="toast info">{toastMessage}</div>}

      <div className="card">
        <h2>Configuración</h2>

        <label htmlFor="mode-select">Modo de Procesamiento:</label>
        <select
          id="mode-select"
          value={selectedMode}
          onChange={(e) => setSelectedMode(e.target.value)}
          disabled={isRecording || isLoading}>
          <option value="AUTO">🤖 Auto (Detectar capacidad)</option>
          <option value="PREMIUM">
            ⚡ Premium (DeepFilterNet @ 48kHz → 24kHz)
          </option>
          <option value="LIGHT">💡 Light (DTLN @ 24kHz)</option>
        </select>

        <label htmlFor="mic-select">Micrófono:</label>
        <select
          id="mic-select"
          value={selectedDeviceId}
          onChange={handleDeviceChange}
          disabled={isRecording || isLoading}>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>

        <p>
          Estado: <strong>{status}</strong>
        </p>

        {isRecording && (
          <p className="mode-indicator">
            🎵 Modo activo:{" "}
            <strong>
              {localAudioService.getCurrentMode() || selectedMode}
            </strong>
            <br />
            <small>
              Procesando @{" "}
              {localAudioService.getCurrentModeConfig()
                ?.PROCESSING_SAMPLE_RATE || "?"}
              Hz → Salida @ 24kHz
            </small>
          </p>
        )}
      </div>

      <div className="card">
        <h2>Controles</h2>
        <div className="controls">
          <button
            onClick={handleStartRecording}
            disabled={isRecording || isLoading}>
            {isLoading ? "Iniciando..." : "Grabar"}
          </button>
          <button onClick={handleStopRecording} disabled={!isRecording}>
            Parar
          </button>
        </div>
      </div>

      <div className="results">
        <div
          className="card"
          style={{ visibility: originalAudioUrl ? "visible" : "hidden" }}>
          <h2>Original</h2>
          {originalAudioUrl && <audio controls src={originalAudioUrl}></audio>}
        </div>
        <div
          className="card"
          style={{ visibility: processedAudioUrl ? "visible" : "hidden" }}>
          <h2>Processed</h2>
          {processedAudioUrl && (
            <audio controls src={processedAudioUrl}></audio>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
