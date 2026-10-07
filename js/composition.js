import { AudioEngine, NOTES } from "./audio/engine.js?v=20261008-weave";
import { downloadWav } from "./audio/wav.js";
import { synthEffectTail } from "./audio/synth-channel.js?v=20261008-weave";

export const BASS_OPTIONS = [
  {
    id: "soft",
    name: "Мягкий",
    description: "Плавные длинные звуки",
    pattern: [[0, 3.5, 0]],
  },
  {
    id: "pulse",
    name: "Пульс",
    description: "Короткие повторяющиеся ноты",
    pattern: [
      [0, 0.7, 0],
      [1, 0.7, 0],
      [2, 0.7, 7],
      [3, 0.7, 0],
    ],
  },
  {
    id: "deep",
    name: "Глубокий",
    description: "Низкий и протяжный бас",
    pattern: [
      [0, 1.8, 0],
      [2, 1.8, -5],
    ],
  },
];

/** Партии хранятся в долях, поэтому темп меняется без потери рисунка.
 * Интервал только подготавливает события; время звучания задаёт AudioContext. */
export class Composition extends EventTarget {
  constructor(engine) {
    super();
    this.engine = engine;
    this.bpm = 120;
    this.notes = [];
    this.pending = new Map();
    this.loopBeats = 16;
    this.bass = null;
    this.drums = [
      Array(8).fill(false),
      Array(8).fill(false),
      Array(8).fill(false),
    ];
    this.parts = [
      [true, false, false],
      [true, true, true],
      [true, true, false],
    ];
    this.scheduled = new Set();
    this.position = 0;
    this.kind = null;
    this.recording = false;
    this.exporting = false;
  }
  change() {
    this.dispatchEvent(new Event("change"));
  }
  get secondsPerBeat() {
    return 60 / this.bpm;
  }
  get elapsed() {
    return this.recording
      ? Math.min(20, this.engine.context.currentTime - this.recordStarted)
      : 0;
  }
  get hasDrums() {
    return this.drums.some((row) => row.some(Boolean));
  }
  get hasMusic() {
    return !!(this.notes.length || this.bass || this.hasDrums);
  }
  get sectionBars() {
    return [2, Math.max(4, this.loopBeats / 4), 2];
  }
  get playhead() {
    if (!this.kind) return this.position;
    const beat = Math.max(
      0,
      (this.engine.context.currentTime - this.started) / this.secondsPerBeat,
    );
    return this.repeat ? beat % this.length : Math.min(this.length, beat);
  }
  startRecording() {
    this.stop();
    this.notes = [];
    this.pending.clear();
    this.recordStarted = this.engine.context.currentTime;
    this.recording = true;
    this.recordTimer = setTimeout(() => this.finishRecording(), 20000);
    this.change();
  }
  noteOn(token, index) {
    if (this.recording && this.elapsed < 20)
      this.pending.set(token, { index, time: this.elapsed });
  }
  noteOff(token) {
    const note = this.pending.get(token);
    if (!note) return;
    const beat = Math.min(
      Math.floor((20 / this.secondsPerBeat - 0.5) * 2) / 2,
      Math.round((note.time / this.secondsPerBeat) * 2) / 2,
    );
    const duration = Math.max(
      0.5,
      Math.round(((this.elapsed - note.time) / this.secondsPerBeat) * 2) / 2,
    );
    this.notes.push({
      index: note.index,
      beat,
      duration: Math.min(duration, 20 / this.secondsPerBeat - beat),
    });
    this.pending.delete(token);
  }
  finishRecording() {
    if (!this.recording) return;
    clearTimeout(this.recordTimer);
    for (const token of [...this.pending.keys()]) this.noteOff(token);
    const lastEnd = Math.max(
      this.elapsed / this.secondsPerBeat,
      ...this.notes.map((n) => n.beat + n.duration),
    );
    this.loopBeats = Math.max(4, Math.ceil(lastEnd / 4) * 4);
    this.notes.sort((a, b) => a.beat - b.beat);
    this.recording = false;
    this.change();
  }
  clearMelody() {
    this.stop();
    clearTimeout(this.recordTimer);
    this.recording = false;
    this.notes = [];
    this.pending.clear();
    this.loopBeats = 16;
    this.change();
  }
  setTempo(value) {
    if (this.recording) return;
    const kind = this.kind;
    this.stop();
    this.bpm = value;
    if (kind && kind !== "preview") this.play(kind);
    this.change();
  }
  bassEvents(option, length) {
    const first = this.notes[0]?.index || 0;
    const root = NOTES[first].frequency * 0.5;
    const result = [];
    for (let bar = 0; bar < length; bar += 4)
      for (const [beat, duration, offset] of option.pattern)
        result.push({
          beat: bar + beat,
          duration,
          index: first,
          channel: 1,
          frequency: root * 2 ** (offset / 12),
        });
    return result;
  }
  events(kind = "track") {
    if (kind === "melody")
      return {
        length: this.loopBeats,
        events: this.notes.map((n) => ({ ...n, channel: 0 })),
      };
    if (kind === "rhythm") {
      const events = [];
      for (let step = 0; step < 8; step++)
        for (let drum = 0; drum < 3; drum++)
          if (this.drums[drum][step])
            events.push({ beat: step / 2, channel: 2, drum });
      return { length: 4, events };
    }
    const bars = this.sectionBars;
    const ends = [
      bars[0] * 4,
      (bars[0] + bars[1]) * 4,
      bars.reduce((a, b) => a + b, 0) * 4,
    ];
    const length = ends[2];
    const section = (beat) => (beat < ends[0] ? 0 : beat < ends[1] ? 1 : 2);
    const allowed = (beat, channel) => this.parts[section(beat)][channel];
    const events = [];
    for (let base = 0; base < length; base += this.loopBeats)
      for (const note of this.notes) {
        const beat = base + note.beat;
        if (beat < length && allowed(beat, 0))
          events.push({
            ...note,
            beat,
            duration: Math.min(note.duration, ends[section(beat)] - beat),
            channel: 0,
          });
      }
    if (this.bass)
      for (const event of this.bassEvents(
        BASS_OPTIONS.find((x) => x.id === this.bass),
        length,
      ))
        if (allowed(event.beat, 1)) events.push(event);
    for (let step = 0; step < length * 2; step++)
      for (let drum = 0; drum < 3; drum++)
        if (this.drums[drum][step % 8] && allowed(step / 2, 2))
          events.push({ beat: step / 2, channel: 2, drum });
    return { length, events: events.sort((a, b) => a.beat - b.beat) };
  }
  trigger(event, when, engine = this.engine) {
    if (event.channel === 2) return engine.drum(event.drum, when);
    return engine.noteOn(
      event.index,
      when,
      event.duration * this.secondsPerBeat,
      event.frequency || NOTES[event.index].frequency,
      event.channel,
    );
  }
  play(kind = "track") {
    if (this.recording) this.finishRecording();
    const resume = this.pausedKind === kind ? this.position : 0;
    const score = this.events(kind);
    this.begin(score, kind, kind === "melody" || kind === "rhythm", resume);
  }
  preview(id) {
    this.begin(
      {
        length: 4,
        events: this.bassEvents(
          BASS_OPTIONS.find((x) => x.id === id),
          4,
        ),
      },
      "preview",
      false,
    );
    this.previewId = id;
    this.change();
  }
  begin(score, kind, repeat, offset = 0) {
    this.stop();
    if (!score.events.length) return;
    this.length = score.length;
    this.queue = score.events;
    this.repeat = repeat;
    this.kind = kind;
    this.position = offset;
    this.started =
      this.engine.context.currentTime + 0.05 - offset * this.secondsPerBeat;
    this.cycle = 0;
    this.next = this.queue.findIndex((n) => n.beat >= offset);
    if (this.next < 0) this.next = this.queue.length;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
    this.change();
  }
  schedule() {
    const now = this.engine.context.currentTime;
    const horizon = now + 0.12;
    while (true) {
      if (this.next >= this.queue.length) {
        if (!this.repeat) break;
        this.cycle++;
        this.next = 0;
      }
      const event = this.queue[this.next];
      const when =
        this.started +
        (this.cycle * this.length + event.beat) * this.secondsPerBeat;
      if (when >= horizon) break;
      if (when >= now - 0.015)
        this.scheduled.add(this.trigger(event, Math.max(when, now)));
      this.next++;
    }
    for (const source of this.scheduled)
      if (source.end < now) this.scheduled.delete(source);
    if (
      !this.repeat &&
      now >= this.started + this.length * this.secondsPerBeat + 0.4
    )
      this.stop();
  }
  pause() {
    const beat = this.playhead,
      kind = this.kind;
    this.stop();
    this.position = beat;
    this.pausedKind = kind;
    this.change();
  }
  stop() {
    clearInterval(this.timer);
    for (const source of this.scheduled) source.kill();
    this.scheduled.clear();
    this.kind = null;
    this.previewId = null;
    this.position = 0;
    this.pausedKind = null;
    this.change();
  }
  refresh() {
    const kind = this.kind;
    this.stop();
    if (kind && kind !== "preview") this.play(kind);
    this.change();
  }
  async download() {
    if (this.exporting || this.recording) return;
    const score = this.events();
    if (!score.events.length)
      throw new Error("Включи хотя бы одну партию в одной из частей трека.");
    this.exporting = true;
    this.change();
    try {
      const rate = 44100;
      const tail =
        this.engine.synthSettings.release +
        0.04 +
        Math.max(...this.engine.layers.map(synthEffectTail)) +
        synthEffectTail(this.engine.mixSettings);
      const duration = score.length * this.secondsPerBeat + Math.max(0.5, tail);
      const context = new (window.OfflineAudioContext ||
        window.webkitOfflineAudioContext)(2, Math.ceil(duration * rate), rate);
      const renderer = new AudioEngine();
      renderer.layers = this.engine.layers.map((layer) => ({ ...layer }));
      renderer.synthSettings = { ...this.engine.synthSettings };
      renderer.mixSettings = { ...this.engine.mixSettings };
      renderer.voiceLimit = Infinity;
      renderer.initialize(context);
      for (const event of score.events)
        this.trigger(event, event.beat * this.secondsPerBeat, renderer);
      const buffer = await context.startRendering();
      downloadWav(buffer, "spletenie-track.wav");
    } finally {
      this.exporting = false;
      this.change();
    }
  }
}
