/** Two overlapping read heads shift frequency without changing the timeline.
 * The same DSP is used by the audio thread and the WAV renderer.
 * Small grains intentionally give the voice a gentle electronic texture.
 */
export class PitchShifter {
  constructor(sampleRate) {
    this.window = Math.round(sampleRate * .07);
    this.minimumDelay = Math.round(sampleRate * .005);
    this.ring = new Float32Array(2 ** Math.ceil(Math.log2(this.window + this.minimumDelay + 256)));
    this.mask = this.ring.length - 1;
    this.position = 0;
    this.phase = 0;
    this.pitch = 0;
    this.blend = 0;
    this.smoothing = 1 - Math.exp(-1 / (sampleRate * .015));
  }

  read(delay) {
    const index = this.position - delay;
    const lower = Math.floor(index);
    const fraction = index - lower;
    return this.ring[lower & this.mask] * (1 - fraction) + this.ring[(lower + 1) & this.mask] * fraction;
  }

  process(sample, semitones) {
    this.ring[this.position & this.mask] = sample;
    this.pitch += (semitones - this.pitch) * this.smoothing;
    this.blend += ((Math.abs(semitones) > .001 ? 1 : 0) - this.blend) * this.smoothing;
    const factor = 2 ** (this.pitch / 12);
    this.phase = (this.phase + (1 - factor) / this.window + 1) % 1;
    const phase2 = (this.phase + .5) % 1;
    const weight = Math.sin(Math.PI * this.phase) ** 2;
    const shifted = weight * this.read(this.minimumDelay + this.phase * this.window)
      + (1 - weight) * this.read(this.minimumDelay + phase2 * this.window);
    this.position++;
    return sample * (1 - this.blend) + shifted * this.blend;
  }
}

export function shiftBuffer(context, input, semitones, tailSamples = 0) {
  if (semitones === 0) return input;
  const output = context.createBuffer(input.numberOfChannels, input.length + tailSamples, input.sampleRate);
  for (let channel = 0; channel < input.numberOfChannels; channel++) {
    const processor = new PitchShifter(input.sampleRate);
    const from = input.getChannelData(channel);
    const to = output.getChannelData(channel);
    for (let i = 0; i < to.length; i++) to[i] = processor.process(from[i] || 0, semitones);
  }
  return output;
}
