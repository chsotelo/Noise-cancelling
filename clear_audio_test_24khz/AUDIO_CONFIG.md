# Configuración de Variables de Audio

Esta guía documenta todas las variables configurables del sistema de procesamiento de audio para facilitar el ajuste manual y las pruebas.

---

## 📊 DeepFilterNet (Supresión de Ruido)

**Archivo:** `src/worklets/deepfilter-worklet.source.js`

| Variable | Rango de Valores | Valor Actual | Propósito |
|----------|------------------|--------------|-----------|
| `attenLim` | 28-35 dB | **30 dB** | Límite de atenuación de ruido. Valores más altos = supresión más agresiva. **28** = suave, **30** = balanceado, **32** = moderado-agresivo, **35** = agresivo |
| `postFilterBeta` | 0.04-0.10 | **0.06** | Filtro post-procesamiento para ruidos no estacionarios (teclado, clics). **0.04** = suave, **0.06** = ligero, **0.08** = moderado, **0.10** = fuerte |
| `FADEIN_FRAMES` | 0-5 frames | **1** | Frames de fade-in para evitar clicks iniciales. 1 frame = ~10ms. Valores bajos preservan las primeras palabras |

**Ubicación en código (líneas ~106-147):**
```javascript
const attenLim = 30; // Balanced cleaning
const postFilterBeta = 0.06;
this.FADEIN_FRAMES = 1;
```

---

## 🎚️ AudioResampler (Filtro Anti-Aliasing)

**Archivo:** `src/utils/audioResampler.js`

| Variable | Rango de Valores | Valor Actual | Propósito |
|----------|------------------|--------------|-----------|
| `decimationFactor` | 2 (fijo) | **2** | Factor de decimación para 48kHz → 24kHz. No modificar |
| `cutoffFreq` | 0.35-0.45 | **0.4** | Frecuencia de corte normalizada del filtro FIR. **0.4** = buen balance, **0.45** = más agudos, **0.35** = más suave |
| `filterOrder` | 31-127 (impar) | **63** | Orden del filtro FIR (número de taps). Valores más altos = mejor rechazo de aliasing pero más latencia. **31** = rápido, **63** = balanceado, **127** = máxima calidad |
| `beta` | 5.0-9.0 | **7.5** | Parámetro Beta de la ventana Kaiser. Controla el rechazo de stopband. **5.0** = transición suave, **7.5** = balanceado, **9.0** = máximo rechazo |

**Ubicación en código (líneas ~7-23):**
```javascript
this.decimationFactor = 2;
this.cutoffFreq = 0.4;
this.filterOrder = 63;
this.beta = 7.5;
```

---

## 🔊 AudioDynamicProcessor (Normalización y Limitador)

**Archivo:** `src/utils/audioResampler.js` (clase `AudioDynamicProcessor`)

| Variable | Rango de Valores | Valor Actual | Propósito |
|----------|------------------|--------------|-----------|
| `targetRMS` | 0.45-0.70 | **0.58** | Nivel RMS objetivo para normalización. **0.45** = conservador, **0.58** = balanceado, **0.70** = agresivo |
| `noiseGateThreshold` | 0.0005-0.002 | **0.0008** | Umbral de noise gate. Por debajo de este valor se atenúa como silencio. **0.0005** = muy sensible, **0.0008** = balanceado, **0.002** = menos sensible |
| `smoothingFactor` | 0.80-0.95 | **0.88** | Factor de suavizado para cambios de ganancia. Valores más altos = transiciones más suaves. **0.80** = rápido, **0.88** = balanceado, **0.95** = muy suave |
| `maxGain` (implícito) | 1.5-3.0 | **2.5** | Ganancia máxima aplicable. Limita cuánto se puede amplificar el audio silencioso |

**Ubicación en código (líneas ~176-181):**
```javascript
this.targetRMS = 0.58;
this.noiseGateThreshold = 0.0008;
this.smoothingFactor = 0.88;
// maxGain: ver línea ~228: Math.min(..., 2.5)
```

