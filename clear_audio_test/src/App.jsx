import { useState, useRef, useEffect, useCallback } from "react";
import { localAudioService } from "./services/LocalAudioService";
import {
  AudioServiceStatus,
  AUDIO_CAPTURE_CONFIG,
} from "./constants/audioConstants";
import { encodeWAV } from "./services/wavEncoder";
import { BrowserCapabilities } from "./utils/browserCapabilities";
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
  const mediaRecorderRef = useRef(null);
  const originalAudioChunksRef = useRef([]);
  const processedAudioChunksRef = useRef([]);
  const isMountedRef = useRef(true);
  const bestCodecRef = useRef(BrowserCapabilities.getBestAudioCodec());

  const handleAudioStateChange = useCallback((newState) => {
    setAppState(newState);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    localAudioService.init(handleAudioStateChange, { preInitializeDTLN: true });
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
      // Iniciar el servicio. Nos devuelve el stream original.
      const originalStream = await localAudioService.start(handleProcessedData);

      // --- Configurar MediaRecorder para el audio ORIGINAL ---
      const codecToUse = bestCodecRef.current;
      console.log(`Using audio codec: ${codecToUse}`);

      const recorderOptions = {
        mimeType: codecToUse,
      };

      const recorder = new MediaRecorder(originalStream, recorderOptions);
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
          const originalBlob = new Blob(originalAudioChunksRef.current, {
            type: bestCodecRef.current,
          });
          setOriginalAudioUrl(URL.createObjectURL(originalBlob));
        } else {
          console.warn("No original audio chunks received!");
        }

        // --- Generar audio PROCESADO ---
        if (processedAudioChunksRef.current.length > 0) {
          const processedBlob = encodeWAV(
            processedAudioChunksRef.current,
            AUDIO_CAPTURE_CONFIG.TRANSMISSION_SAMPLE_RATE,
            AUDIO_CAPTURE_CONFIG.CHANNELS
          );
          setProcessedAudioUrl(URL.createObjectURL(processedBlob));
          console.log(`Processed audio created: ${processedBlob.size} bytes`);
        } else {
          console.warn("No processed audio chunks received!");
        }
      };

      // Iniciar grabación sin timeslice para capturar todo hasta que se detenga manualmente
      // Si necesitas chunks periódicos, usa recorder.start(1000) por ejemplo
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      // El servicio de audio ya habrá puesto su propio estado de error
    }
  };

  const handleStopRecording = useCallback(() => {
    if (!isRecording) return;

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
