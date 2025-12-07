/**
 * DeviceCapabilityDetector
 *
 * Detecta automáticamente la capacidad del dispositivo para determinar
 * si debe usar PREMIUM (DeepFilterNet @ 48kHz) o LIGHT (DTLN @ 24kHz)
 */

import { AUDIO_CAPTURE_CONFIG } from "../constants/audioConstants";

export class DeviceCapabilityDetector {
  /**
   * Detecta el modo óptimo basado en capacidades del dispositivo
   * @returns {Promise<'PREMIUM' | 'LIGHT'>}
   */
  static async detectOptimalMode() {
    if (!AUDIO_CAPTURE_CONFIG.AUTO_DETECT_MODE) {
      return AUDIO_CAPTURE_CONFIG.DEFAULT_MODE;
    }

    const scores = {
      cpuScore: 0,
      memoryScore: 0,
      browserScore: 0,
      deviceScore: 0,
    };

    // 1. CPU Benchmark (peso: 50%)
    console.log("🔍 Running CPU benchmark...");
    scores.cpuScore = await this.benchmarkCPU();

    // 2. Memory Score (peso: 25%)
    scores.memoryScore = this.detectMemory();

    // 3. Browser Score (peso: 15%)
    scores.browserScore = this.detectBrowser();

    // 4. Device Type Score (peso: 10%)
    scores.deviceScore = this.detectDeviceType();

    // Calcular score total ponderado
    const totalScore =
      scores.cpuScore * 0.5 +
      scores.memoryScore * 0.25 +
      scores.browserScore * 0.15 +
      scores.deviceScore * 0.1;

    console.log("📊 Device Capability Scores:", {
      cpu: `${scores.cpuScore.toFixed(1)}/100`,
      memory: `${scores.memoryScore.toFixed(1)}/100`,
      browser: `${scores.browserScore.toFixed(1)}/100`,
      device: `${scores.deviceScore.toFixed(1)}/100`,
      total: `${totalScore.toFixed(1)}/100`,
    });

    // Decisión: >= 60 puntos → PREMIUM, < 60 → LIGHT
    const mode = totalScore >= 60 ? "PREMIUM" : "LIGHT";

    console.log(`✅ Selected mode: ${mode} (score: ${totalScore.toFixed(1)})`);

    return mode;
  }

  /**
   * Benchmark de CPU usando operaciones de punto flotante
   * @returns {number} Score de 0 a 100
   */
  static async benchmarkCPU() {
    const start = performance.now();

    // Test 1: Operaciones matemáticas intensivas (simula procesamiento de audio)
    let result = 0;
    const iterations = 5_000_000;

    for (let i = 0; i < iterations; i++) {
      result += Math.sqrt(i) * Math.sin(i * 0.001) * Math.cos(i * 0.002);
    }

    const elapsed = performance.now() - start;

    console.log(
      `  CPU benchmark: ${elapsed.toFixed(1)}ms for ${iterations} ops`
    );

    // Score basado en tiempo:
    // < 50ms = 100 pts (muy rápido)
    // 50-150ms = 100-50 pts (normal)
    // > 300ms = 0 pts (muy lento)

    if (elapsed < 50) return 100;
    if (elapsed > 300) return 0;

    return Math.max(0, 100 - ((elapsed - 50) / 250) * 100);
  }

  /**
   * Detecta la memoria disponible
   * @returns {number} Score de 0 a 100
   */
  static detectMemory() {
    // API deviceMemory (Chrome/Edge)
    if (navigator.deviceMemory) {
      const gb = navigator.deviceMemory;
      console.log(`  Device memory: ${gb}GB`);

      // >= 8GB = 100 pts
      // 4GB = 70 pts
      // 2GB = 40 pts
      // < 2GB = 0 pts

      if (gb >= 8) return 100;
      if (gb >= 4) return 70;
      if (gb >= 2) return 40;
      return 0;
    }

    // Fallback: asumir dispositivo moderno
    console.log("  Device memory: Unknown (assuming modern device)");
    return 70;
  }

