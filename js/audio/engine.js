import {
  DEFAULT_EFFECTS,
  createEffectChain,
  effectTail,
  effectivePitch,
} from "./effects.js";
import {
  DEFAULT_LAYERS,
  PRESETS,
  createSynthChannel,
  synthEffectTail,
} from "./synth-channel.js?v=20261005-labels1";
import { shiftBuffer } from "./pitch-dsp.js";

export const NOTES = [
  { label: "До", key: "A", code: "KeyA", frequency: 261.625565 },
  { label: "Ре", key: "S", code: "KeyS", frequency: 293.664768 },
  { label: "Ми", key: "D", code: "KeyD", frequency: 329.627557 },
  { label: "Фа", key: "F", code: "KeyF", frequency: 349.228231 },
  { label: "Соль", key: "G", code: "KeyG", frequency: 391.995436 },
  { label: "Ля", key: "H", code: "KeyH", frequency: 440 },
  { label: "Си", key: "J", code: "KeyJ", frequency: 493.883301 },
  { label: "До", key: "K", code: "KeyK", frequency: 523.251131 },
];

export class AudioEngine {
  constructor() {
    this.context = null;
    this.synthSettings = { release: 1.8, volume: 65 };
    this.layers = DEFAULT_LAYERS.map((layer) => ({ ...layer }));
    this.effects = { ...DEFAULT_EFFECTS };
    this.voices = new Set();
    this.voiceLimit = 32;
    this.synthEnabled = true;
  }

