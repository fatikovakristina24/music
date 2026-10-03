import { PitchShifter } from "./pitch-dsp.js";

class VoicePitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "semitones",
        defaultValue: 0,
        minValue: -12,
        maxValue: 24,
        automationRate: "k-rate",
      },
    ];
  }
  constructor() {
    super();
    this.channels = [];
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    for (let c = 0; c < output.length; c++) {
      this.channels[c] ??= new PitchShifter(sampleRate);
      const from = input[c] || input[0];
      const to = output[c];
      for (let i = 0; i < to.length; i++)
        to[i] = this.channels[c].process(
          from?.[i] || 0,
          parameters.semitones[0],
        );
    }
    return true;
  }
}

// Записываем PCM напрямую, без кодеков и вывода микрофона в колонки.
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.limit = Math.round(
      sampleRate * (options.processorOptions?.maxSeconds || 20),
    );
    this.chunk = new Float32Array(4096);
    this.offset = 0;
    this.total = 0;
    this.done = false;
    this.port.onmessage = ({ data }) => {
      if (data === "stop") this.finish();
    };
  }
  flush() {
    if (!this.offset) return;
    const chunk = this.chunk.slice(0, this.offset);
    this.port.postMessage({ type: "chunk", samples: chunk }, [chunk.buffer]);
    this.offset = 0;
  }
  finish() {
    if (this.done) return;
    this.flush();
    this.done = true;
    this.port.postMessage({ type: "done", samples: this.total });
  }
  process(inputs, outputs) {
    for (const output of outputs[0]) output.fill(0);
    if (this.done) return false;
    const input = inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length && this.total < this.limit; i++) {
      this.chunk[this.offset++] = input[i];
      this.total++;
      if (this.offset === this.chunk.length) this.flush();
    }
    if (this.total >= this.limit) this.finish();
    return !this.done;
  }
}

registerProcessor("contour-pitch", VoicePitchProcessor);
registerProcessor("contour-capture", VoiceCaptureProcessor);
