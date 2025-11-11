# Integración de DTLN para Procesamiento de Audio en Tiempo Real

## 📋 Resumen

Este documento explica cómo integrar el módulo DTLN de supresión de ruido en tu aplicación para procesar audio en **tiempo real con chunks**.

## 🎯 Casos de Uso

### 1. **WebRTC / Videollamadas**
Procesa el audio del micrófono antes de enviarlo por la red.

```javascript
const processor = new RealtimeNoiseSuppressionStream();
const { stream: cleanStream } = await processor.processFromMicrophone();

// Agregar a WebRTC
const peerConnection = new RTCPeerConnection();
cleanStream.getAudioTracks().forEach(track => {
  peerConnection.addTrack(track, cleanStream);
});
```

### 2. **WebSocket Streaming**
Procesa chunks individuales que recibes/envías por WebSocket.

```javascript
const processor = new RealtimeNoiseSuppressionStream();
await processor.initialize();

// Cuando recibes un chunk
websocket.onmessage = async (event) => {
  const audioChunk = new Float32Array(event.data);
  const cleanChunk = await processor.processChunk(audioChunk);
  
  // Enviar el chunk limpio
  sendToDestination(cleanChunk);
};
```

### 3. **MediaRecorder con Streaming**
Graba audio limpio en tiempo real.

```javascript
const processor = new RealtimeNoiseSuppressionStream();
const { stream: cleanStream } = await processor.processFromMicrophone();

const recorder = new MediaRecorder(cleanStream, {
  mimeType: 'audio/webm;codecs=opus'
});

recorder.ondataavailable = (event) => {
  // Cada chunk ya está procesado y limpio
  const cleanChunk = event.data;
  uploadChunk(cleanChunk); // Subir a servidor
};

recorder.start(1000); // Generar chunks cada 1 segundo
```

## 🔧 Arquitectura del Sistema

### Flujo de Datos en Tiempo Real

```
Micrófono/Stream → AudioContext → AudioWorkletNode (DTLN) → Destino
                                          ↓
                                    Procesamiento:
                                    - Acumula hasta 512 samples
                                    - Ejecuta dtln_denoise()
                                    - Devuelve audio limpio
```

### Características Clave

✅ **Latencia ultra-baja**: Procesa en chunks de 128 samples (~8ms a 16kHz)
✅ **Sin bloqueo**: Todo ocurre en AudioWorklet (thread separado)
✅ **Buffer automático**: El worklet maneja la acumulación a 512 samples
✅ **Compatible con WebRTC**: Funciona con RTCPeerConnection

## 📝 Implementación Paso a Paso

### Paso 1: Inicializar el Procesador

```javascript
class RealtimeNoiseSuppressionStream {
  async initialize() {
    // Crear contexto de audio a 16kHz (requerido por DTLN)
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    
    // Cargar el módulo AudioWorklet
    await this.audioContext.audioWorklet.addModule("audio-worklet.js");
    
    // Crear el nodo procesador
    this.workletNode = new AudioWorkletNode(
      this.audioContext, 
      "NoiseSuppressionWorker"
    );

    // Esperar a que WASM esté listo
    await new Promise((resolve) => {
      this.workletNode.port.onmessage = (event) => {
        if (event.data === "ready") resolve();
      };
    });
  }
}
```

### Paso 2: Conectar el Flujo de Audio

```javascript
async processFromMicrophone() {
  // Obtener micrófono
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });

  // Crear grafo de audio
  const source = this.audioContext.createMediaStreamSource(stream);
  const destination = this.audioContext.createMediaStreamDestination();

  // Conectar: Micrófono → DTLN → Salida
  source.connect(this.workletNode);
  this.workletNode.connect(destination);

  // destination.stream contiene el audio limpio
  return destination.stream;
}
```

### Paso 3: Usar el Stream Procesado

```javascript
// Ejemplo: Reproducir localmente
const cleanStream = await processor.processFromMicrophone();
const audio = new Audio();
audio.srcObject = cleanStream;
audio.play();

// Ejemplo: Enviar por WebRTC
peerConnection.addTrack(cleanStream.getAudioTracks()[0], cleanStream);

// Ejemplo: Grabar
const recorder = new MediaRecorder(cleanStream);
recorder.start();
```

## 🚀 Configuraciones Avanzadas

### Procesamiento de Chunks Individuales

Si necesitas procesar chunks de audio que recibes (ej: desde WebSocket):

