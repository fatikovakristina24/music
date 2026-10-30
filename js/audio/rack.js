import { LIBRARY, initialDecks } from "../loops.js";
import { renderLoop, makeImpulse } from "./synthesis.js";

export class Rack extends EventTarget {
  constructor() {
    super();
    this.library = LIBRARY.map((l) => ({ ...l }));
    this.decks = initialDecks();
    this.bpm = 112;
    this.transpose = 0;
    this.cross = 50;
    this.fx = {
      filter: false,
      echo: false,
      room: false,
      drive: false,
      depth: 32,
    };
    this.state = "idle";
    this.cache = new Map();
    this.jobs = [];
    this.live = new Map();
    this.buffer = null;
    this.scene = "Вступление";
    this.savedScenes = [];
    this.demo = false;
    this.recording = null;
    this.busy = false;
  }
  changed() {
    this.dispatchEvent(new Event("change"));
  }
  get beat() {
    return 60 / this.bpm;
  }
  get elapsed() {
    return this.context && this.started !== undefined
      ? Math.max(0, this.context.currentTime - this.started)
      : 0;
  }
  get bar() {
    return Math.floor(this.elapsed / (this.beat * 4));
  }
  get key() {
    return `${this.bpm}:${this.transpose}`;
  }
  async ready() {
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio)
        throw Error("Открой сайт в современном браузере с поддержкой звука.");
      const c = (this.context = new Audio({ latencyHint: "interactive" }));
      this.sum = c.createGain();
      this.filter = c.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 20000;
      this.drive = c.createWaveShaper();
      this.drive.oversample = "2x";
      this.dropFilter = c.createBiquadFilter();
      this.dropFilter.type = "highpass";
      this.dropFilter.frequency.value = 20;
      const comp = (this.limiter = c.createDynamicsCompressor());
      comp.threshold.value = -10;
      comp.knee.value = 12;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.12;
      this.master = c.createGain();
      this.master.gain.value = 0.8;
      this.analyser = c.createAnalyser();
      this.analyser.fftSize = 1024;
      this.sum
        .connect(this.filter)
        .connect(this.drive)
        .connect(this.dropFilter)
        .connect(comp)
        .connect(this.master)
        .connect(this.analyser)
        .connect(c.destination);
      this.echo = c.createDelay(2);
      this.echo.delayTime.value = this.beat * 0.75;
      this.feedback = c.createGain();
      this.feedback.gain.value = 0.28;
      this.echoWet = c.createGain();
      this.echoWet.gain.value = 0;
      this.drive.connect(this.echo);
      this.echo.connect(this.feedback).connect(this.echo);
      this.echo.connect(this.echoWet).connect(this.dropFilter);
      this.room = c.createConvolver();
      this.room.buffer = makeImpulse(c);
      this.roomWet = c.createGain();
      this.roomWet.gain.value = 0;
      this.drive
        .connect(this.room)
        .connect(this.roomWet)
        .connect(this.dropFilter);
      this.channels = this.decks.map(() => {
        const input = c.createGain(),
          eq = ["highshelf", "peaking", "lowshelf"].map((type, i) => {
            const f = c.createBiquadFilter();
            f.type = type;
            f.frequency.value = [4000, 1000, 180][i];
            f.Q.value = 0.7;
            return f;
          });
        const level = c.createGain(),
          mix = c.createGain(),
          meter = c.createAnalyser();
        meter.fftSize = 512;
        input
          .connect(eq[0])
          .connect(eq[1])
          .connect(eq[2])
          .connect(level)
          .connect(mix)
          .connect(meter)
          .connect(this.sum);
        return { input, eq, level, mix, meter };
      });
    }
    await this.context.resume();
    await this.warm();
    this.apply();
  }
  async warm() {
    const key = this.key;
    if (this.warming?.key === key) return this.warming.promise;
    if (!this.cache.has(key)) {
      const maps = new Map();
      const promise = Promise.all(
        this.library.map(async (l) => {
          maps.set(
            l.id,
            l.buffer || (await renderLoop(l, this.bpm, this.transpose)),
          );
        }),
      ).then(() => {
        this.cache.set(key, maps);
        return maps;
      });
      this.warming = { key, promise };
      try {
        return await promise;
      } finally {
        this.warming = null;
      }
    }
    return this.cache.get(key);
  }
  async play() {
    if (this.busy) return;
    this.busy = true;
    this.changed();
    try {
      await this.ready();
      if (this.state === "idle") {
        this.started = this.context.currentTime + 0.06;
        this.startAll(this.started);
      }
      this.state = "running";
      this.timer ??= setInterval(() => this.pump(), 25);
      this.changed();
    } finally {
      this.busy = false;
      this.changed();
    }
  }
  async pause() {
    if (this.state !== "running") return;
    this.state = "paused";
    await this.context.suspend();
    this.changed();
  }
  async toggle() {
    if (this.state === "running") return this.pause();
    return this.play();
  }
  apply(time = this.context?.currentTime) {
    if (!this.context) return;
    const c = this.context;
    this.master.gain.setTargetAtTime(0.8, time, 0.02);
    this.decks.forEach((d, i) => {
      const ch = this.channels[i];
      ch.level.gain.setTargetAtTime(
        d.playing ? 10 ** (d.gain / 20) : 0,
        time,
        0.015,
      );
      d.eq.forEach((v, k) => ch.eq[k].gain.setTargetAtTime(v, time, 0.015));
      ch.mix.gain.setTargetAtTime(
        i === 0
          ? Math.cos(((this.cross / 100) * Math.PI) / 2)
          : Math.sin(((this.cross / 100) * Math.PI) / 2),
        time,
        0.02,
      );
      const solos = d.layers.some((l) => l.solo);
      d.layers.forEach((l) => {
        const live = this.live.get(`${i}:${l.id}`);
        if (live)
          live.level.gain.setTargetAtTime(
            l.on && (!solos || l.solo) ? l.volume / 100 : 0,
            time,
            0.015,
          );
      });
    });
    const dep = this.fx.depth / 100;
    this.filter.frequency.setTargetAtTime(
      this.fx.filter ? 18000 * (160 / 18000) ** dep : 20000,
      time,
      0.04,
    );
    this.echo.delayTime.setTargetAtTime(this.beat * 0.75, time, 0.03);
    this.echoWet.gain.setTargetAtTime(this.fx.echo ? dep * 0.5 : 0, time, 0.04);
    this.roomWet.gain.setTargetAtTime(this.fx.room ? dep * 0.7 : 0, time, 0.04);
    const curve = new Float32Array(1024),
      k = this.fx.drive ? dep * 35 : 0;
    for (let i = 0; i < curve.length; i++) {
      const x = (i * 2) / (curve.length - 1) - 1;
      curve[i] = k ? Math.tanh(x * (1 + k)) / Math.tanh(1 + k) : x;
    }
    this.drive.curve = curve;
  }
  startLayer(i, l, time, reset = false) {
    const id = `${i}:${l.id}`;
    this.endLayer(id, time);
    const loop = this.library.find((x) => x.id === l.id),
      buffer = this.cache.get(this.key)?.get(l.id);
    if (!buffer) return;
    const src = this.context.createBufferSource(),
      level = this.context.createGain();
    src.buffer = buffer;
    src.loop = true;
    let length = Math.min(
      buffer.duration,
      this.decks[i].length * 4 * this.beat,
    );
    src.loopEnd = length;
    src.playbackRate.value = loop.buffer
      ? buffer.duration / (loop.bars * 4 * this.beat)
      : 1;
    if (loop.buffer)
      length = src.loopEnd = Math.min(
        buffer.duration,
        length * src.playbackRate.value,
      );
    level.gain.value = 0;
    src.connect(level).connect(this.channels[i].input);
    const elapsed = reset
      ? 0
      : Math.max(0, time - this.started) * src.playbackRate.value;
    src.start(time, elapsed % length);
    this.live.set(id, { src, level });
    src.onended = () => {
      src.disconnect();
      level.disconnect();
    };
  }
  endLayer(id, time = this.context.currentTime) {
    const voice = this.live.get(id);
    if (!voice) return;
    voice.level.gain.cancelScheduledValues(time);
    voice.level.gain.setTargetAtTime(0, time, 0.005);
    try {
      voice.src.stop(time + 0.03);
    } catch {}
    this.live.delete(id);
  }
  startAll(time, reset = false) {
    this.decks.forEach((d, i) =>
      d.layers.forEach((l) => this.startLayer(i, l, time, reset)),
    );
    this.apply(time);
  }
  queue(label, fn) {
    if (this.state === "idle") {
      fn(0);
      this.changed();
      return;
    }
    const at =
      this.started +
      Math.ceil(
        (this.context.currentTime - this.started + 0.15) / (this.beat * 4),
      ) *
        this.beat *
        4;
    this.jobs.push({ at, label, fn });
    this.changed();
  }
  pump() {
    const now = this.context.currentTime;
    for (const job of this.jobs.filter((j) => j.at <= now + 0.08)) {
      this.jobs.splice(this.jobs.indexOf(job), 1);
      job.fn(job.at);
      this.changed();
    }
    if (this.demo) {
      const b = this.bar;
      if (b >= 56 && !this.finishing) {
        this.finishing = true;
        this.stop().finally(() => {
          this.finishing = false;
        });
      } else {
        const phase = b >= 42 ? 3 : b >= 28 ? 2 : b >= 14 ? 1 : 0;
        if (phase !== this.demoPhase) {
          this.demoPhase = phase;
          this.sceneAt(phase, now);
          this.changed();
        }
        if (b >= 54)
          this.master.gain.setTargetAtTime(
            Math.max(0.001, (0.8 * (56 - this.elapsed / (this.beat * 4))) / 2),
            now,
            0.3,
          );
      }
    }
  }
  async stop() {
    if (this.state === "idle" && !this.recording) return;
    this.demo = false;
    this.dropping = false;
    this.jobs = [];
    this.state = "idle";
    if (this.dropFilter) {
      this.dropFilter.frequency.cancelScheduledValues(this.context.currentTime);
      this.dropFilter.frequency.value = 20;
    }
    if (this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.01);
      await this.finishRecord();
      for (const id of [...this.live.keys()]) this.endLayer(id);
      await this.context.suspend();
    }
    clearInterval(this.timer);
    this.timer = null;
    this.started = undefined;
    this.changed();
  }
  async add(i, id) {
    const d = this.decks[i];
    if (
      d.layers.some((l) => l.id === id) ||
      this.jobs.some((j) => j.label === `add:${i}:${id}`)
    )
      return;
    if (
      d.layers.length +
        this.jobs.filter((j) => j.label.startsWith(`add:${i}:`)).length >=
      8
    )
      throw Error("На деке восемь слоёв. Убери один, чтобы добавить другой.");
    const l = { id, volume: 75, on: true, solo: false };
    if (this.context && !this.cache.get(this.key)?.has(id)) {
      const loop = this.library.find((l) => l.id === id);
      this.cache
        .get(this.key)
        ?.set(
          id,
          loop.buffer || (await renderLoop(loop, this.bpm, this.transpose)),
        );
    }
    this.queue(`add:${i}:${id}`, (time) => {
      d.layers.push(l);
      if (this.state !== "idle") this.startLayer(i, l, time);
      this.apply(time || undefined);
    });
  }
  remove(i, id) {
    this.jobs = this.jobs.filter((j) => j.label !== `add:${i}:${id}`);
    if (this.context) this.endLayer(`${i}:${id}`);
    this.decks[i].layers = this.decks[i].layers.filter((l) => l.id !== id);
    this.changed();
    this.apply();
  }
  layer(i, id, property, value) {
    const l = this.decks[i].layers.find((l) => l.id === id);
    if (!l) return;
    l[property] = value;
    if (property === "on" && value && l.volume === 0) l.volume = 75;
    this.apply();
    this.demo = false;
    this.changed();
  }
  deck(i, property, value) {
    this.decks[i][property] = value;
    this.apply();
    this.demo = false;
    this.changed();
  }
  restart(i) {
    if (this.state === "idle") return;
    this.queue(`restart:${i}`, (time) => {
      this.decks[i].layers.forEach((l) => this.startLayer(i, l, time, true));
      this.apply(time);
    });
  }
  setLength(i, v) {
    this.queue(`length:${i}`, (time) => {
      this.decks[i].length = v;
      if (this.state !== "idle") {
        this.decks[i].layers.forEach((l) => this.startLayer(i, l, time, true));
        this.apply(time);
      }
    });
  }
  async format(bpm, transpose) {
    if (this.formatBusy) return;
    this.formatBusy = true;
    this.changed();
    try {
      const oldBeat = this.beat,
        oldStart = this.started,
        newBpm = bpm,
        newTranspose = transpose; // Prepare before committing the new clock.
      const maps = new Map();
      await Promise.all(
        this.library.map(async (l) =>
          maps.set(
            l.id,
            l.buffer || (await renderLoop(l, newBpm, newTranspose)),
          ),
        ),
      );
      this.queue("format", (time) => {
        const bars = time ? Math.round((time - oldStart) / (oldBeat * 4)) : 0;
        this.bpm = newBpm;
        this.transpose = newTranspose;
        this.cache.set(this.key, maps);
        if (time) {
          this.started = time - bars * this.beat * 4;
          this.startAll(time, true);
        }
        this.jobs = [];
        this.demo = false;
      });
    } finally {
      this.formatBusy = false;
      this.changed();
    }
  }
  effect(name, value) {
    this.fx[name] = value;
    this.apply();
    this.demo = false;
    this.changed();
  }
  mix(value) {
    this.cross = value;
    this.apply();
    this.demo = false;
    this.changed();
  }
  sceneAt(index, time = this.context?.currentTime) {
    const names = ["Вступление", "Развитие", "Кульминация", "Финал"];
    this.scene = names[index];
    this.decks[0].playing = true;
    this.decks[1].playing = index === 2;
    this.cross = [18, 38, 64, 25][index];
    const active = [
      ["motif", "air"],
      ["motif", "air", "bass"],
      ["motif", "air", "bass", "kick"],
      ["motif", "air"],
    ][index];
    for (const l of this.decks[0].layers) {
      l.on = active.includes(l.id);
      l.solo = false;
    }
    for (const l of this.decks[1].layers) {
      l.on = true;
      l.solo = false;
    }
    this.fx.filter = false;
    this.fx.echo = index === 3;
    this.fx.depth = index === 3 ? 45 : 32;
    this.apply(time);
  }
  sceneSelect(index) {
    this.demo = false;
    this.queue("scene", (time) => this.sceneAt(index, time || undefined));
  }
  saveScene() {
    if (this.savedScenes.length >= 4)
      throw Error(
        "Сохранено четыре сцены. Начни новый трек, чтобы очистить их.",
      );
    this.savedScenes.push({
      name: `Моя сцена ${this.savedScenes.length + 1}`,
      decks: structuredClone(this.decks),
      fx: { ...this.fx },
      cross: this.cross,
    });
    this.changed();
  }
  recall(index) {
    const s = this.savedScenes[index];
    this.demo = false;
    this.queue("scene", (time) => {
      for (const id of [...this.live.keys()])
        this.endLayer(id, time || undefined);
      this.decks = structuredClone(s.decks);
      this.fx = { ...s.fx };
      this.cross = s.cross;
      this.scene = s.name;
      if (this.state !== "idle") this.startAll(time);
      this.apply(time || undefined);
    });
  }
  async example() {
    await this.stop();
    this.bpm = 112;
    this.transpose = 0;
    this.decks = initialDecks();
    this.fx = {
      filter: false,
      echo: false,
      room: true,
      drive: false,
      depth: 24,
    };
    this.scene = "Вступление";
    this.demo = true;
    this.demoPhase = -1;
    this.buffer = null;
    await this.play();
    await this.startRecord();
    this.changed();
  }
  async reset() {
    await this.stop();
    this.decks = initialDecks().map((d) => ({
      ...d,
      layers: [],
      playing: true,
    }));
    this.cross = 50;
    this.fx = {
      filter: false,
      echo: false,
      room: false,
      drive: false,
      depth: 32,
    };
    this.savedScenes = [];
    this.scene = "";
    this.buffer = null;
    this.changed();
  }
  async drop() {
    if (this.state !== "running" || this.dropping) return;
    this.demo = false;
    this.dropping = true;
    const t = this.context.currentTime,
      p = this.dropFilter.frequency;
    p.cancelScheduledValues(t);
    p.setValueAtTime(20, t);
    p.exponentialRampToValueAtTime(2200, t + this.beat * 3.6);
    this.queue("drop", (time) => {
      p.cancelScheduledValues(time);
      p.setValueAtTime(20, time);
      for (const id of ["kick", "bass"]) {
        let l = this.decks[0].layers.find((l) => l.id === id);
        if (!l && this.decks[0].layers.length < 8) {
          l = { id, volume: 80, on: true, solo: false };
          this.decks[0].layers.push(l);
          this.startLayer(0, l, time);
        }
        if (l) {
          l.on = true;
          l.volume = Math.max(l.volume, 75);
          l.solo = false;
        }
      }
      this.decks[0].playing = true;
      this.dropping = false;
      this.apply(time);
    });
    this.changed();
  }
  async importFile(file) {
    if (this.library.length >= 40)
      throw Error(
        "В библиотеке уже 40 лупов. Сохрани результат и перезагрузи страницу, чтобы начать заново.",
      );
    if (file.size > 20 * 1024 * 1024) throw Error("Выбери аудиофайл до 20 МБ.");
    await this.ready();
    const buffer = await this.context.decodeAudioData(await file.arrayBuffer());
    if (buffer.duration > 30)
      throw Error("Для лупа нужен фрагмент не длиннее 30 секунд.");
    const l = {
      id: `own-${Date.now()}`,
      name: file.name.replace(/\.[^.]+$/, "").slice(0, 32),
      category: "Свои",
      bars: 4,
      buffer,
    };
    this.library.push(l);
    this.cache.get(this.key).set(l.id, buffer);
    this.changed();
  }
  async saveBeat(grid, swing) {
    if (this.library.length >= 40) throw Error("В библиотеке уже 40 лупов.");
    const l = {
      id: `beat-${Date.now()}`,
      name: `Мой ритм ${this.library.filter((l) => l.grid).length + 1}`,
      category: "Ударные",
      bars: 1,
      grid: structuredClone(grid),
      swing,
    };
    this.library.push(l);
    if (this.context) {
      const buffer = await renderLoop(l, this.bpm, this.transpose);
      this.cache.get(this.key)?.set(l.id, buffer);
    }
    this.changed();
    return l;
  }
  async startRecord() {
    if (this.recording || this.recordStarting) return;
    this.recordStarting = true;
    this.changed();
    try {
      if (this.state !== "running") await this.play();
      const c = this.context;
      if (!c.audioWorklet)
        throw Error("Запись доступна через HTTPS или localhost.");
      this.workletReady ??= c.audioWorklet.addModule(
        new URL("./recorder-worklet.js", import.meta.url),
      );
      await this.workletReady;
      this.buffer = null;
      this.chunks = [];
      const capture = new AudioWorkletNode(c, "spletenie-capture", {
        outputChannelCount: [1],
        processorOptions: { start: c.currentTime, end: Infinity },
      });
      this.recording = capture;
      this.recordStart = c.currentTime;
      this.recordPromise = new Promise(
        (resolve) => (this.resolveRecord = resolve),
      );
      capture.port.onmessage = ({ data }) => {
        if (data.left) this.chunks.push(data);
        if (data.done) this.closeRecord();
      };
      capture.onprocessorerror = () => {
        this.closeRecord();
        this.dispatchEvent(
          new CustomEvent("failure", {
            detail:
              "Запись прервалась. Скачай сохранённую часть и попробуй снова.",
          }),
        );
      };
      this.master.connect(capture);
      capture.connect(c.destination);
      this.changed();
    } finally {
      this.recordStarting = false;
      this.changed();
    }
  }
  async finishRecord() {
    if (!this.recording) return;
    const c = this.context;
    this.recording.port.postMessage({ end: c.currentTime + 0.03 });
    const paused = c.state === "suspended";
    if (paused) {
      this.master.gain.value = 0;
      await c.resume();
    }
    await this.recordPromise;
    if (paused) {
      await c.suspend();
    }
    this.changed();
  }
  closeRecord() {
    if (!this.recording) return;
    const n = this.chunks.reduce((s, c) => s + c.left.length, 0);
    if (n) {
      this.buffer = this.context.createBuffer(2, n, this.context.sampleRate);
      let offset = 0;
      for (const c of this.chunks) {
        this.buffer.getChannelData(0).set(c.left, offset);
        this.buffer.getChannelData(1).set(c.right, offset);
        offset += c.left.length;
      }
    }
    this.master.disconnect(this.recording);
    this.recording.disconnect();
    this.recording = null;
    this.chunks = [];
    this.resolveRecord?.(this.buffer);
    this.changed();
  }
}
