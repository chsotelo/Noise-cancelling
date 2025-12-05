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
          console.warn("Component unmounted, skipping audio generation");
          return;
        }

        console.log(
          `Total PCM16 chunks received: ${processedAudioChunksRef.current.length}`
        );

        // --- Generar audio ORIGINAL ---
        if (originalAudioChunksRef.current.length > 0) {
          const originalBlob = new Blob(originalAudioChunksRef.current);
          setOriginalAudioUrl(URL.createObjectURL(originalBlob));
        } else {
          console.warn("No original audio chunks received!");
        }

        // --- Generar audio PROCESADO ---
        if (processedAudioChunksRef.current.length > 0) {
          // Calcular duración real de la grabación
          const recordingDuration =
            (recordingStopTimeRef.current - recordingStartTimeRef.current) /
            1000; // en segundos
          const expectedSamples = Math.floor(
            recordingDuration *
              AUDIO_CAPTURE_CONFIG.TRANSMISSION_SAMPLE_RATE *
              AUDIO_CAPTURE_CONFIG.CHANNELS
          );

          console.log(
            `Recording duration: ${recordingDuration.toFixed(
              3
            )}s, expected ${expectedSamples} samples`
          );

          // Concatenar y truncar al número exacto de samples
          let totalSamples = 0;
          for (const chunk of processedAudioChunksRef.current) {
            totalSamples += chunk.length;
          }

          console.log(
            `Total samples received: ${totalSamples}, trimming to: ${expectedSamples}`
          );

          // Truncar chunks para que coincidan con la duración real
          const trimmedChunks = [];
          let samplesCollected = 0;

          for (const chunk of processedAudioChunksRef.current) {
            if (samplesCollected >= expectedSamples) break;

            const samplesNeeded = expectedSamples - samplesCollected;
            if (chunk.length <= samplesNeeded) {
              // Chunk completo cabe
              trimmedChunks.push(chunk);
              samplesCollected += chunk.length;
            } else {
              // Necesitamos solo parte del chunk
              const partialChunk = chunk.slice(0, samplesNeeded);
              trimmedChunks.push(partialChunk);
              samplesCollected += partialChunk.length;
              break;
            }
          }

          // Validar que los samples no sean todos ceros
          let nonZeroSamples = 0;
          let minSample = 32767;
          let maxSample = -32768;
          for (const chunk of trimmedChunks) {
            for (let i = 0; i < chunk.length; i++) {
              if (chunk[i] !== 0) nonZeroSamples++;
              if (chunk[i] < minSample) minSample = chunk[i];
              if (chunk[i] > maxSample) maxSample = chunk[i];
            }
          }

          console.log(`Audio validation:`);
          console.log(`  Total samples: ${samplesCollected}`);
          console.log(
            `  Non-zero samples: ${nonZeroSamples} (${(
              (nonZeroSamples / samplesCollected) *
              100
            ).toFixed(2)}%)`
          );
          console.log(`  Sample range: [${minSample}, ${maxSample}]`);

          if (nonZeroSamples === 0) {
            console.error(
              "⚠️ WARNING: All samples are zero! Audio will be silent."
            );
          }

          const processedBlob = encodeWAV(
            trimmedChunks,
            AUDIO_CAPTURE_CONFIG.TRANSMISSION_SAMPLE_RATE,
            AUDIO_CAPTURE_CONFIG.CHANNELS
          );
          setProcessedAudioUrl(URL.createObjectURL(processedBlob));
          console.log(
            `Processed audio created: ${processedBlob.size} bytes (trimmed from ${totalSamples} to ${samplesCollected} samples)`
          );
        } else {
          console.warn("No processed audio chunks received!");
        }
      };

      // Iniciar grabación sin timeslice para capturar todo hasta que se detenga manualmente
      // Si necesitas chunks periódicos, usa recorder.start(1000) por ejemplo
      recordingStartTimeRef.current = Date.now();
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      // El servicio de audio ya habrá puesto su propio estado de error
    }
  };

  const handleStopRecording = useCallback(() => {
    if (!isRecording) return;

    recordingStopTimeRef.current = Date.now();
    mediaRecorderRef.current?.stop();
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