  async ready() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext)
        throw new Error(
          "Этот браузер не поддерживает Web Audio. Открой сайт в актуальном Chrome или Safari.",
        );
      this.initialize(new AudioContext({ latencyHint: "interactive" }));
    }
    if (this.context.state !== "running") await this.context.resume();
    return this.context;
  }

  initialize(ctx) {
    this.context = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 18;
    limiter.ratio.value = 6;
    this.synthInput = ctx.createGain();
    this.synthVolume = ctx.createGain();
    this.synthVolume.gain.value = this.synthEnabled
      ? this.synthSettings.volume / 100
      : 0;
    this.synthInput.connect(this.synthVolume);
    this.channels = this.layers.map((settings, index) =>
      createSynthChannel(ctx, settings, this.synthInput, index),
    );
    this.synthVolume
      .connect(limiter)
      .connect(this.master)
      .connect(this.analyser)
      .connect(ctx.destination);
    this.voiceAnalyser = ctx.createAnalyser();
    this.voiceAnalyser.fftSize = 2048;
    this.voiceAnalyser.connect(this.master);
  }

  async worklets() {
    const context = await this.ready();
    if (!context.audioWorklet)
      throw new Error(
        "Для записи голоса открой сайт через localhost или HTTPS.",
      );
    this.workletPromise ??= context.audioWorklet.addModule(
      new URL("./worklets.js", import.meta.url),
    );
    try {
      await this.workletPromise;
    } catch (error) {
      this.workletPromise = null;
      throw error;
    }
    return context;
  }

  updateSynth(name, value) {
    this.synthSettings[name] = value;
    if (!this.context) return;
    if (name === "volume")
      this.synthVolume.gain.setTargetAtTime(
        this.synthEnabled ? value / 100 : 0,
        this.context.currentTime,
        0.02,
      );
  }

  updateLayer(index, name, value) {
    if (!this.layers[index]) return;
    this.layers[index][name] = value;
    this.channels?.[index].update(name, value);
  }

  setSynthEnabled(enabled) {
    this.synthEnabled = enabled;
    if (this.context)
      this.synthVolume.gain.setTargetAtTime(
        enabled ? this.synthSettings.volume / 100 : 0,
        this.context.currentTime,
        0.01,
      );
  }

  noteOn(
    index,
    when = this.context.currentTime,
    gateDuration = null,
    frequency = NOTES[index].frequency,
  ) {
    const ctx = this.context;
    if (this.voices.size >= this.voiceLimit) [...this.voices][0].kill();
    const settings = { ...this.synthSettings };
    const sources = this.layers.map((layer, channel) => {
      const preset = PRESETS[layer.preset];
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = 0.65;
      filter.frequency.value = preset.cutoff;
      const oscillator = ctx.createOscillator();
      oscillator.type = preset.type;
      oscillator.frequency.value = frequency * preset.octave;
      oscillator
        .connect(filter)
        .connect(gain)
        .connect(this.channels[channel].input);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(preset.gain, when + preset.attack);
      return { gain, filter, oscillator, preset };
    });
    const voice = {
      index,
      start: when,
      end: Infinity,
      gateEnd: Infinity,
      released: false,
      kill: () => {
        for (const { gain } of sources) {
          gain.gain.cancelScheduledValues(ctx.currentTime);
          gain.gain.setTargetAtTime(0, ctx.currentTime, 0.008);
        }
        voice.gateEnd = ctx.currentTime;
        voice.end = ctx.currentTime + 0.04;
        voice.released = true;
        for (const { oscillator } of sources) oscillator.stop(voice.end);
      },
      stop: (time = ctx.currentTime, release = settings.release) => {
        if (voice.released) return;
        time = Math.max(time, when + 0.04);
        voice.released = true;
        voice.gateEnd = time;
        for (const { gain, preset, oscillator } of sources) {
          if (gain.gain.cancelAndHoldAtTime)
            gain.gain.cancelAndHoldAtTime(time);
          else {
            gain.gain.cancelScheduledValues(time);
            gain.gain.setValueAtTime(
              preset.gain *
                Math.min(1, Math.max(0, time - when) / preset.attack),
              time,
            );
          }
          gain.gain.setTargetAtTime(0, time, Math.max(0.008, release / 4.5));
          oscillator.stop(time + release + 0.04);
        }
        voice.end = time + release + 0.04;
      },
    };
    let remaining = sources.length;
    for (const { oscillator, filter, gain } of sources) {
      oscillator.onended = () => {
        oscillator.disconnect();
        filter.disconnect();
        gain.disconnect();
        if (--remaining === 0) this.voices.delete(voice);
      };
      oscillator.start(when);
    }
    this.voices.add(voice);
    if (gateDuration !== null) voice.stop(when + Math.max(0.04, gateDuration));
    return voice;
  }

  stopAll() {
    if (!this.context) return;
    for (const voice of this.voices) voice.kill();
  }

  updateEffect(name, value) {
    this.effects[name] = value;
    this.voiceChain?.update(this.effects);
    if (["pitch", "child"].includes(name) && this.pitchNode)
      this.pitchNode.parameters
        .get("semitones")
        .setValueAtTime(effectivePitch(this.effects), this.context.currentTime);
  }

  resetEffects() {
    for (const [name, value] of Object.entries(DEFAULT_EFFECTS))
      this.updateEffect(name, value);
  }

  async playVoice(buffer, offset, onEnded) {
    const context = await this.worklets();
    this.stopVoice();
    this.pitchNode = new AudioWorkletNode(context, "contour-pitch", {
      outputChannelCount: [buffer.numberOfChannels],
      parameterData: { semitones: effectivePitch(this.effects) },
    });
    this.voiceChain = createEffectChain(
      context,
      this.effects,
      this.voiceAnalyser,
    );
    this.voiceSource = context.createBufferSource();
    this.voiceSource.buffer = buffer;
    this.voiceSource.connect(this.pitchNode).connect(this.voiceChain.input);
    const source = this.voiceSource;
    source.onended = () => {
      if (this.voiceSource === source) onEnded();
    };
    source.start(0, offset);
    return context.currentTime;
  }

  stopVoice() {
    if (this.voiceSource) {
      this.voiceSource.onended = null;
      try {
        this.voiceSource.stop();
      } catch {
        /* Источник уже остановлен. */
      }
      this.voiceSource.disconnect();
    }
    this.pitchNode?.disconnect();
    this.voiceChain?.dispose();
    this.voiceSource = this.pitchNode = this.voiceChain = null;
  }

  async exportMelody(notes, duration) {
    const settings = { ...this.synthSettings };
    const sampleRate = this.context?.sampleRate || 48000;
    const lastEnd = Math.max(
      duration,
      ...notes.map((n) => n.time + n.duration),
    );
    const tail =
      settings.release + 0.04 + Math.max(...this.layers.map(synthEffectTail));
    const OfflineContext =
      window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offline = new OfflineContext(
      2,
      Math.ceil((lastEnd + tail) * sampleRate),
      sampleRate,
    );
    const renderer = new AudioEngine();
    renderer.synthSettings = settings;
    renderer.layers = this.layers.map((layer) => ({ ...layer }));
    // Ноты планируются сразу на весь файл, а не только на ближайший момент.
    renderer.voiceLimit = Infinity;
    renderer.initialize(offline);
    for (const note of notes)
      renderer.noteOn(note.index, note.time, note.duration);
    return offline.startRendering();
  }

  async exportVoice(buffer) {
    const settings = { ...this.effects };
    const tail = effectTail(settings);
    const OfflineContext =
      window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offline = new OfflineContext(
      2,
      Math.ceil((buffer.duration + tail) * buffer.sampleRate),
      buffer.sampleRate,
    );
    const source = offline.createBufferSource();
    source.buffer = shiftBuffer(
      offline,
      buffer,
      effectivePitch(settings),
      Math.ceil(buffer.sampleRate * 0.09),
    );
    const volume = offline.createGain();
    volume.gain.value = 0.8;
    volume.connect(offline.destination);
    const chain = createEffectChain(offline, settings, volume, 0);
    source.connect(chain.input);
    source.start(0);
    const rendered = await offline.startRendering();
    chain.dispose();
    return rendered;
  }
}
