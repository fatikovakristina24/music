import { ROOTS } from "../loops.js";
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
// Буферы партий имеют точную музыкальную длину — без дрейфа между деками.
export async function renderLoop(loop, bpm = 112, transpose = 0) {
  const rate = 24000,
    beat = 60 / bpm,
    duration = loop.bars * 4 * beat;
  const c = new OfflineAudioContext(2, Math.round(duration * rate), rate);
  const sum = c.createGain();
  sum.gain.value = 0.7;
  sum.connect(c.destination);
  const noise = c.createBuffer(1, rate, rate);
  let seed = 123;
  const samples = noise.getChannelData(0);
  for (let i = 0; i < rate; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    samples[i] = seed / 2147483648 - 1;
  }
  function tone(m, t, len, type = "sine", amp = 0.2, cutoff = 5000, pan = 0) {
    const o = c.createOscillator(),
      g = c.createGain(),
      f = c.createBiquadFilter(),
      p = c.createStereoPanner();
    o.type = type;
    o.frequency.value = hz(m + transpose);
    f.type = "lowpass";
    f.frequency.value = cutoff;
    p.pan.value = pan;
    const end = Math.min(duration - 0.001, t + len);
    if (end <= t) return;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, Math.min(t + 0.012, end));
    g.gain.exponentialRampToValueAtTime(0.00001, end);
    o.connect(f).connect(g).connect(p).connect(sum);
    o.start(t);
    o.stop(end);
  }
  function drum(kind, t, amp = 1) {
    const g = c.createGain();
    g.connect(sum);
    let source;
    if (kind === 0) {
      source = c.createOscillator();
      source.frequency.setValueAtTime(145, t);
      source.frequency.exponentialRampToValueAtTime(43, t + 0.16);
      source.connect(g);
    } else {
      source = c.createBufferSource();
      source.buffer = noise;
      const f = c.createBiquadFilter();
      f.type = kind === 1 || kind === 3 ? "bandpass" : "highpass";
      f.frequency.value = [0, 1700, 7800, 1200, 9500][kind];
      f.Q.value = 0.65;
      source.connect(f).connect(g);
    }
    const len = [0.3, 0.16, 0.055, 0.11, 0.035][kind],
      end = Math.min(duration - 0.001, t + len);
    g.gain.setValueAtTime([0.65, 0.25, 0.09, 0.22, 0.055][kind] * amp, t);
    g.gain.exponentialRampToValueAtTime(0.00001, end);
    source.start(t);
    source.stop(end);
  }
  for (let bar = 0; bar < loop.bars; bar++)
    for (let s = 0; s < 16; s++) {
      let t = (bar * 4 + s / 4) * beat;
      if (loop.grid && s % 2)
        t += (((beat / 4) * (loop.swing || 0)) / 100) * 0.6;
      if (t >= duration - 0.01) continue;
      const root = 50 + ROOTS[bar % 4],
        short = beat * 0.42;
      switch (loop.id) {
        case "kick":
          if (s % 4 === 0) drum(0, t);
          break;
        case "break":
          if ([0, 6, 10].includes(s)) drum(0, t, 0.85);
          if ([4, 12].includes(s)) drum(1, t);
          if (s % 2) drum(2, t, 0.8);
          break;
        case "hats":
          drum(2, t, s % 2 ? 0.55 : 1);
          break;
        case "bass":
          if ([0, 6, 8, 14].includes(s))
            tone(root - 12, t, short, "triangle", 0.4, 700);
          break;
        case "pulse":
          if (s % 2 === 0) tone(root - 12, t, beat * 0.2, "square", 0.17, 550);
          break;
        case "acid":
          if (s % 2 === 0)
            tone(
              root - 12 + [0, 0, 7, 12, 0, 10, 7, 3][s / 2],
              t,
              short,
              "sawtooth",
              0.12,
              900 + (s % 4) * 650,
            );
          break;
        case "motif":
          if ([0, 6, 8, 12].includes(s))
            tone(
              62 + [0, 3, 7, 2][[0, 6, 8, 12].indexOf(s)],
              t,
              beat * 0.8,
              "triangle",
              0.24,
              2600,
            );
          break;
        case "arp":
          if (s % 2 === 0)
            tone(
              root + 12 + [0, 7, 10, 14][(s / 2) % 4],
              t,
              beat * 0.34,
              "sine",
              0.19,
              4000,
              s % 4 ? -0.25 : 0.25,
            );
          break;
        case "chords":
          if (s === 0)
            [0, 3, 7].forEach((v, i) =>
              tone(
                root + 12 + v,
                t,
                beat * 3.6,
                "triangle",
                0.075,
                1600,
                (i - 1) * 0.3,
              ),
            );
          break;
        case "air":
          if (s === 0)
            [0, 7].forEach((v, i) =>
              tone(
                root + 24 + v,
                t,
                beat * 3.9,
                "sine",
                0.065,
                2400,
                i ? -0.6 : 0.6,
              ),
            );
          break;
        case "pad":
          if (s === 0)
            [0, 3, 7].forEach((v, i) =>
              tone(
                root + v,
                t,
                beat * 3.95,
                "sawtooth",
                0.055,
                550,
                (i - 1) * 0.4,
              ),
            );
          break;
        case "rise":
          drum(4, t, (s + bar * 16 + 1) / (loop.bars * 16));
          if (s % 2 === 0) tone(62 + s, t, short, "sine", 0.03);
          break;
        default:
          if (loop.grid)
            loop.grid.forEach((row, i) => {
              if (row[s]) drum(i, t);
            });
      }
    }
  return c.startRendering();
}
export function makeImpulse(c) {
  const b = c.createBuffer(2, c.sampleRate * 1.6, c.sampleRate);
  let seed = 5;
  for (let ch = 0; ch < 2; ch++)
    for (let i = 0; i < b.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      b.getChannelData(ch)[i] =
        (seed / 2147483648 - 1) * (1 - i / b.length) ** 3;
    }
  return b;
}
