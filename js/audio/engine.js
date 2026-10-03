import { DEFAULT_EFFECTS, createEffectChain, effectTail, effectivePitch } from './effects.js';
import { shiftBuffer } from './pitch-dsp.js';

export const NOTES = [
  { label:'До', key:'A', code:'KeyA', frequency:261.625565 },
  { label:'Ре', key:'S', code:'KeyS', frequency:293.664768 },
  { label:'Ми', key:'D', code:'KeyD', frequency:329.627557 },
  { label:'Фа', key:'F', code:'KeyF', frequency:349.228231 },
  { label:'Соль', key:'G', code:'KeyG', frequency:391.995436 },
  { label:'Ля', key:'H', code:'KeyH', frequency:440 },
  { label:'Си', key:'J', code:'KeyJ', frequency:493.883301 },
  { label:'До', key:'K', code:'KeyK', frequency:523.251131 },
];

export class AudioEngine {
  constructor() {
    this.context = null;
    this.synthSettings = { preset:'soft', release:1.8, echo:24, volume:65 };
    this.effects = { ...DEFAULT_EFFECTS };
    this.voices = new Set();
    this.synthEnabled = true;
  }

  async ready() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Этот браузер не поддерживает Web Audio. Открой сайт в актуальном Chrome или Safari.');
      this.context = new AudioContext({ latencyHint:'interactive' });
      const ctx = this.context;
      this.master = ctx.createGain(); this.master.gain.value = .8;
      this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = .8;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12; limiter.knee.value = 18; limiter.ratio.value = 6;
      this.synthInput = ctx.createGain();
      this.synthVolume = ctx.createGain(); this.synthVolume.gain.value = this.synthEnabled ? this.synthSettings.volume / 100 : 0;
      const echo = ctx.createDelay(); echo.delayTime.value = .32;
      const feedback = ctx.createGain(); feedback.gain.value = .32;
      this.echoWet = ctx.createGain(); this.echoWet.gain.value = this.synthSettings.echo / 100;
      this.synthInput.connect(this.synthVolume);
      this.synthInput.connect(echo); echo.connect(feedback).connect(echo);
      echo.connect(this.echoWet).connect(this.synthVolume);
      this.synthVolume.connect(limiter).connect(this.master).connect(this.analyser).connect(ctx.destination);
      this.voiceAnalyser = ctx.createAnalyser(); this.voiceAnalyser.fftSize = 2048;
      this.voiceAnalyser.connect(this.master);
    }
    if (this.context.state !== 'running') await this.context.resume();
    return this.context;
  }

  async worklets() {
    const context = await this.ready();
    if (!context.audioWorklet) throw new Error('Для записи голоса открой сайт через localhost или HTTPS. Инструкция запуска есть в README.');
    this.workletPromise ??= context.audioWorklet.addModule(new URL('./worklets.js', import.meta.url));
    try { await this.workletPromise; } catch (error) { this.workletPromise = null; throw error; }
    return context;
  }

  updateSynth(name, value) {
    this.synthSettings[name] = value;
    if (!this.context) return;
    if (name === 'volume') this.synthVolume.gain.setTargetAtTime(this.synthEnabled ? value / 100 : 0, this.context.currentTime, .02);
    if (name === 'echo') this.echoWet.gain.setTargetAtTime(value / 100, this.context.currentTime, .02);
  }

  setSynthEnabled(enabled) {
    this.synthEnabled = enabled;
    if (this.context) this.synthVolume.gain.setTargetAtTime(enabled ? this.synthSettings.volume / 100 : 0, this.context.currentTime, .01);
  }

  noteOn(index, when = this.context.currentTime, gateDuration = null) {
    const ctx = this.context;
    if (this.voices.size >= 32) [...this.voices][0].kill();
    const settings = { ...this.synthSettings };
    const gain = ctx.createGain(); gain.gain.value = 0;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = .65;
    const presets = {
      soft:{ type:'sine', octave:1, cutoff:2400, attack:.035, gain:.2 },
      bass:{ type:'triangle', octave:.5, cutoff:950, attack:.015, gain:.23 },
      bright:{ type:'sawtooth', octave:1, cutoff:4000, attack:.012, gain:.13 },
    };
    const preset = presets[settings.preset];
    filter.frequency.value = preset.cutoff;
    const oscillator = ctx.createOscillator(); oscillator.type = preset.type;
    oscillator.frequency.value = NOTES[index].frequency * preset.octave;
    oscillator.connect(filter).connect(gain).connect(this.synthInput);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(preset.gain, when + preset.attack);
    const voice = {
      index, start:when, release:settings.release, end:Infinity, gateEnd:Infinity, released:false,
      kill:() => {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setTargetAtTime(0, ctx.currentTime, .008);
        voice.gateEnd = ctx.currentTime;
        voice.end = ctx.currentTime + .04;
        voice.released = true;
        oscillator.stop(voice.end);
      },
      stop:(time = ctx.currentTime, release = settings.release) => {
        if (voice.released) return;
        time = Math.max(time, when + .04);
        voice.released = true;
        voice.gateEnd = time;
        // cancelAndHold preserves the current envelope even for fast clicks.
        if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(time);
        else {
          gain.gain.cancelScheduledValues(time);
          gain.gain.setValueAtTime(preset.gain * Math.min(1, Math.max(0, time - when) / preset.attack), time);
        }
        gain.gain.setTargetAtTime(0, time, Math.max(.008, release / 4.5));
        voice.end = time + release + .04;
        oscillator.stop(voice.end);
      },
    };
    oscillator.onended = () => { this.voices.delete(voice); oscillator.disconnect(); filter.disconnect(); gain.disconnect(); };
    this.voices.add(voice);
    oscillator.start(when);
    if (gateDuration !== null) voice.stop(when + Math.max(.04, gateDuration));
    return voice;
  }

  stopAll() {
    if (!this.context) return;
    for (const voice of this.voices) voice.kill();
  }

  updateEffect(name, value) {
    this.effects[name] = value;
    this.voiceChain?.update(this.effects);
    if (['pitch','child'].includes(name) && this.pitchNode) this.pitchNode.parameters.get('semitones').setValueAtTime(effectivePitch(this.effects), this.context.currentTime);
  }

  resetEffects() { for (const [name, value] of Object.entries(DEFAULT_EFFECTS)) this.updateEffect(name, value); }

  async playVoice(buffer, offset, onEnded) {
    const context = await this.worklets();
    this.stopVoice();
    this.pitchNode = new AudioWorkletNode(context, 'contour-pitch', { outputChannelCount:[buffer.numberOfChannels], parameterData:{ semitones:effectivePitch(this.effects) } });
    this.voiceChain = createEffectChain(context, this.effects, this.voiceAnalyser);
    this.voiceSource = context.createBufferSource(); this.voiceSource.buffer = buffer;
    this.voiceSource.connect(this.pitchNode).connect(this.voiceChain.input);
    const source = this.voiceSource;
    source.onended = () => { if (this.voiceSource === source) onEnded(); };
    source.start(0, offset);
    return context.currentTime;
  }

  stopVoice() {
    if (this.voiceSource) { this.voiceSource.onended = null; try { this.voiceSource.stop(); } catch { /* Already ended. */ } this.voiceSource.disconnect(); }
    this.pitchNode?.disconnect(); this.voiceChain?.dispose();
    this.voiceSource = this.pitchNode = this.voiceChain = null;
  }

  async exportVoice(buffer) {
    const settings = { ...this.effects };
    const tail = effectTail(settings);
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offline = new OfflineContext(2, Math.ceil((buffer.duration + tail) * buffer.sampleRate), buffer.sampleRate);
    const source = offline.createBufferSource();
    source.buffer = shiftBuffer(offline, buffer, effectivePitch(settings), Math.ceil(buffer.sampleRate * .09));
    const volume = offline.createGain(); volume.gain.value = .8; volume.connect(offline.destination);
    const chain = createEffectChain(offline, settings, volume, 0);
    source.connect(chain.input); source.start(0);
    const rendered = await offline.startRendering(); chain.dispose();
    return rendered;
  }
}
