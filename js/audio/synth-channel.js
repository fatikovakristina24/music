// Каждый голос имеет собственную цепочку и выход в стереополе.
export const DEFAULT_LAYERS = [
  {
    enabled: true,
    preset: "soft",
    filter: 2400,
    echo: 24,
    room: 18,
    pan: -100,
    volume: 65,
  },
  {
    enabled: true,
    preset: "bass",
    filter: 950,
    echo: 16,
    room: 12,
    pan: 100,
    volume: 50,
  },
];

export const PRESETS = {
  soft: { type: "sine", octave: 1, cutoff: 2400, attack: 0.035, gain: 0.2 },
  bass: {
    type: "triangle",
    octave: 0.5,
    cutoff: 950,
    attack: 0.015,
    gain: 0.23,
  },
  bright: {
    type: "sawtooth",
    octave: 1,
    cutoff: 4000,
    attack: 0.012,
    gain: 0.13,
  },
};

export function createSynthChannel(context, settings, destination, index) {
  const input = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.7;
  const delay = context.createDelay(1);
  delay.delayTime.value = index === 0 ? 0.32 : 0.41;
  const feedback = context.createGain();
  feedback.gain.value = 0.32;
  const echo = context.createGain();
  const sum = context.createGain();
  const room = context.createConvolver();
  // Моноимпульс: ширина задаётся панорамой, а не случайным стереохвостом.
  const impulse = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * 1.4),
    context.sampleRate,
  );
  const samples = impulse.getChannelData(0);
  let seed = 17 + index;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    samples[i] = (seed / 2147483648 - 1) * Math.pow(1 - i / samples.length, 3);
  }
  room.buffer = impulse;
  const roomWet = context.createGain();
  const mix = context.createGain();
  const volume = context.createGain();
  const pan = context.createStereoPanner();
  input.connect(filter).connect(sum);
  filter.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(echo).connect(sum);
  sum.connect(mix);
  sum.connect(room).connect(roomWet).connect(mix);
  const gate = context.createGain();
  mix.connect(volume).connect(pan).connect(gate).connect(destination);

  const update = (name, value, initial = false) => {
    const parameters = {
      enabled: [gate.gain, value === false ? 0 : 1],
      filter: [filter.frequency, value],
      echo: [echo.gain, value / 100],
      room: [roomWet.gain, value / 100],
      volume: [volume.gain, value / 100],
      pan: [pan.pan, value / 100],
    };
    const parameter = parameters[name];
    if (!parameter) return;
    if (initial) parameter[0].value = parameter[1];
    else parameter[0].setTargetAtTime(parameter[1], context.currentTime, 0.02);
  };
  update("enabled", settings.enabled, true);
  for (const [name, value] of Object.entries(settings))
    update(name, value, true);
  return { input, update };
}

export function synthEffectTail(settings) {
  if (settings.enabled === false) return 0;
  // Реверберация идёт после эха, поэтому их хвосты складываются.
  return (settings.echo > 0 ? 3.28 : 0) + (settings.room > 0 ? 1.4 : 0);
}
