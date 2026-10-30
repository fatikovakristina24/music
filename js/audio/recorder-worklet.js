// Запись стереовыхода синтезатора. Микрофон и сервер не используются.
class PerformanceCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.start = options.processorOptions.start;
    this.end = options.processorOptions.end;
    this.left = new Float32Array(8192);
    this.right = new Float32Array(8192);
    this.offset = 0;
    this.done = false;
    this.port.onmessage = ({ data }) => {
      if (data.end !== undefined) this.end = data.end;
    };
  }
  flush() {
    if (!this.offset) return;
    const left = this.left.slice(0, this.offset),
      right = this.right.slice(0, this.offset);
    this.port.postMessage({ left, right }, [left.buffer, right.buffer]);
    this.offset = 0;
  }
  process(inputs, outputs) {
    for (const output of outputs[0]) output.fill(0);
    if (this.done) return false;
    const input = inputs[0];
    for (let i = 0; i < 128; i++) {
      const time = currentTime + i / sampleRate;
      if (time < this.start) continue;
      if (time >= this.end) {
        this.flush();
        this.port.postMessage({ done: true });
        this.done = true;
        return false;
      }
      this.left[this.offset] = input[0]?.[i] || 0;
      this.right[this.offset] = input[1]?.[i] ?? input[0]?.[i] ?? 0;
      if (++this.offset === this.left.length) this.flush();
    }
    return true;
  }
}
registerProcessor("spletenie-capture", PerformanceCapture);
