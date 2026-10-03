const INK = "#f3f3f0";
const SIGNAL = "#a9b2ff";
const BLUE = "#1f2bff";
const GRID = "#2a2b2e";

function drawSignalField(ctx, height, voice, energy, time) {
  ctx.save();
  ctx.strokeStyle = GRID;
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let x = 176; x <= 776; x += 100) {
    ctx.moveTo(x, 78);
    ctx.lineTo(x, height - 74);
  }
  for (let y = 100; y < height - 60; y += 60) {
    ctx.moveTo(84, y);
    ctx.lineTo(864, y);
  }
  ctx.stroke();
  ctx.strokeStyle = SIGNAL;
  ctx.globalAlpha = 0.36;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < 25; i++) {
    const y = 90 + (i * (height - 178)) / 24;
    const size = i % 4 === 0 ? 12 : 5;
    ctx.moveTo(28, y);
    ctx.lineTo(28 + size, y);
    ctx.moveTo(924 - size, y);
    ctx.lineTo(924, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 0.44;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [x, direction] of [
    [70, 1],
    [882, -1],
  ]) {
    for (const [y, vertical] of [
      [66, 1],
      [height - 66, -1],
    ]) {
      ctx.moveTo(x, y + vertical * 10);
      ctx.lineTo(x, y);
      ctx.lineTo(x + direction * 10, y);
    }
  }
  ctx.stroke();
  if (voice) {
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 0; i < 45; i++) {
      ctx.moveTo(90 + i * 17, 277);
      ctx.lineTo(90 + i * 17, 283);
    }
    ctx.stroke();
  } else {
    ctx.globalAlpha = 0.26 + energy * 0.24;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < 96; i++) {
      const angle = (i / 96) * Math.PI * 2;
      const end = 197 + (i % 8 === 0 ? 9 : 3);
      ctx.moveTo(476 + Math.cos(angle) * 197, 220 + Math.sin(angle) * 197);
      ctx.lineTo(476 + Math.cos(angle) * end, 220 + Math.sin(angle) * end);
    }
    ctx.stroke();
    const start = -0.6 + Math.sin(time * 0.5) * energy * 0.5;
    const end = start + 0.663 + energy * 0.2;
    ctx.strokeStyle = BLUE;
    ctx.globalAlpha = 0.4 + energy * 0.45;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(476, 220, 209, start, end);
    ctx.stroke();
    ctx.fillStyle = SIGNAL;
    ctx.globalAlpha = 0.45 + energy * 0.55;
    ctx.beginPath();
    ctx.arc(
      476 + Math.cos(end) * 209,
      220 + Math.sin(end) * 209,
      3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

function analyserState(analyser, storage) {
  if (!analyser) return { rms: 0, frequency: 0 };
  analyser.getFloatTimeDomainData(storage.wave);
  analyser.getByteFrequencyData(storage.spectrum);
  let power = 0,
    maximum = 0,
    dominant = 0;
  for (const sample of storage.wave) power += sample * sample;
  for (let i = 2; i < storage.spectrum.length; i++)
    if (storage.spectrum[i] > maximum) {
      maximum = storage.spectrum[i];
      dominant = i;
    }
  return {
    rms: Math.sqrt(power / storage.wave.length),
    frequency: dominant / storage.spectrum.length,
  };
}

export class SoundVisuals {
  constructor(engine, voice, geometry, onFrame) {
    this.engine = engine;
    this.voice = voice;
    this.geometry = geometry;
    this.onFrame = onFrame;
    this.synthCanvas = document.querySelector("#synth-canvas");
    this.voiceCanvas = document.querySelector("#voice-canvas");
    this.mode = "play";
    this.energy = 0;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.storage = {
      wave: new Float32Array(2048),
      spectrum: new Uint8Array(1024),
    };
    this.voiceStorage = {
      wave: new Float32Array(2048),
      spectrum: new Uint8Array(1024),
    };
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.synthCanvas);
    this.observer.observe(this.voiceCanvas);
    this.resize();
    this.frame = this.frame.bind(this);
    this.frame();
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const canvas of [this.synthCanvas, this.voiceCanvas]) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) continue;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  frame() {
    const now = this.engine.context?.currentTime || 0;
    const analyser =
      this.mode === "voice"
        ? this.voice.state === "recording"
          ? this.voice.micAnalyser
          : this.engine.voiceAnalyser
        : this.engine.analyser;
    const storage = this.mode === "voice" ? this.voiceStorage : this.storage;
    const sound = analyserState(analyser, storage);
    this.energy += (Math.min(1, sound.rms * 7) - this.energy) * 0.14;
    const time = this.reducedMotion ? 0 : performance.now() / 1000;
    if (this.mode === "play") this.drawSynth(time, now, sound);
    else this.drawVoice(time, sound);
    this.onFrame(now);
    requestAnimationFrame(this.frame);
  }
  drawSynth(time, now, sound) {
    const canvas = this.synthCanvas,
      ctx = canvas.getContext("2d");
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (!width) return;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.scale(width / 952, height / 440);
    drawSignalField(ctx, 440, false, this.energy, time);
    const notes = [...this.engine.voices].filter(
      (v) => v.start <= now && v.end > now,
    );
    const average = notes.length
      ? notes.reduce((sum, v) => sum + v.index, 0) / notes.length
      : 3;
    const motion = this.energy * (this.reducedMotion ? 4 : 24);
    for (let line = 0; line < this.geometry.length; line++) {
      const contour = this.geometry[line];
      const points = contour.points;
      const curve = [];
      for (let i = 0; i < points.length; i += 2) {
        const x = 116 + contour.x + points[i],
          y = 4 + contour.y + points[i + 1];
        const angle = Math.atan2((y - 212) * 1.4, x - 468);
        const modulation =
          motion *
          Math.sin(
            angle * (2 + average / 3) +
              time * (1.1 + sound.frequency * 12) +
              line * 0.13,
          );
        const px = x + Math.cos(angle) * modulation;
        const py = y + Math.sin(angle) * modulation;
        curve.push([px, py]);
      }
      ctx.beginPath();
      const first = curve[0],
        last = curve[curve.length - 1];
      ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
      for (let i = 0; i < curve.length; i++) {
        const point = curve[i],
          next = curve[(i + 1) % curve.length];
        ctx.quadraticCurveTo(
          point[0],
          point[1],
          (point[0] + next[0]) / 2,
          (point[1] + next[1]) / 2,
        );
      }
      ctx.closePath();
      ctx.strokeStyle = this.energy > 0.025 ? SIGNAL : INK;
      ctx.globalAlpha = 0.42 + (line / this.geometry.length) * 0.5;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = this.energy > 0.025 ? SIGNAL : INK;
    ctx.beginPath();
    ctx.moveTo(464, 214);
    ctx.lineTo(472, 214);
    ctx.moveTo(468, 210);
    ctx.lineTo(468, 218);
    ctx.stroke();
    ctx.restore();
  }
  drawVoice(time, sound) {
    const canvas = this.voiceCanvas,
      ctx = canvas.getContext("2d");
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (!width) return;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.scale(width / 952, height / 560);
    drawSignalField(ctx, 560, true, this.energy, time);
    if (
      ["recording", "playing"].includes(this.voice.state) ||
      this.energy > 0.02
    ) {
      ctx.strokeStyle = SIGNAL;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let bar = 0; bar < 12; bar++) {
        let level = 0;
        for (let bin = bar * 8; bin < (bar + 1) * 8; bin++)
          level = Math.max(level, this.voiceStorage.spectrum[bin]);
        const barHeight = (level / 255) * 34;
        ctx.moveTo(844 + bar * 6, 114 - barHeight);
        ctx.lineTo(844 + bar * 6, 114);
      }
      ctx.stroke();
    }
    ctx.restore();
    const active =
      ["recording", "playing"].includes(this.voice.state) || this.energy > 0.02;
    const hasBuffer = !!this.voice.buffer;
    const amplitude = active ? 14 + this.energy * 118 : hasBuffer ? 45 : 12;
    const effects = this.engine.effects;
    const pitch = (effects.pitch + (effects.child || 0) * 0.07) / 12;
    const phase = active ? time * (1.8 + sound.frequency * 22) : 0;
    const from = width * 0.09,
      to = width * 0.91,
      middle = height * 0.48;
    for (let line = 0; line < 19; line++) {
      ctx.beginPath();
      for (let i = 0; i <= 180; i++) {
        const u = i / 180,
          envelope = Math.sin(Math.PI * u) ** 1.4;
        const primary = Math.sin(
          u * Math.PI * (5.2 + pitch * 1.5) + phase + line * 0.085,
        );
        const harmonic =
          Math.sin(u * Math.PI * 11 - phase * 0.65 + line * 0.04) *
          (0.32 + effects.robot / 300);
        const distortion = (Math.sin(primary * 4) * effects.distortion) / 400;
        const depth = 0.32 + line / 28;
        const y =
          middle +
          envelope * (primary + harmonic + distortion) * amplitude * depth;
        const x = from + u * (to - from);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.32 + line / 27;
      ctx.strokeStyle = active ? SIGNAL : INK;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
