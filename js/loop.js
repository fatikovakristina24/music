/** Records note gestures, then schedules repetitions against the audio clock.
 * The timer only queues notes; AudioContext determines their actual timing.
 */
export const LOOP_LIMIT_SECONDS = 20;

export class NoteLoop extends EventTarget {
  constructor(engine) {
    super(); this.engine = engine; this.state = 'empty'; this.notes = [];
    this.pending = new Map(); this.scheduled = new Set(); this.duration = 0;
  }
  changed() { this.dispatchEvent(new Event('change')); }
  startRecording() {
    this.stopPlayback(); this.notes = []; this.pending.clear();
    this.started = this.engine.context.currentTime; this.state = 'recording';
    this.timeout = setTimeout(() => this.finishRecording(), LOOP_LIMIT_SECONDS * 1000); this.changed();
  }
  noteOn(token, index) {
    if (this.state !== 'recording') return;
    const time = this.engine.context.currentTime - this.started;
    if (time < LOOP_LIMIT_SECONDS) this.pending.set(token, { index, time });
  }
  noteOff(token) {
    const note = this.pending.get(token);
    if (!note) return;
    this.notes.push({ ...note, duration:Math.max(.04, Math.min(LOOP_LIMIT_SECONDS, this.engine.context.currentTime - this.started) - note.time) });
    this.pending.delete(token);
  }
  finishRecording() {
    if (this.state !== 'recording') return;
    clearTimeout(this.timeout);
    this.duration = Math.max(.3, Math.min(LOOP_LIMIT_SECONDS, this.engine.context.currentTime - this.started));
    for (const note of this.pending.values()) this.notes.push({ ...note, duration:Math.max(.04, this.duration - note.time) });
    this.pending.clear(); this.notes.sort((a, b) => a.time - b.time);
    this.state = this.notes.length ? 'ready' : 'empty'; this.changed();
  }
  startPlayback() {
    if (!this.notes.length) return;
    this.stopPlayback(); this.state = 'playing';
    this.cycleStart = this.engine.context.currentTime + .04;
    this.next = 0;
    this.schedule(); this.timer = setInterval(() => this.schedule(), 25); this.changed();
  }
  schedule() {
    const horizon = this.engine.context.currentTime + .12;
    while (this.cycleStart + this.notes[this.next].time < horizon) {
      const note = this.notes[this.next];
      const voice = this.engine.noteOn(note.index, this.cycleStart + note.time, note.duration);
      this.scheduled.add(voice);
      this.next++;
      if (this.next === this.notes.length) { this.next = 0; this.cycleStart += this.duration; }
    }
    for (const voice of this.scheduled) if (voice.end < this.engine.context.currentTime) this.scheduled.delete(voice);
  }
  stopPlayback() {
    clearInterval(this.timer);
    for (const voice of this.scheduled) voice.kill();
    this.scheduled.clear();
    if (this.state === 'playing') { this.state = 'ready'; this.changed(); }
  }
  clear() {
    clearTimeout(this.timeout); this.stopPlayback();
    this.pending.clear(); this.notes = []; this.duration = 0; this.state = 'empty'; this.changed();
  }
  get elapsed() { return this.state === 'recording' ? Math.min(LOOP_LIMIT_SECONDS, this.engine.context.currentTime - this.started) : 0; }
}
