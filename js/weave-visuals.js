/** Живые нити используют амплитуду каждого аудиоканала и текущие ноты. */
export class WeaveVisuals {
  constructor(engine, composition, pads, onFrame) {
    this.engine = engine;
    this.composition = composition;
    this.pads = pads;
    this.canvas = document.querySelector("#weave-canvas");
    this.onFrame = onFrame;
    this.levels = [0, 0, 0];
    this.samples = new Float32Array(256);
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.canvas);
    this.resize();
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width) return;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  tick(time) {
    const now = this.engine.context?.currentTime || 0;
    const sounding = [...this.engine.voices].filter(
      (v) => v.start <= now && v.gateEnd > now,
    );
    this.pads.forEach((pad, index) => {
      const active = sounding.some((v) => v.channel === 0 && v.index === index);
      pad.classList.toggle("pressed", active);
      pad.setAttribute("aria-pressed", String(active));
    });
    for (let i = 0; i < 3; i++) {
      const analyser = this.engine.channels?.[i].analyser;
      let energy = 0;
      if (analyser) {
        analyser.getFloatTimeDomainData(this.samples);
        energy = Math.sqrt(
          this.samples.reduce((a, b) => a + b * b, 0) / this.samples.length,
        );
      }
      this.levels[i] += (Math.min(1, energy * 10) - this.levels[i]) * 0.18;
    }
    const ctx = this.canvas.getContext("2d"),
      w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const current = sounding.find((v) => v.channel === 0)?.index ?? 0;
    const available = [
      !!this.composition.notes.length || sounding.some((v) => v.channel === 0),
      !!this.composition.bass || this.composition.kind === "preview",
      this.composition.hasDrums,
    ];
    const t = this.reduced ? 0 : time / 1000;
    const point = (x, i) => {
      const phase = (x / w) * Math.PI * 6;
      const level = this.levels[i];
      const base =
        Math.sin(phase + (i === 1 ? Math.PI : i === 2 ? 0.7 : 0)) *
        (i === 2 ? 10 : 37);
      const vibration = this.reduced
        ? 0
        : Math.sin(phase * (2 + current * 0.8 + i) - t * (3 + i)) *
          level *
          (14 + current * 2);
      return h / 2 + base + vibration;
    };
    for (let i = 1; i >= 0; i--) this.line(ctx, w, point, i, available[i], 0);
    this.line(ctx, w, point, 2, available[2], 0);
    if (this.composition.kind) {
      const x = (this.composition.playhead / this.composition.length) * w;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#a9b2ff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      for (let i = 0; i < 3; i++)
        if (this.levels[i] > 0.02) {
          ctx.globalAlpha = 0.12 + this.levels[i] * 0.25;
          ctx.fillStyle = "#a9b2ff";
          ctx.beginPath();
          ctx.arc(x, point(x, i), 10 + this.levels[i] * 24, 0, Math.PI * 2);
          ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
    this.onFrame(now, sounding);
    requestAnimationFrame(this.tick);
  }
  line(ctx, width, point, i, available) {
    const level = this.levels[i];
    ctx.strokeStyle = i === 2 ? "#f3f3f0" : "#a9b2ff";
    ctx.globalAlpha = available ? (i === 1 ? 0.42 + level * 0.3 : 0.95) : 0.08;
    ctx.lineWidth = i === 1 ? 9 + level * 9 : i === 0 ? 2.2 : 1.2;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 3) {
      const y = point(x, i);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (!available) return;
    ctx.fillStyle = ctx.strokeStyle;
    for (const fraction of [0.05, 0.245, 0.52, 0.785, 0.945]) {
      const x = fraction * width;
      ctx.beginPath();
      ctx.arc(x, point(x, i), i === 2 ? 2.5 : 4 + level * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
