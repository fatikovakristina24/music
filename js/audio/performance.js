import { BEAT, DURATION, NOTES, PARTS, BASS, MELODY } from "../score.js";

function impulse(context) {
  const buffer = context.createBuffer(
    2,
    context.sampleRate * 1.3,
    context.sampleRate,
  );
  let seed = 42;
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 2147483648 - 1) * (1 - i / data.length) ** 3;
    }
  }
  return buffer;
}

export function createGraph(context) {
  const sum = context.createGain(),
    fade = context.createGain();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 12;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  const master = context.createGain();
  master.gain.value = 0.8;
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  sum
    .connect(fade)
    .connect(limiter)
    .connect(master)
    .connect(analyser)
    .connect(context.destination);
  const channels = [0, 1, 2].map((i) => {
    const input = context.createGain(),
      filter = context.createBiquadFilter(),
      level = context.createGain();
    filter.type = "lowpass";
    filter.frequency.value = [1600, 650, 14000][i];
    level.gain.value = i === 0 ? 0.7 : 0;
    const meter = context.createAnalyser();
    meter.fftSize = 512;
    input.connect(filter).connect(level).connect(meter).connect(sum);
    if (i === 0) {
      const echo = context.createDelay();
      echo.delayTime.value = BEAT * 0.75;
      const feedback = context.createGain();
      feedback.gain.value = 0.2;
      const wet = context.createGain();
      wet.gain.value = 0.12;
      filter.connect(echo);
      echo.connect(feedback).connect(echo);
      echo.connect(wet).connect(level);
      const room = context.createConvolver();
      room.buffer = impulse(context);
      const roomLevel = context.createGain();
      roomLevel.gain.value = 0.18;
      filter.connect(room).connect(roomLevel).connect(level);
    }
    return { input, filter, level, meter };
  });
  const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = noise.getChannelData(0);
  let seed = 123;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    samples[i] = seed / 2147483648 - 1;
  }
  const sources = new Set();
  function tone(
    frequency,
    time,
    duration,
    channel,
    type = "sine",
    velocity = 0.2,
  ) {
    const oscillator = context.createOscillator(),
      envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(
      velocity,
      time + (channel ? 0.012 : 0.06),
    );
    envelope.gain.setValueAtTime(velocity * 0.72, time + duration);
    envelope.gain.exponentialRampToValueAtTime(0.00001, time + duration + 0.25);
    oscillator.connect(envelope).connect(channels[channel].input);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.27);
    const voice = {
      source: oscillator,
      envelope,
      end: time + duration + 0.25,
      channel,
    };
    sources.add(voice);
    oscillator.onended = () => {
      sources.delete(voice);
      oscillator.disconnect();
      envelope.disconnect();
    };
    return () => {
      const now = context.currentTime;
      envelope.gain.cancelAndHoldAtTime(now);
      envelope.gain.exponentialRampToValueAtTime(0.00001, now + 0.08);
      oscillator.stop(now + 0.1);
      voice.end = now + 0.08;
    };
  }
  function drum(kind, time, strength = 1) {
    const envelope = context.createGain();
    envelope.connect(channels[2].input);
    const source =
      kind === 0 ? context.createOscillator() : context.createBufferSource();
    if (kind === 0) {
      source.frequency.setValueAtTime(135, time);
      source.frequency.exponentialRampToValueAtTime(42, time + 0.14);
      source.connect(envelope);
    } else {
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = kind === 1 ? "bandpass" : "highpass";
      filter.frequency.value = kind === 1 ? 1800 : 7500;
      filter.Q.value = 0.7;
      source.connect(filter).connect(envelope);
      source.onended = () => filter.disconnect();
    }
    const duration = [0.25, 0.14, 0.045][kind];
    envelope.gain.setValueAtTime([0.48, 0.23, 0.085][kind] * strength, time);
    envelope.gain.exponentialRampToValueAtTime(0.00001, time + duration);
    source.start(time);
    source.stop(time + duration + 0.02);
    const voice = { source, envelope, end: time + duration, channel: 2 };
    sources.add(voice);
    const ended = source.onended;
    source.onended = () => {
      ended?.();
      sources.delete(voice);
      source.disconnect();
      envelope.disconnect();
    };
  }
  function control(index, value, time = context.currentTime) {
    const parameter =
      index < 2 ? channels[index + 1].level.gain : channels[0].filter.frequency;
    const target =
      index < 2 ? value / 100 : 350 * (16000 / 350) ** (value / 100);
    parameter.setTargetAtTime(target, time, 0.035);
  }
  function step(index, time, finalBar = false) {
    const slot = index % 8,
      bar = Math.floor(index / 8);
    const note = finalBar ? (slot === 0 ? 0 : null) : MELODY[slot];
    if (note !== null) {
      tone(
        NOTES[note].frequency,
        time,
        BEAT * (finalBar ? 3.4 : slot === 3 ? 0.38 : 0.8),
        0,
      );
      tone(NOTES[note].frequency, time, BEAT * 0.6, 0, "triangle", 0.035);
    }
    if ([0, 3, 4, 7].includes(slot))
      tone(
        BASS[Math.floor(bar / 2) % 4],
        time,
        BEAT * 0.4,
        1,
        "triangle",
        0.27,
      );
    if (slot % 2 === 0) drum(0, time);
    if (slot === 2 || slot === 6) drum(1, time);
    if (slot % 2 === 1) drum(2, time, slot === 7 ? 0.8 : 1);
    return note;
  }
  function silence() {
    for (const voice of sources) {
      try {
        voice.source.stop();
      } catch {}
    }
    sources.clear();
  }
  return {
    context,
    channels,
    master,
    analyser,
    fade,
    sources,
    tone,
    control,
    step,
    silence,
  };
}

