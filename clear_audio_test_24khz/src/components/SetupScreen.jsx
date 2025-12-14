import { useState, useEffect } from "react";
import { modelStorage } from "../services/modelStorage";
import { AUDIO_MODES } from "../constants/audioConstants";
import "./SetupScreen.css";

export default function SetupScreen({ onContinue }) {
  const [selectedMode, setSelectedMode] = useState("LIGHT"); // LIGHT or PREMIUM
  const [modelStatus, setModelStatus] = useState({
    available: false,
    checking: true,
    downloading: false,
    progress: 0,
    error: null,
  });
  const [selectedDeviceId, setSelectedDeviceId] = useState("default");
  const [devices, setDevices] = useState([]);

  // Check model availability on mount
  useEffect(() => {
    checkModelAvailability();
    loadDevices();
  }, []);

  const checkModelAvailability = async () => {
    try {
      const available = await modelStorage.isModelAvailable();
      setModelStatus({
        available,
        checking: false,
        downloading: false,
        progress: 0,
        error: null,
      });
    } catch (error) {
      setModelStatus({
        available: false,
        checking: false,
        downloading: false,
        progress: 0,
        error: "Failed to check model status",
      });
    }
  };

  const loadDevices = async () => {
    try {
      // Request permission first
      const tempStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = deviceList.filter((d) => d.kind === "audioinput");

      // Ensure we have at least one device
      if (audioInputs.length === 0) {
        // Add default device as fallback
        setDevices([
          {
            deviceId: "default",
            label: "Default Microphone",
            kind: "audioinput",
          },
        ]);
      } else {
        setDevices(audioInputs);
      }

      // Stop temp stream
      tempStream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      console.error("Failed to load devices:", error);
      // Set default device if permission denied
      setDevices([
        {
          deviceId: "default",
          label: "Default Microphone",
          kind: "audioinput",
        },
      ]);
    }
  };

  const handleDownloadModel = async () => {
    setModelStatus((prev) => ({
      ...prev,
      downloading: true,
      progress: 0,
      error: null,
    }));

    try {
      // Model URL - adjust to your actual path
      const modelUrl = `${
        import.meta.env.BASE_URL
      }models/tandm_filter.tar.gz.bin`;

      await modelStorage.downloadAndSaveModel(modelUrl, (progress) => {
        setModelStatus((prev) => ({ ...prev, progress }));
      });

      setModelStatus({
        available: true,
        checking: false,
        downloading: false,
        progress: 100,
        error: null,
      });
    } catch (error) {
      setModelStatus((prev) => ({
        ...prev,
        downloading: false,
        error: error.message || "Download failed",
      }));
    }
  };

  const handleDeleteModel = async () => {
    if (!confirm("Do you want to delete the downloaded model? (8 MB)")) {
      return;
    }

    try {
      await modelStorage.deleteModel();
      setModelStatus({
        available: false,
        checking: false,
        downloading: false,
        progress: 0,
        error: null,
      });
    } catch (error) {
      setModelStatus((prev) => ({
        ...prev,
        error: "Error deleting model",
      }));
    }
  };

  const handleContinue = () => {
    if (canContinue) {
      onContinue({
        mode: selectedMode,
        deviceId: selectedDeviceId,
      });
    }
  };

  // Can only continue if LIGHT mode OR (PREMIUM mode AND model available)
  const canContinue =
    selectedMode === "LIGHT" ||
    (selectedMode === "PREMIUM" && modelStatus.available);

  const isPremiumMode = selectedMode === "PREMIUM";
  const needsDownload = isPremiumMode && !modelStatus.available;

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h1>Start Conversation</h1>
        <p className="subtitle">Configure your audio processing mode</p>

        {/* Mode Selection */}
        <section className="section">
          <h2>Processing Mode</h2>
          <div className="mode-options">
            <label
              className={`mode-card ${
                selectedMode === "LIGHT" ? "selected" : ""
              }`}>
              <input
                type="radio"
                name="mode"
                value="LIGHT"
                checked={selectedMode === "LIGHT"}
                onChange={(e) => setSelectedMode(e.target.value)}
              />
              <div className="mode-content">
                <h3>Normal Mode</h3>
                <p className="mode-description">
                  {AUDIO_MODES.LIGHT.description}
                </p>
                <div className="mode-features">
                  <span className="badge success">✓ Ready to use</span>
                  <span className="badge info">Low latency</span>
                  <span className="badge info">Clean environment</span>
                </div>
              </div>
            </label>

            <label
              className={`mode-card ${
                selectedMode === "PREMIUM" ? "selected" : ""
              }`}>
              <input
                type="radio"
                name="mode"
                value="PREMIUM"
                checked={selectedMode === "PREMIUM"}
                onChange={(e) => setSelectedMode(e.target.value)}
              />
              <div className="mode-content">
                <h3>Advanced Noise Cleaning</h3>
                <p className="mode-description">
                  {AUDIO_MODES.PREMIUM.description}
                </p>
                <div className="mode-features">
                  {modelStatus.checking ? (
                    <span className="badge">⏳ Checking...</span>
                  ) : modelStatus.available ? (
                    <>
                      <span className="badge success">✓ Model downloaded</span>
                      <button
                        className="delete-model-btn"
                        onClick={(e) => {
                          e.preventDefault();
                          handleDeleteModel();
                        }}
                        title="Delete downloaded model">
                        🗑️
                      </button>
                    </>
                  ) : (
                    <span className="badge warning">
                      ⬇ Requires download (8 MB)
                    </span>
                  )}
                  <span className="badge info">Maximum quality</span>
                  <span className="badge info">Noisy environment</span>
                </div>
              </div>
            </label>
          </div>
        </section>

        {/* Download Section (only if PREMIUM mode selected and not available) */}
        {needsDownload && (
          <section className="section download-section">
            <div className="download-info">
              <h3>Model Download Required</h3>
              <p>
                Advanced cleaning mode requires downloading an AI model (~8 MB).
                <br />
                You only need to download it once, it will be saved in your
                browser.
              </p>

              {modelStatus.error && (
                <div className="error-message">{modelStatus.error}</div>
              )}

              {!modelStatus.downloading ? (
                <button
                  className="download-button"
                  onClick={handleDownloadModel}>
                  Download Model (8 MB)
                </button>
              ) : (
                <div className="download-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${modelStatus.progress}%` }}></div>
                  </div>
                  <p className="progress-text">
                    Downloading... {modelStatus.progress}%
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Microphone Selection */}
        <section className="section">
          <h2>Select Microphone</h2>
          <select
            className="device-select"
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}>
            {devices.length === 0 ? (
              <option value="default">Loading microphones...</option>
            ) : (
              devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                </option>
              ))
            )}
          </select>
        </section>

        {/* Continue Button */}
        <div className="actions">
          <button
            className="continue-button"
            onClick={handleContinue}
            disabled={!canContinue || modelStatus.downloading}>
            {canContinue ? "Continue" : "Select an available mode"}
          </button>
        </div>
      </div>
    </div>
  );
}
