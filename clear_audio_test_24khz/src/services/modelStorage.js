// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IndexedDB Storage for DeepFilterNet Model
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DB_NAME = "TandmStorage";
const DB_VERSION = 1;
const STORE_NAME = "models";
const MODEL_KEY = "tandm-audiofilter-model";

class ModelStorage {
  static instance;
  db = null;

  static getInstance() {
    if (!ModelStorage.instance) {
      ModelStorage.instance = new ModelStorage();
    }
    return ModelStorage.instance;
  }

  /**
   * Initialize IndexedDB connection
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error("Failed to open IndexedDB"));
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  /**
   * Check if DeepFilterNet model is already downloaded
   * @returns {Promise<boolean>}
   */
  async isModelAvailable() {
    try {
      await this.init();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(MODEL_KEY);

        request.onsuccess = () => {
          const result = request.result;

          // Validate that model exists and has valid data
          if (result && result.byteLength > 0) {
            // Additional validation: check gzip magic bytes
            const bytes = new Uint8Array(result);
            const isValidGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
            resolve(isValidGzip);
          } else {
            resolve(false);
          }
        };

        request.onerror = () => {
          resolve(false); // If error, assume not available
        };
      });
    } catch (error) {
      console.error("Error checking model availability:", error);
      return false;
    }
  }

  /**
   * Save DeepFilterNet model to IndexedDB
   * @param {ArrayBuffer} modelData - The tar.gz model file as ArrayBuffer
   * @returns {Promise<void>}
   */
  async saveModel(modelData) {
    await this.init();

    // Validate input
    if (!modelData || !(modelData instanceof ArrayBuffer)) {
      throw new Error("Invalid model data: must be ArrayBuffer");
    }

    // Basic validation - ensure we have data
    if (modelData.byteLength === 0) {
      throw new Error("Invalid model file: empty data");
    }

    // Validate file signature (optional check, don't fail on unknown formats)
    const bytes = new Uint8Array(modelData);
    const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
    const isTar =
      bytes.length > 263 &&
      bytes[257] === 0x75 && // 'u'
      bytes[258] === 0x73 && // 's'
      bytes[259] === 0x74 && // 't'
      bytes[260] === 0x61 && // 'a'
      bytes[261] === 0x72; // 'r'

    if (isGzip) {
      console.log("[ModelStorage] Detected gzip format");
    } else if (isTar) {
      console.log("[ModelStorage] Detected tar format");
    } else {
      console.log("[ModelStorage] Unknown format, proceeding anyway");
      // Don't throw - the model might be in a different format
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(modelData, MODEL_KEY);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error("Failed to save model to IndexedDB"));
      };
    });
  }

  /**
   * Load DeepFilterNet model from IndexedDB
   * @returns {Promise<ArrayBuffer>}
   */
  async loadModel() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(MODEL_KEY);

      request.onsuccess = () => {
        const result = request.result;

        if (!result) {
          reject(new Error("Model not found in storage"));
          return;
        }

        // Validate data integrity
        const bytes = new Uint8Array(result);
        const isValidGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;

        if (!isValidGzip) {
          reject(new Error("Stored model is corrupted"));
          return;
        }

        resolve(result);
      };

      request.onerror = () => {
        reject(new Error("Failed to load model from IndexedDB"));
      };
    });
  }

  /**
   * Delete model from IndexedDB (for cache clearing)
   * @returns {Promise<void>}
   */
  async deleteModel() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(MODEL_KEY);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error("Failed to delete model from IndexedDB"));
      };
    });
  }

  /**
   * Get storage usage information
   * @returns {Promise<{size: number, available: boolean}>}
   */
  async getStorageInfo() {
    try {
      const isAvailable = await this.isModelAvailable();

      if (!isAvailable) {
        return { size: 0, available: false };
      }

      const modelData = await this.loadModel();
      const sizeInMB = (modelData.byteLength / (1024 * 1024)).toFixed(2);

      return {
        size: parseFloat(sizeInMB),
        available: true,
      };
    } catch (error) {
      return { size: 0, available: false };
    }
  }

  /**
   * Download DeepFilterNet model with progress tracking
   * @param {string} modelUrl - URL to download model from
   * @param {Function} onProgress - Callback for progress updates (0-100)
   * @returns {Promise<void>}
   */
  async downloadAndSaveModel(modelUrl, onProgress = () => {}) {
    try {
      const response = await fetch(modelUrl);

      if (!response.ok) {
        throw new Error(
          `Download failed: ${response.status} ${response.statusText}`
        );
      }

      const contentLength = response.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      if (!response.body) {
        throw new Error("ReadableStream not supported");
      }

      const reader = response.body.getReader();
      const chunks = [];
      let receivedLength = 0;

      // Read stream with progress tracking
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        // Report progress
        if (total > 0) {
          const progress = Math.round((receivedLength / total) * 100);
          onProgress(progress);
        }
      }

      // Concatenate chunks into single ArrayBuffer
      const modelData = new Uint8Array(receivedLength);
      let position = 0;

      for (const chunk of chunks) {
        modelData.set(chunk, position);
        position += chunk.length;
      }

      // Save to IndexedDB
      await this.saveModel(modelData.buffer);
      onProgress(100);
    } catch (error) {
      console.error("Model download failed:", error);
      throw error;
    }
  }

  /**
   * Close IndexedDB connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const modelStorage = ModelStorage.getInstance();
