/**
 * High-Quality Audio Resampler
 * Implements anti-aliasing FIR filter + decimation for 48kHz → 24kHz
 * Using Kaiser window for optimal stopband attenuation
 */

export class AudioResampler {
  constructor() {
    // Design parameters for 48kHz → 24kHz (2:1 decimation)
    this.decimationFactor = 2;
    this.cutoffFreq = 0.4; // Well below Nyquist (0.5) for excellent anti-aliasing
    this.filterOrder = 63; // Higher order = better stopband attenuation, minimal aliasing
    this.beta = 7.5; // Kaiser window parameter (7.5 = better stopband rejection)

    // Pre-compute FIR filter coefficients
    this.filterCoeffs = this.designKaiserLowpass(
      this.filterOrder,
      this.cutoffFreq,
      this.beta
    );

    // State buffer for FIR filtering (overlapping samples)
    this.stateBuffer = new Float32Array(this.filterOrder);
    this.statePos = 0;

    console.log(
      `[Resampler] Initialized: ${this.filterOrder}-tap Kaiser FIR, cutoff=${this.cutoffFreq}`
    );
  }

  /**
   * Design Kaiser-windowed lowpass FIR filter
   * @param {number} order - Filter order (number of taps)
   * @param {number} cutoff - Normalized cutoff frequency (0-1)
   * @param {number} beta - Kaiser window beta parameter
   * @returns {Float32Array} Filter coefficients
   */
  designKaiserLowpass(order, cutoff, beta) {
    const M = order;
    const coeffs = new Float32Array(M + 1);
    const center = M / 2;

    // Generate ideal sinc lowpass
    for (let n = 0; n <= M; n++) {
      if (n === center) {
        coeffs[n] = 2 * cutoff; // sinc(0) = 1
      } else {
        const x = (n - center) * Math.PI;
        coeffs[n] =
          (Math.sin(2 * cutoff * x) / x) * this.kaiserWindow(n, M, beta);
      }
    }

    // Normalize to unity gain at DC
    const sum = coeffs.reduce((a, b) => a + b, 0);
    for (let i = 0; i <= M; i++) {
      coeffs[i] /= sum;
    }

    return coeffs;
  }

  /**
   * Kaiser window function
   * @param {number} n - Sample index
   * @param {number} M - Window length - 1
   * @param {number} beta - Shape parameter
   * @returns {number} Window value
   */
  kaiserWindow(n, M, beta) {
    const arg = beta * Math.sqrt(1 - Math.pow((2 * n) / M - 1, 2));
    return this.besselI0(arg) / this.besselI0(beta);
  }

  /**
   * Modified Bessel function of the first kind, order 0
   * Used in Kaiser window calculation
   * @param {number} x - Input value
   * @returns {number} I0(x)
   */
  besselI0(x) {
    let sum = 1.0;
    let term = 1.0;
    let m = 1;

    // Series expansion (sufficient accuracy with 25 terms)
    while (m < 25) {
      term *= (x * x) / (4 * m * m);
      sum += term;
      m++;
    }

    return sum;
  }

  /**
   * Apply FIR filter to input buffer
   * @param {Float32Array} input - Input samples @ 48kHz
   * @returns {Float32Array} Filtered samples @ 48kHz
   */
  applyFirFilter(input) {
    const output = new Float32Array(input.length);
    const M = this.filterOrder;

    for (let n = 0; n < input.length; n++) {
      let sum = 0;

      // Convolve with FIR coefficients
      for (let k = 0; k <= M; k++) {
        const idx = n - k;
        let sample;

        if (idx >= 0) {
          sample = input[idx];
        } else {
          // Use state buffer for past samples
          const stateIdx =
            (this.statePos + idx + this.stateBuffer.length) %
            this.stateBuffer.length;
          sample = this.stateBuffer[stateIdx];
        }

        sum += this.filterCoeffs[k] * sample;
      }

      output[n] = sum;
    }

    // Update state buffer with last M samples
    for (let i = 0; i < Math.min(M, input.length); i++) {
      this.stateBuffer[(this.statePos + i) % this.stateBuffer.length] =
        input[input.length - M + i];
    }
    this.statePos =
      (this.statePos + Math.min(M, input.length)) % this.stateBuffer.length;

    return output;
  }

