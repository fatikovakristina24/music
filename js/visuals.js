import { NOTE_MOTION, contourPoint } from "./note-motion.js?v=20261004-mobile1";

const INK = "#f3f3f0";
const SIGNAL = "#a9b2ff";
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
    this.noteLevels = Array(8).fill(0);
    this.mobileLayout = matchMedia("(max-width: 600px)");
    this.tabletLayout = matchMedia(
      "(min-width: 601px) and (max-width: 1100px)",
    );
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
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
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
    if (this.mode === "play") this.drawSynth(time, now);
    else this.drawVoice(time, sound);
    this.onFrame(now);
    requestAnimationFrame(this.frame);
  }
  fitStage(ctx, width, height, voice) {
    if (this.tabletLayout.matches) {
      const scale = voice
        ? Math.min((width - 48) / 812, (height - 96) / 245)
        : Math.min((width - 48) / 704, (height - 64) / 424);
      ctx.translate(
        width / 2 - (voice ? 476 : 468) * scale,
        height / 2 - (voice ? 280 : 214) * scale,
      );
      ctx.scale(scale, scale);
      return;
    }
    if (!this.mobileLayout.matches) {
      ctx.translate(0, voice ? 0 : (height - (440 * width) / 952) / 2);
      ctx.scale(width / 952, voice ? height / 560 : width / 952);
      return;
    }
    // Сохраняем пропорции контуров и поля вокруг подписей мобильного макета.
    const ratio = width / 374;
    const scale = voice ? 0.4 : 0.47;
    const baseHeight = voice ? 224 : 254;
    ctx.translate(
      (voice ? -3 : 22 - 116 * scale) * ratio,
      (height - baseHeight * ratio) / 2 +
        (voice ? 4.8 : 32 - 4 * scale) * ratio,
    );
    ctx.scale(scale * ratio, scale * ratio);
  }
  drawSynth(time, now) {
    const canvas = this.synthCanvas,
      ctx = canvas.getContext("2d");
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (!width) return;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    this.fitStage(ctx, width, height, false);
    const notes = [...this.engine.voices].filter(
      (v) => v.start <= now && v.end > now,
    );
    const targetLevels = Array(8).fill(0);
    for (const note of notes) {
      const envelope =
        now <= note.gateEnd
          ? 1
          : Math.exp(
              (-4.5 * (now - note.gateEnd)) /
                Math.max(0.04, note.end - note.gateEnd - 0.04),
            );
      targetLevels[note.index] = Math.max(targetLevels[note.index], envelope);
    }
    const volume = Math.min(1, this.energy * 7);
    for (let i = 0; i < this.noteLevels.length; i++) {
      this.noteLevels[i] +=
        (targetLevels[i] * volume - this.noteLevels[i]) * 0.14;
      if (this.noteLevels[i] < 0.001) this.noteLevels[i] = 0;
    }
    const total = this.noteLevels.reduce((sum, value) => sum + value, 0);
    const strength = Math.min(1, total);
    const color = [243, 243, 240].map((idle, channel) => {
      const mixed =
        this.noteLevels.reduce(
          (sum, level, i) => sum + level * NOTE_MOTION[i].color[channel],
          0,
        ) / Math.max(0.001, total);
      return Math.round(idle + (mixed - idle) * strength);
    });
    for (let line = 0; line < this.geometry.idle.length; line++) {
      const idle = this.geometry.idle[line];
      ctx.beginPath();
      for (let i = 0; i < idle.points.length; i += 2) {
        const [px, py] = contourPoint(
          idle.x + idle.points[i],
          idle.y + idle.points[i + 1],
          line,
          this.noteLevels,
          time,
          this.reducedMotion,
        );
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgb(${color.join(",")})`;
      ctx.globalAlpha = idle.opacity;
      ctx.lineWidth = idle.width;
      ctx.stroke();
    }
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
    this.fitStage(ctx, width, height, true);
    const active =
      ["recording", "playing"].includes(this.voice.state) || this.energy > 0.02;
    if (active || this.voice.buffer) {
      const traces = active
        ? this.geometry.voicePlaying
        : this.geometry.voiceRecorded;
      const effects = this.engine.effects;
      const pitch = (effects.pitch + (effects.child || 0) * 0.07) / 12;
      for (let line = 0; line < traces.length; line++) {
        const trace = traces[line];
        ctx.beginPath();
        for (let i = 0; i < trace.points.length; i += 2) {
          const x = trace.x + trace.points[i];
          const u = (x - 86) / 780;
          const envelope = Math.sin(Math.PI * u);
          const motion = active
            ? this.energy *
              12 *
              envelope *
              Math.sin(
                u * Math.PI * (7 + pitch * 3) +
                  time * (2 + sound.frequency * 20) +
                  line * 0.1,
              )
            : 0;
          const y = trace.y + trace.points[i + 1] + motion;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineWidth = trace.width;
        ctx.globalAlpha = trace.opacity;
        ctx.strokeStyle = active ? SIGNAL : INK;
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(86, 280);
      ctx.lineTo(866, 280);
      ctx.strokeStyle = INK;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
