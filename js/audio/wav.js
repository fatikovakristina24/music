/** Uncompressed stereo/mono PCM WAV, supported by ordinary audio players. */
export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const bytes = buffer.length * channels * 2;
  const output = new ArrayBuffer(44 + bytes);
  const view = new DataView(output);
  const string = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  string(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); string(8, 'WAVE');
  string(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  string(36, 'data'); view.setUint32(40, bytes, true);
  const samples = Array.from({ length:channels }, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) for (let c = 0; c < channels; c++) {
    const sample = Math.max(-1, Math.min(1, samples[c][i]));
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); offset += 2;
  }
  return new Blob([output], { type:'audio/wav' });
}
