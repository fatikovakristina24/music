import { encodeWav } from './audio/wav.js';
import { effectTail } from './audio/effects.js';

export class VoiceRecorder extends EventTarget {
  constructor(engine) {
    super(); this.engine = engine; this.state = 'empty'; this.buffer = null;
    this.offset = 0; this.generation = 0; this.exporting = false;
  }
  changed() { this.dispatchEvent(new Event('change')); }
  get elapsed() {
    if (this.state === 'recording') return Math.min(20, Math.max(0, this.engine.context.currentTime - this.started));
    if (this.state === 'playing') return Math.min(this.buffer.duration, this.offset + this.engine.context.currentTime - this.playStarted);
    return this.offset;
  }
  async record() {
    if (this.state === 'recording') { this.stopRecording(); return; }
    if (['requesting','processing','loading'].includes(this.state)) return;
    this.pause();
    const generation = ++this.generation;
    this.state = 'requesting'; this.changed();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Микрофон доступен через localhost или HTTPS. Запусти сайт по инструкции в README.');
      const context = await this.engine.worklets();
      const stream = await navigator.mediaDevices.getUserMedia({ audio:{ channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true } });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream; this.chunks = [];
      this.mic = context.createMediaStreamSource(stream);
      this.micAnalyser = context.createAnalyser(); this.micAnalyser.fftSize = 2048;
      this.capture = new AudioWorkletNode(context, 'contour-capture', { outputChannelCount:[1], processorOptions:{ maxSeconds:20 } });
      this.capture.port.onmessage = ({ data }) => {
        if (data.type === 'chunk') this.chunks.push(data.samples);
        if (data.type === 'done') this.finishRecording(data.samples);
      };
      this.capture.onprocessorerror = () => { this.cleanupMicrophone(); this.state = this.buffer ? 'ready' : 'empty'; this.changed(); this.dispatchEvent(new CustomEvent('error', { detail:new Error('Запись прервалась. Попробуй записать фразу ещё раз.') })); };
      this.mic.connect(this.micAnalyser); this.mic.connect(this.capture).connect(context.destination);
      stream.getAudioTracks()[0].onended = () => this.stopRecording();
      this.started = context.currentTime; this.state = 'recording'; this.changed();
      // A backup stop also covers a suspended/interrupted audio context.
      this.limitTimer = setTimeout(() => this.stopRecording(), 20100);
    } catch (error) {
      if (generation !== this.generation) return;
      this.cleanupMicrophone(); this.state = this.buffer ? 'ready' : 'empty'; this.changed();
      throw error;
    }
  }
  stopRecording() {
    if (this.state !== 'recording') return;
    this.state = 'processing'; this.capture.port.postMessage('stop'); this.changed();
  }
  finishRecording(sampleCount) {
    if (!['recording','processing'].includes(this.state)) return;
    const context = this.engine.context;
    const length = Math.min(sampleCount, context.sampleRate * 20);
    if (length > 0) {
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0); let offset = 0;
      for (const chunk of this.chunks) {
        const count = Math.min(chunk.length, length - offset);
        if (count <= 0) break;
        data.set(chunk.subarray(0, count), offset); offset += count;
      }
      this.buffer = buffer; this.engine.resetEffects(); this.offset = 0;
    }
    this.cleanupMicrophone(); this.state = this.buffer ? 'ready' : 'empty'; this.changed();
  }
  cleanupMicrophone() {
    clearTimeout(this.limitTimer);
    if (this.stream) for (const track of this.stream.getTracks()) { track.onended = null; track.stop(); }
    this.mic?.disconnect(); this.capture?.disconnect(); this.micAnalyser?.disconnect();
    this.stream = this.capture = this.mic = this.micAnalyser = null; this.chunks = [];
  }
  async play() {
    if (!this.buffer || ['requesting','recording','processing','loading'].includes(this.state)) return;
    if (this.state === 'playing') { this.pause(); return; }
    clearTimeout(this.tailTimer);
    const generation = ++this.generation;
    this.state = 'loading'; this.changed();
    if (this.offset >= this.buffer.duration - .02) this.offset = 0;
    try {
      this.playStarted = await this.engine.playVoice(this.buffer, this.offset, () => {
        this.offset = 0; this.state = 'ready'; this.changed();
        this.tailTimer = setTimeout(() => this.engine.stopVoice(), (effectTail(this.engine.effects) + .15) * 1000);
      });
      if (generation !== this.generation) { this.engine.stopVoice(); return; }
      this.state = 'playing'; this.changed();
    } catch (error) { this.state = 'ready'; this.changed(); throw error; }
  }
  pause() {
    clearTimeout(this.tailTimer);
    if (this.state === 'playing') this.offset = this.elapsed;
    if (['playing','loading'].includes(this.state)) { this.generation++; this.state = 'paused'; }
    this.engine.stopVoice(); this.changed();
  }
  leave() {
    if (this.state === 'recording') this.stopRecording();
    else if (this.state === 'requesting') { this.generation++; this.state = this.buffer ? 'ready' : 'empty'; this.changed(); }
    else this.pause();
  }
  delete() {
    this.pause(); this.generation++; this.buffer = null; this.offset = 0;
    this.engine.resetEffects(); this.state = 'empty'; this.changed();
  }
  async download() {
    if (!this.buffer || this.exporting) return;
    this.exporting = true; this.changed();
    try {
      const rendered = await this.engine.exportVoice(this.buffer);
      const url = URL.createObjectURL(encodeWav(rendered));
      const link = document.createElement('a');
      link.href = url; link.download = 'kontur-voice.wav'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally { this.exporting = false; this.changed(); }
  }
}
