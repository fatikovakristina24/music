const INK = '#edf2fa';
const AMBER = '#ffbf69';

function analyserState(analyser, storage) {
  if (!analyser) return { rms:0, frequency:0 };
  analyser.getFloatTimeDomainData(storage.wave);
  analyser.getByteFrequencyData(storage.spectrum);
  let power = 0, maximum = 0, dominant = 0;
  for (const sample of storage.wave) power += sample * sample;
  for (let i = 2; i < storage.spectrum.length; i++) if (storage.spectrum[i] > maximum) { maximum = storage.spectrum[i]; dominant = i; }
  return { rms:Math.sqrt(power / storage.wave.length), frequency:dominant / storage.spectrum.length };
}

export class SoundVisuals {
  constructor(engine, voice, loop, geometry, onFrame) {
    this.engine = engine; this.voice = voice; this.loop = loop; this.geometry = geometry; this.onFrame = onFrame;
    this.synthCanvas = document.querySelector('#synth-canvas');
    this.voiceCanvas = document.querySelector('#voice-canvas');
    this.mode = 'play'; this.energy = 0;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.storage = { wave:new Float32Array(2048), spectrum:new Uint8Array(1024) };
    this.voiceStorage = { wave:new Float32Array(2048), spectrum:new Uint8Array(1024) };
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.synthCanvas); this.observer.observe(this.voiceCanvas);
    this.resize(); this.frame = this.frame.bind(this); this.frame();
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const canvas of [this.synthCanvas, this.voiceCanvas]) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) continue;
      canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  frame() {
    const now = this.engine.context?.currentTime || 0;
    const analyser = this.mode === 'voice' ? (this.voice.state === 'recording' ? this.voice.micAnalyser : this.engine.voiceAnalyser) : this.engine.analyser;
    const storage = this.mode === 'voice' ? this.voiceStorage : this.storage;
    const sound = analyserState(analyser, storage);
    this.energy += (Math.min(1, sound.rms * 7) - this.energy) * .14;
    const time = this.reducedMotion ? 0 : performance.now() / 1000;
    if (this.mode === 'play') this.drawSynth(time, now, sound);
    else this.drawVoice(time, sound);
    this.onFrame(now); requestAnimationFrame(this.frame);
  }
  drawSynth(time, now, sound) {
    const canvas = this.synthCanvas, ctx = canvas.getContext('2d');
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width) return;
    ctx.clearRect(0, 0, width, height);
    ctx.save(); ctx.scale(width / 952, height / 440);
    const notes = [...this.engine.voices].filter(v => v.start <= now && v.end > now);
    const average = notes.length ? notes.reduce((sum, v) => sum + v.index, 0) / notes.length : 3;
    const motion = this.energy * (this.reducedMotion ? 4 : 24);
    for (let line = 0; line < this.geometry.length; line++) {
      const contour = this.geometry[line]; const points = contour.points;
      const curve = [];
      for (let i = 0; i < points.length; i += 2) {
        const x = 116 + contour.x + points[i], y = 4 + contour.y + points[i + 1];
        const angle = Math.atan2((y - 212) * 1.4, x - 468);
        const modulation = motion * Math.sin(angle * (2 + average / 3) + time * (1.1 + sound.frequency * 12) + line * .13);
        const px = x + Math.cos(angle) * modulation;
        const py = y + Math.sin(angle) * modulation;
        curve.push([px, py]);
      }
      ctx.beginPath();
      const first = curve[0], last = curve[curve.length - 1];
      ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
      for (let i = 0; i < curve.length; i++) {
        const point = curve[i], next = curve[(i + 1) % curve.length];
        ctx.quadraticCurveTo(point[0], point[1], (point[0] + next[0]) / 2, (point[1] + next[1]) / 2);
      }
      ctx.closePath();
      ctx.strokeStyle = this.energy > .025 ? AMBER : INK;
      ctx.globalAlpha = .42 + line / this.geometry.length * .5;
      ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.globalAlpha = .9; ctx.strokeStyle = this.energy > .025 ? AMBER : INK;
    ctx.beginPath(); ctx.moveTo(464, 214); ctx.lineTo(472, 214); ctx.moveTo(468, 210); ctx.lineTo(468, 218); ctx.stroke();
    ctx.restore();
  }
  drawVoice(time, sound) {
    const canvas = this.voiceCanvas, ctx = canvas.getContext('2d');
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width) return;
    ctx.clearRect(0, 0, width, height);
    const active = ['recording','playing'].includes(this.voice.state) || this.energy > .02;
    const hasBuffer = !!this.voice.buffer;
    const amplitude = active ? 14 + this.energy * 118 : hasBuffer ? 45 : 12;
    const effects = this.engine.effects;
    const pitch = (effects.pitch + (effects.child || 0) * .07) / 12;
    const phase = active ? time * (1.8 + sound.frequency * 22) : 0;
    const from = width * .09, to = width * .91, middle = height * .48;
    for (let line = 0; line < 19; line++) {
      ctx.beginPath();
      for (let i = 0; i <= 180; i++) {
        const u = i / 180, envelope = Math.sin(Math.PI * u) ** 1.4;
        const primary = Math.sin(u * Math.PI * (5.2 + pitch * 1.5) + phase + line * .085);
        const harmonic = Math.sin(u * Math.PI * 11 - phase * .65 + line * .04) * (.32 + effects.robot / 300);
        const distortion = Math.sin(primary * 4) * effects.distortion / 400;
        const depth = .32 + line / 28;
        const y = middle + envelope * (primary + harmonic + distortion) * amplitude * depth;
        const x = from + u * (to - from);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1; ctx.globalAlpha = .32 + line / 27;
      ctx.strokeStyle = active ? AMBER : INK; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
