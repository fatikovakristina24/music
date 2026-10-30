const COLORS = ["#a9b2ff", "#6158a3", "#5965d9", "#e0dfff"];
export class SoundLines {
  constructor(canvas, instrument, ending = false) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.instrument = instrument;
    this.ending = ending;
    this.levels = [0, 0, 0];
    this.data = [
      new Float32Array(512),
      new Float32Array(512),
      new Float32Array(512),
    ];
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }
  resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  draw() {
    if (!this.width || !this.height) this.resize();
    const { context: ctx, width: w, height: h, instrument: engine } = this;
    const playing = engine.state === "running",
      elapsed = engine.elapsed;
    ctx.clearRect(0, 0, w, h);
    if (engine.graph && playing)
      engine.graph.channels.forEach((channel, i) => {
        channel.meter.getFloatTimeDomainData(this.data[i]);
        const rms = Math.sqrt(
          this.data[i].reduce((sum, value) => sum + value * value, 0) /
            this.data[i].length,
        );
        this.levels[i] = this.levels[i] * 0.75 + Math.min(1, rms * 12) * 0.25;
      });
    const bass = this.levels[1] > 0.005 || engine.values[0] > 0;
    const drums = this.levels[2] > 0.005 || engine.values[1] > 0;
    const count = this.ending
      ? 4
      : engine.phase === 3
        ? 4
        : drums
          ? 3
          : bass
            ? 2
            : 1;
    for (let j = 0; j < count; j++) {
      const level = this.ending ? 1 : this.levels[Math.min(j, 2)];
      const motion =
        this.reduced || this.ending ? 0 : elapsed * (j === 0 ? 1.1 : 0.65);
      const magnitude =
        this.ending || engine.state === "paused" ? 0.85 : 0.35 + level * 0.8;
      ctx.beginPath();
      for (let k = 0; k <= 220; k++) {
        const t = k / 220,
          amplitude = j === 0 ? 0.23 : j === 1 ? 0.13 : 0.09;
        const raw = playing
          ? this.data[Math.min(j, 2)][Math.floor(t * 511)] * h * 0.035
          : 0;
        const pulse =
          j === 2 ? Math.abs(Math.sin(t * Math.PI * 16 + motion)) ** 6 : 1;
        const y =
          h * (0.5 + (j - (count - 1) / 2) * (count === 4 ? 0.15 : 0.22)) +
          h *
            amplitude *
            magnitude *
            Math.sin(t * Math.PI * (j === 0 ? 8 : j === 1 ? 4 : 32) + motion) *
            pulse +
          raw;
        const x = w * (0.04 + 0.92 * t);
        if (!k) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = COLORS[j];
      ctx.lineWidth = j === 0 ? 2.1 : 1.6;
      ctx.globalAlpha = j > 0 && !this.ending ? 0.3 + level * 0.7 : 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