  /**
   * Resample 48kHz → 24kHz with anti-aliasing
   * @param {Float32Array} input48k - Input samples @ 48kHz
   * @returns {Float32Array} Output samples @ 24kHz
   */
  resample48to24(input48k) {
    // Step 1: Apply anti-aliasing lowpass filter
    const filtered = this.applyFirFilter(input48k);

    // Step 2: Decimate by 2 (keep every other sample)
    const outputLength = Math.floor(filtered.length / this.decimationFactor);
    const output24k = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      output24k[i] = filtered[i * this.decimationFactor];
    }

    return output24k;
  }

  /**
   * Reset filter state (call when starting new stream)
   */
  reset() {
    this.stateBuffer.fill(0);
    this.statePos = 0;
  }
}

/**
 * Audio Dynamic Processor
 * Implements:
 * - Adaptive gain normalization
 * - Soft limiter/compressor
 * - Peak detection
 */
export class AudioDynamicProcessor {
  constructor() {
    // SIMPLIFICADO: Solo normalización suave sin complejidad innecesaria
    this.targetRMS = 0.58; // Target RMS más conservador
    this.noiseGateThreshold = 0.0008; // Threshold muy bajo - solo silencio absoluto
    this.smoothingFactor = 0.88; // MUY suave para eliminar pumping
    this.previousGain = 1.0; // Empezar neutral
  }

  /**
   * Calculate RMS (Root Mean Square) level of audio buffer
   * @param {Float32Array} buffer
   * @returns {number} RMS level (0-1)
   */
  calculateRMS(buffer) {
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSquares += buffer[i] * buffer[i];
    }
    return Math.sqrt(sumSquares / buffer.length);
  }

  /**
   * Calculate peak level of audio buffer
   * @param {Float32Array} buffer
   * @returns {number} Peak level (0-1)
   */
  calculatePeak(buffer) {
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const abs = Math.abs(buffer[i]);
      if (abs > peak) peak = abs;
    }
    return peak;
  }

  /**
   * Process audio buffer - SIMPLIFICADO para claridad
   * @param {Float32Array} buffer - Input buffer
   * @returns {Object} {processed: Float32Array, gainApplied: number, rms: number, peak: number, saturated: boolean}
   */
  process(buffer) {
    // Calculate signal level
    const rms = this.calculateRMS(buffer);
    const peak = this.calculatePeak(buffer);

    // Calcular gain target basado en RMS
    let targetGain = 1.0;

    if (rms < this.noiseGateThreshold) {
      // Silencio absoluto - atenuar
      targetGain = 0.25;
    } else if (rms < 0.35) {
      // Voz normal - normalizar
      targetGain = Math.min(this.targetRMS / Math.max(rms, 0.008), 2.5);
    } else if (rms < 0.55) {
      // Voz moderada - ajuste suave
      targetGain = Math.max(0.95, this.targetRMS / rms);
    } else {
      // Voz alta - reducir levemente
      targetGain = 0.95;
    }

    // Prevenir clipping basado en peak
    if (peak * targetGain > 0.96) {
      targetGain = 0.93 / peak;
    }

    // Smoothing adaptivo: más rápido para bajar gain, más lento para subir
    // Esto evita distorsión cuando RMS baja súbitamente
    let smoothFactor = this.smoothingFactor;
    if (targetGain < this.previousGain) {
      // Bajar gain más rápido (menos smoothing)
      smoothFactor = 0.75;
    }

    const gain =
      this.previousGain * smoothFactor + targetGain * (1 - smoothFactor);
    this.previousGain = gain;

    // Aplicar gain y limiter ultra-suave
    const processed = new Float32Array(buffer.length);
    let saturated = false;

    for (let i = 0; i < buffer.length; i++) {
      let sample = buffer[i] * gain;

      // Soft limiter con knee MUY amplio (0.80 - 0.96)
      const absValue = Math.abs(sample);
      if (absValue > 0.8) {
        const excess = absValue - 0.8;
        const kneeWidth = 0.16; // Knee más amplio: 0.80 a 0.96

        if (excess < kneeWidth) {
          // Soft knee con curva ultra-suave
          const ratio = excess / kneeWidth;
          const curve = ratio * ratio * (3 - 2 * ratio); // S-curve
          const compressed = 0.8 + excess * (1 - curve * 0.5); // Compresión más suave
          sample = (sample / absValue) * Math.min(compressed, 0.96);
        } else {
          // Hard limit en 0.96
          sample = (sample / absValue) * 0.96;
          saturated = true;
        }
      }

      processed[i] = sample;
    }

    return {
      processed,
      gainApplied: gain,
      rms,
      peak,
      saturated,
    };
  }
}