  /**
   * Detecta el navegador y su capacidad
   * @returns {number} Score de 0 a 100
   */
  static detectBrowser() {
    const ua = navigator.userAgent;

    // Chrome/Edge (mejor soporte para Web Audio)
    if (/Chrome|Edg/.test(ua) && !/OPR/.test(ua)) {
      console.log("  Browser: Chrome/Edge (excellent)");
      return 100;
    }

    // Firefox (buen soporte)
    if (/Firefox/.test(ua)) {
      console.log("  Browser: Firefox (good)");
      return 85;
    }

    // Safari (soporte aceptable pero con quirks)
    if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
      console.log("  Browser: Safari (acceptable)");
      return 70;
    }

    // Otros navegadores
    console.log("  Browser: Other (unknown)");
    return 50;
  }

  /**
   * Detecta el tipo de dispositivo
   * @returns {number} Score de 0 a 100
   */
  static detectDeviceType() {
    const ua = navigator.userAgent;

    // Desktop/Laptop
    if (!/Mobile|Android|iPhone|iPad/.test(ua)) {
      console.log("  Device type: Desktop/Laptop");
      return 100;
    }

    // Tablet
    if (/iPad|Tablet/.test(ua)) {
      console.log("  Device type: Tablet");
      return 80;
    }

    // Mobile de gama alta (heurística simple)
    if (/iPhone (1[4-9]|[2-9]\d)|Pixel [6-9]|Galaxy S2\d/.test(ua)) {
      console.log("  Device type: High-end mobile");
      return 70;
    }

    // Mobile genérico
    console.log("  Device type: Mobile (generic)");
    return 50;
  }

  /**
   * Monitorea el rendimiento en tiempo real y sugiere cambios de modo
   * @param {Function} callback - Callback con sugerencia ('UPGRADE' | 'DOWNGRADE')
   */
  static monitorRuntime(callback) {
    const cpuSamples = [];
    const maxSamples = 10;

    const intervalId = setInterval(() => {
      // Medir timing indirecto de CPU vía requestAnimationFrame
      const frameStart = performance.now();

      requestAnimationFrame(() => {
        const frameTime = performance.now() - frameStart;
        cpuSamples.push(frameTime);

        if (cpuSamples.length > maxSamples) {
          cpuSamples.shift();
        }

        // Analizar últimas 10 muestras
        if (cpuSamples.length === maxSamples) {
          const avgFrameTime = cpuSamples.reduce((a, b) => a + b) / maxSamples;
          const variance = this.calculateVariance(cpuSamples);

          // AJUSTADO: Umbrales más realistas para evitar falsas alarmas
          // 50ms = 20 FPS (muy malo), 100 varianza = frames muy inestables
          // Alta varianza + frameTime alto = CPU sobrecargada
          if (avgFrameTime > 50 && variance > 100) {
            console.warn("⚠️ High CPU load detected, suggesting DOWNGRADE");
            callback("DOWNGRADE");
          }
          // Baja varianza + frameTime bajo = CPU disponible
          else if (avgFrameTime < 10 && variance < 20) {
            console.log("✅ Low CPU load, safe to UPGRADE");
            callback("UPGRADE");
          }
        }
      });
    }, 2000); // Check cada 2 segundos

    return intervalId; // Para poder cancelar el monitoreo
  }

  /**
   * Calcula la varianza de un array de números
   * @param {number[]} arr
   * @returns {number}
   */
  static calculateVariance(arr) {
    if (arr.length === 0) return 0;

    const mean = arr.reduce((sum, val) => sum + val, 0) / arr.length;
    const squaredDiffs = arr.map((val) => Math.pow(val - mean, 2));

    return squaredDiffs.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  /**
   * Forzar detección de capacidad sincrónica (para tests)
   * @returns {'PREMIUM' | 'LIGHT'}
   */
  static detectOptimalModeSync() {
    // Solo basado en memoria y navegador (sin benchmark async)
    const memoryScore = this.detectMemory();
    const browserScore = this.detectBrowser();
    const deviceScore = this.detectDeviceType();

    const quickScore =
      memoryScore * 0.4 + browserScore * 0.3 + deviceScore * 0.3;

    return quickScore >= 60 ? "PREMIUM" : "LIGHT";
  }
}