**Lógica de ganancia por niveles RMS (líneas ~218-238):**
- **RMS < 0.0008**: Silencio absoluto → `gain = 0.25`
- **RMS < 0.35**: Voz normal → `gain = targetRMS / rms` (máx 2.5x)
- **RMS 0.35-0.55**: Voz moderada → ajuste suave
- **RMS > 0.55**: Voz alta → `gain = 0.95`

---

## 🎯 Casos de Uso por Configuración

### Configuración Conservadora (Máxima Claridad)
```javascript
// DeepFilterNet
attenLim = 28
postFilterBeta = 0.04

// AudioDynamicProcessor
targetRMS = 0.50
smoothingFactor = 0.90
```
**Uso:** Ambientes silenciosos, prioridad en preservar matices de voz

---

### Configuración Balanceada (Actual - Recomendada)
```javascript
// DeepFilterNet
attenLim = 30
postFilterBeta = 0.06

// AudioDynamicProcessor
targetRMS = 0.58
smoothingFactor = 0.88
```
**Uso:** Uso general, balance entre limpieza y calidad de voz

---

### Configuración Agresiva (Máxima Limpieza)
```javascript
// DeepFilterNet
attenLim = 33
postFilterBeta = 0.08

// AudioDynamicProcessor
targetRMS = 0.65
smoothingFactor = 0.85
```
**Uso:** Ambientes muy ruidosos, tolerancia a leve distorsión en voz

---

## 🔧 Cómo Modificar las Variables

### 1. DeepFilterNet
Editar `src/worklets/deepfilter-worklet.source.js` línea ~106:
```javascript
const attenLim = 30; // Cambiar aquí
```

Línea ~147:
```javascript
const postFilterBeta = 0.06; // Cambiar aquí
```

### 2. AudioResampler
Editar `src/utils/audioResampler.js` línea ~9:
```javascript
this.cutoffFreq = 0.4; // Cambiar aquí
this.filterOrder = 63; // Cambiar aquí
this.beta = 7.5; // Cambiar aquí
```

### 3. AudioDynamicProcessor
Editar `src/utils/audioResampler.js` línea ~176:
```javascript
this.targetRMS = 0.58; // Cambiar aquí
this.noiseGateThreshold = 0.0008; // Cambiar aquí
this.smoothingFactor = 0.88; // Cambiar aquí
```

**⚠️ IMPORTANTE:** Después de cada cambio ejecutar:
```bash
npm run build:worklet && npm run dev
```

---

## 📝 Notas de Prueba

### Síntomas y Ajustes Recomendados

| Síntoma | Variable a Ajustar | Dirección |
|---------|-------------------|-----------|
| Ruido de fondo persistente | `attenLim` | Aumentar (31-33 dB) |
| Voz suena "robótica" | `attenLim` | Disminuir (28-29 dB) |
| Clicks/teclado audibles | `postFilterBeta` | Aumentar (0.07-0.09) |
| Voz demasiado suave | `targetRMS` | Aumentar (0.62-0.68) |
| Audio "bombea" (pumping) | `smoothingFactor` | Aumentar (0.90-0.93) |
| Agudos perdidos | `cutoffFreq` | Aumentar (0.42-0.44) |
| Aliasing audible | `filterOrder` | Aumentar (95-127) |

---

## 🔬 Testing Workflow

1. **Identificar problema:** Ruido, claridad, distorsión, etc.
2. **Consultar tabla de síntomas** arriba
3. **Modificar UNA variable a la vez**
4. **Rebuild:** `npm run build:worklet && npm run dev`
5. **Probar con audio real** (grabar 10-15 segundos)
6. **Documentar resultado** en comentarios del código
7. **Repetir** si es necesario

---

## 📚 Referencias Técnicas

- **DeepFilterNet:** [https://github.com/Rikorose/DeepFilterNet](https://github.com/Rikorose/DeepFilterNet)
- **Kaiser Window:** Ventana óptima para diseño de filtros FIR
- **RMS (Root Mean Square):** Medida de nivel de señal de audio promedio
- **Noise Gate:** Atenúa señales por debajo de un umbral para eliminar ruido de fondo

---

**Versión:** 1.0  
**Última actualización:** 7 de diciembre de 2025
