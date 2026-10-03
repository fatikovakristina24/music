/** Reusable voice effect graph: identical settings for playback and export. */
export const DEFAULT_EFFECTS = Object.freeze({ pitch: 0, robot: 0, echo: 0, room: 0, distortion: 0, radio: 0 });

function smooth(parameter, value, context) {
  parameter.setTargetAtTime(value, context.currentTime, .012);
}

function reverbImpulse(context) {
  const buffer = context.createBuffer(2, Math.ceil(context.sampleRate * 1.8), context.sampleRate);
  let seed = 14731;
  for (let c = 0; c < 2; c++) {
    const samples = buffer.getChannelData(c);
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[i] = ((seed / 4294967296) * 2 - 1) * (1 - i / samples.length) ** 2.5;
    }
  }
  return buffer;
}

function distortionCurve() {
  const samples = new Float32Array(4096);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.tanh(((i * 2) / (samples.length - 1) - 1) * 7) / Math.tanh(7);
  return samples;
}

export function createEffectChain(context, settings, destination, startTime = context.currentTime) {
  const nodes = [];
  const node = (type) => { const n = context[type](); nodes.push(n); return n; };
  const input = node('createGain');
  const ring = node('createGain');
  const carrier = node('createOscillator');
  carrier.frequency.value = 42;
  carrier.type = 'sine';
  ring.gain.value = 0;
  carrier.connect(ring.gain);
  const stages = {};

  const mix = (name, from, effectIn, effectOut = effectIn) => {
    const dry = node('createGain');
    const wet = node('createGain');
    const output = node('createGain');
    from.connect(dry).connect(output);
    from.connect(effectIn);
    effectOut.connect(wet).connect(output);
    stages[name] = { dry, wet };
    return output;
  };
  const robotic = mix('robot', input, ring);

  const delay = node('createDelay');
  delay.delayTime.value = .28;
  const feedback = node('createGain');
  feedback.gain.value = .38;
  const echoTone = node('createBiquadFilter');
  echoTone.type = 'lowpass'; echoTone.frequency.value = 3800;
  delay.connect(echoTone).connect(feedback).connect(delay);
  const echoed = mix('echo', robotic, delay, echoTone);

  const room = node('createConvolver');
  room.buffer = reverbImpulse(context);
  const spacious = mix('room', echoed, room);

  const distortion = node('createWaveShaper');
  distortion.curve = distortionCurve(); distortion.oversample = '4x';
  const compensation = node('createGain');
  compensation.gain.value = .4;
  distortion.connect(compensation);
  const distorted = mix('distortion', spacious, distortion, compensation);

  const high = node('createBiquadFilter');
  high.type = 'highpass'; high.frequency.value = 650; high.Q.value = .7;
  const low = node('createBiquadFilter');
  low.type = 'lowpass'; low.frequency.value = 2400; low.Q.value = .7;
  high.connect(low);
  const radio = mix('radio', distorted, high, low);

  const compressor = node('createDynamicsCompressor');
  compressor.threshold.value = -8; compressor.knee.value = 12;
  compressor.ratio.value = 4; compressor.attack.value = .006; compressor.release.value = .12;
  radio.connect(compressor).connect(destination);
  carrier.start(startTime);

  function update(values, immediate = false) {
    for (const [name, { dry, wet }] of Object.entries(stages)) {
      const amount = values[name] / 100;
      // Echo/reverb add a tail; the other effects crossfade with the original.
      const dryValue = name === 'echo' || name === 'room' ? 1 : 1 - amount;
      const wetValue = name === 'room' ? amount * .7 : amount;
      if (immediate) { dry.gain.value = dryValue; wet.gain.value = wetValue; }
      else { smooth(dry.gain, dryValue, context); smooth(wet.gain, wetValue, context); }
    }
  }
  update(settings, true);
  return {
    input, update,
    dispose() {
      try { carrier.stop(); } catch { /* Already stopped. */ }
      for (const n of nodes) n.disconnect();
    },
  };
}

export function effectTail(settings) { return Math.max(settings.echo > 0 ? 2.8 : 0, settings.room > 0 ? 1.8 : 0, settings.pitch !== 0 ? .09 : 0); }