```javascript
async processChunk(audioChunk) {
  // audioChunk debe ser Float32Array, mono, 16kHz
  
  // Crear buffer temporal
  const buffer = this.audioContext.createBuffer(
    1, 
    audioChunk.length,
    16000
  );
  buffer.copyToChannel(audioChunk, 0);

  // Procesar offline
  const offlineCtx = new OfflineAudioContext(1, audioChunk.length, 16000);
  await offlineCtx.audioWorklet.addModule("audio-worklet.js");
  
  const processor = new AudioWorkletNode(offlineCtx, "NoiseSuppressionWorker");
  
  return new Promise((resolve) => {
    processor.port.onmessage = (event) => {
      if (event.data === "ready") {
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(processor);
        processor.connect(offlineCtx.destination);
        source.start();

        offlineCtx.startRendering().then((result) => {
          resolve(result.getChannelData(0));
        });
      }
    };
  });
}
```

### Procesar Stream Existente (ej: Screen Capture)

```javascript
async processExistingStream(inputStream) {
  const source = this.audioContext.createMediaStreamSource(inputStream);
  const destination = this.audioContext.createMediaStreamDestination();

  source.connect(this.workletNode);
  this.workletNode.connect(destination);

  return destination.stream;
}
```

## ⚙️ Requisitos Técnicos

### Formato de Audio
- **Sample Rate**: 16000 Hz (obligatorio para DTLN)
- **Canales**: Mono (1 canal)
- **Formato**: Float32Array (valores entre -1.0 y 1.0)
- **Chunk Size**: El worklet procesa en bloques de 512 samples

### Conversión de Formatos

Si tu audio está en otro formato:

```javascript
// Resamplear de 48kHz a 16kHz
function resample(buffer, targetRate = 16000) {
  const offlineCtx = new OfflineAudioContext(
    1, 
    Math.ceil(buffer.length * targetRate / buffer.sampleRate),
    targetRate
  );
  
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start();
  
  return offlineCtx.startRendering();
}

// Convertir estéreo a mono
function stereoToMono(left, right) {
  const mono = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    mono[i] = (left[i] + right[i]) / 2;
  }
  return mono;
}
```

## 📊 Métricas y Monitoreo

El worklet envía métricas cada 5 segundos:

```javascript
workletNode.port.onmessage = (event) => {
  if (event.data !== "ready") {
    console.log("Metrics:", {
      samplesPerSecond: event.data.avg_samples_processed,
      inputSignal: event.data.avg_input_signal,
      outputSignal: event.data.avg_output_signal,
      enhancement: event.data.avg_signal_enhancement,
      suppression: event.data.avg_signal_suppression
    });
  }
};
```

## 🐛 Troubleshooting

### El audio suena entrecortado
- Verifica que la sample rate sea 16000 Hz
- Asegúrate de no bloquear el thread principal
- Revisa que no haya underruns en el buffer

### No se procesa el audio
- Verifica que el módulo WASM haya cargado (mensaje "ready")
- Confirma que el audio sea mono
- Revisa la consola por errores de CORS

### Latencia alta
- Reduce el tamaño de buffer del AudioContext
- Usa `AudioWorkletNode` en lugar de `ScriptProcessorNode`
- Evita operaciones síncronas en el callback de audio

## 💡 Best Practices

1. **Inicializa una vez**: Crea una única instancia del procesador y reutilízala
2. **Maneja errores**: El worklet puede fallar si la WASM no carga
3. **Limpia recursos**: Llama a `dispose()` cuando termines
4. **Sample rate correcto**: Siempre usa 16kHz para DTLN
5. **Testing**: Prueba con diferentes tipos de ruido (ventilador, teclado, tráfico)

## 📦 Ejemplo Completo para WebRTC

```javascript
class VideoCallWithNoiseSuppression {
  constructor() {
    this.processor = null;
    this.peerConnection = null;
  }

  async initialize() {
    // Inicializar procesador de ruido
    this.processor = new RealtimeNoiseSuppressionStream();
    await this.processor.initialize();

    // Crear conexión WebRTC
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
  }

  async startCall() {
    // Obtener audio limpio del micrófono
    const { stream: cleanAudioStream } = 
      await this.processor.processFromMicrophone();

    // Obtener video (sin procesar)
    const videoStream = await navigator.mediaDevices.getUserMedia({
      video: true
    });

    // Agregar tracks a WebRTC
    cleanAudioStream.getAudioTracks().forEach(track => {
      this.peerConnection.addTrack(track, cleanAudioStream);
    });

    videoStream.getVideoTracks().forEach(track => {
      this.peerConnection.addTrack(track, videoStream);
    });

    // ... resto de signaling (offer/answer/ICE)
  }

  async endCall() {
    this.peerConnection.close();
    this.processor.dispose();
  }
}
```

## 🔗 Referencias

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [DTLN-rs Repository](https://github.com/DataDog/dtln-rs)
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