export class Performance extends EventTarget {
  constructor({ duration = DURATION } = {}) {
    super();
    this.duration = duration;
    this.state = "idle";
    this.phase = 0;
    this.values = [...PARTS[0].values];
    this.offset = 0;
    this.pending = null;
    this.notes = [];
    this.recording = null;
    this.chunks = [];
    this.buffer = null;
  }
  changed() {
    this.dispatchEvent(new Event("change"));
  }
  get elapsed() {
    return this.state === "running"
      ? Math.min(
          this.duration,
          Math.max(0, this.context.currentTime - this.started),
        )
      : this.offset;
  }
  async ready() {
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio)
        throw new Error(
          "Браузер не поддерживает звук. Открой сайт в Chrome или Safari.",
        );
      this.context = new Audio({ latencyHint: "interactive" });
      this.graph = createGraph(this.context);
    }
    if (this.context.state !== "running") await this.context.resume();
  }
  async start(demo = false) {
    if (!["idle", "finished"].includes(this.state) || this.starting) return;
    this.starting = true;
    try {
      await this.ready();
      if (!this.context.audioWorklet)
        throw new Error(
          "Для записи открой сайт через localhost или HTTPS в современном браузере.",
        );
      this.moduleReady ??= this.context.audioWorklet
        .addModule(new URL("./recorder-worklet.js", import.meta.url))
        .catch((error) => {
          this.moduleReady = null;
          throw error;
        });
      await this.moduleReady;
      this.graph.silence();
      this.graph.fade.gain.cancelScheduledValues(this.context.currentTime);
      this.graph.fade.gain.value = 1;
      this.buffer = null;
      this.chunks = [];
      this.demo = demo;
      this.phase = 0;
      this.offset = 0;
      this.values = [...PARTS[0].values];
      this.values.forEach((v, i) => this.graph.control(i, v));
      this.started = this.context.currentTime + 0.08;
      this.nextStep = 0;
      this.pending = null;
      this.notes = [];
      this.fading = false;
      this.graph.fade.gain.setValueAtTime(
        1,
        this.started + this.duration - 0.15,
      );
      this.graph.fade.gain.linearRampToValueAtTime(
        0,
        this.started + this.duration,
      );
      const capture = new AudioWorkletNode(this.context, "spletenie-capture", {
        outputChannelCount: [1],
        processorOptions: {
          start: this.started,
          end: this.started + this.duration,
        },
      });
      this.recording = capture;
      this.captured = new Promise((resolve) => {
        this.resolveCapture = resolve;
      });
      capture.port.onmessage = ({ data }) => {
        if (data.left) this.chunks.push(data);
        if (data.done) this.finishCapture();
      };
      capture.onprocessorerror = () => {
        this.dispatchEvent(
          new CustomEvent("failure", {
            detail: "Запись прервалась. Попробуй начать исполнение заново.",
          }),
        );
        this.finishCapture();
      };
      this.graph.master.connect(capture);
      capture.connect(this.context.destination);
      this.state = "running";
      this.timer = setInterval(() => this.pump(), 25);
      this.pump();
      this.changed();
    } finally {
      this.starting = false;
    }
  }
  setValue(index, value) {
    this.values[index] = Math.max(0, Math.min(100, Number(value)));
    if (this.graph) this.graph.control(index, this.values[index]);
    this.changed();
  }
  arm(index) {
    if (this.state !== "running" || index !== this.phase + 1 || index > 3)
      return;
    const nominal = (index * this.duration) / 4;
    const boundary =
      nominal > this.elapsed + 0.12
        ? nominal
        : Math.ceil((this.elapsed + 0.12) / (BEAT * 4)) * BEAT * 4;
    this.pending = { index, at: Math.min(boundary, this.duration) };
    this.changed();
  }
  pump() {
    if (this.state !== "running") return;
    const now = this.elapsed;
    const targetPhase = this.demo
      ? Math.min(3, Math.floor(now / (this.duration / 4)))
      : this.pending && now >= this.pending.at
        ? this.pending.index
        : this.phase;
    if (targetPhase !== this.phase) {
      this.phase = targetPhase;
      this.pending = null;
      this.values = [...PARTS[this.phase].values];
      this.values.forEach((v, i) => this.graph.control(i, v));
      this.changed();
    }
    if (this.demo && now >= this.duration - Math.min(8, this.duration / 8)) {
      if (!this.fading) {
        const parameter = this.graph.fade.gain;
        parameter.cancelScheduledValues(this.context.currentTime);
        parameter.setValueAtTime(parameter.value, this.context.currentTime);
        parameter.linearRampToValueAtTime(0, this.started + this.duration);
        this.fading = true;
      }
      const remaining = Math.max(
        0,
        (this.duration - now) / Math.min(8, this.duration / 8),
      );
      this.values[0] = Math.round(78 * remaining);
      this.values[1] = Math.round(100 * remaining);
      this.graph.control(0, this.values[0]);
      this.graph.control(1, this.values[1]);
    }
    while (
      (this.nextStep * BEAT) / 2 < now + 0.12 &&
      (this.nextStep * BEAT) / 2 < this.duration - 0.15
    ) {
      const second = (this.nextStep * BEAT) / 2,
        when = this.started + second;
      if (when >= this.context.currentTime - 0.02) {
        const note = this.graph.step(
          this.nextStep,
          Math.max(when, this.context.currentTime),
          second >= this.duration - BEAT * 4,
        );
        if (note !== null)
          this.notes.push({
            index: note,
            start: second,
            end:
              second + BEAT * (second >= this.duration - BEAT * 4 ? 3.4 : 0.8),
          });
      }
      this.nextStep++;
    }
    this.notes = this.notes.filter((note) => note.end > now - 0.1);
    if (now >= this.duration) {
      this.graph.silence();
      this.offset = this.duration;
      this.state = "finishing";
      clearInterval(this.timer);
      this.changed();
    }
  }
  async pause() {
    if (this.state !== "running") return;
    this.offset = this.elapsed;
    this.state = "paused";
    clearInterval(this.timer);
    await this.context.suspend();
    this.changed();
  }
  async resume() {
    if (this.state !== "paused") return;
    await this.context.resume();
    this.state = "running";
    this.timer = setInterval(() => this.pump(), 25);
    this.pump();
    this.changed();
  }
  async finish() {
    if (!["running", "paused"].includes(this.state)) return;
    if (this.state === "paused") await this.context.resume();
    this.offset = this.elapsed;
    this.state = "finishing";
    clearInterval(this.timer);
    const now = this.context.currentTime;
    this.graph.fade.gain.cancelAndHoldAtTime(now);
    this.graph.fade.gain.linearRampToValueAtTime(0, now + 0.8);
    this.recording.port.postMessage({
      end: Math.min(this.started + this.duration, now + 0.9),
    });
    this.changed();
  }
  finishCapture() {
    if (!this.recording) return;
    const count = this.chunks.reduce(
      (sum, chunk) => sum + chunk.left.length,
      0,
    );
    if (count) {
      this.buffer = this.context.createBuffer(
        2,
        count,
        this.context.sampleRate,
      );
      let offset = 0;
      for (const chunk of this.chunks) {
        this.buffer.getChannelData(0).set(chunk.left, offset);
        this.buffer.getChannelData(1).set(chunk.right, offset);
        offset += chunk.left.length;
      }
    }
    this.graph.master.disconnect(this.recording);
    this.recording.disconnect();
    this.recording = null;
    this.chunks = [];
    this.graph.silence();
    clearInterval(this.timer);
    this.state = "finished";
    this.resolveCapture?.(this.buffer);
    this.changed();
  }
  async live(index) {
    await this.ready();
    const now = this.context.currentTime;
    const release = this.graph.tone(NOTES[index].frequency, now, 1.4, 0);
    return { release, until: now + 1.65 };
  }
}
