// Короткие одноголосные версии знакомых тем.
// Запись: высота ноты и длительность в долях; R обозначает паузу.
const themes = [
  [
    "Judas",
    "Lady Gaga · короткий фрагмент",
    124,
    "Eb4 F4 G4 Ab4:.5 G4:.5 Ab4 Ab4:.5 G4:.5 G4 Eb4 Ab4 G4 Eb4:1.5 F4:.5 G4:.5 F4:.5 F4:1.5 Eb4:1.5 R:1",
  ],
  [
    "Ода к радости",
    "Бетховен",
    116,
    "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2",
  ],
  [
    "К Элизе",
    "Бетховен",
    132,
    "E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:1.5 R:.5 C4:.5 E4:.5 A4:.5 B4:1.5 R:.5 E4:.5 G#4:.5 B4:.5 C5:1.5 R:.5 E4:.5 E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:2",
  ],
  [
    "Турецкий марш",
    "Моцарт",
    120,
    "B4:.5 A4:.5 G#4:.5 A4:.5 C5:1 R:.5 D5:.5 C5:.5 B4:.5 C5:.5 E5:1 R:.5 F5:.5 E5:.5 D#5:.5 E5:.5 B5:.5 A5:.5 G#5:.5 A5:.5 B5:.5 A5:.5 G#5:.5 A5:.5 C6:1 A5:1 C6:1 A5:1",
  ],
  [
    "В пещере горного короля",
    "Григ",
    112,
    "B3:.5 C#4:.5 D4:.5 E4:.5 F#4:.5 D4:.5 F#4:1 F4:.5 C#4:.5 F4:1 E4:.5 C4:.5 E4:1 B3:.5 C#4:.5 D4:.5 E4:.5 F#4:.5 D4:.5 F#4:.5 B4:.5 A4:.5 F#4:.5 D4:.5 F#4:.5 A4:2",
  ],
  [
    "Хабанера",
    "Бизе · Кармен",
    108,
    "D5:.5 C#5:.5 C5:.5 B4:.5 Bb4:.5 A4:.5 G#4:.5 G4:.5 F#4:.5 F4:.5 E4:.5 Eb4:.5 D4:1 R:1 D4:.5 F4:.5 A4:1 G4:.5 F4:.5 E4:.5 F4:.5 G4:1 F4:.5 E4:.5 D4:2",
  ],
  [
    "Маленькая ночная серенада",
    "Моцарт",
    132,
    "G4:1 D4:.5 G4:.5 B4:1 G4:.5 B4:.5 D5:2 R:1 C5:1 A4:1 C5:1 E5:2 D5:.5 C5:.5 B4:1 G4:.5 B4:.5 A4:1 F#4:.5 A4:.5 G4:2",
  ],
  [
    "Свадебный марш",
    "Мендельсон",
    112,
    "C5:.5 C5:.5 C5:.5 C5:.5 C5:2 C5:.5 C5:.5 C5:.5 C5:.5 C5:2 C5:1 G4:.5 A4:.5 B4:1 C5:1 D5:1 E5:2 D5:.5 C5:.5 B4:1 G4:1 A4:1 B4:1 C5:3",
  ],
  [
    "Twinkle, Twinkle, Little Star",
    "Народная мелодия",
    108,
    "C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2",
  ],
  [
    "Jingle Bells",
    "Джеймс Пьерпонт",
    132,
    "E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 E4 D4 D4 E4 D4:2 G4:2",
  ],
  [
    "We Wish You a Merry Christmas",
    "Народная мелодия",
    138,
    "G4 C5 C5:.5 D5:.5 C5:.5 B4:.5 A4:1 A4 D5 D5:.5 E5:.5 D5:.5 C5:.5 B4:1 G4 E5 E5:.5 F5:.5 E5:.5 D5:.5 C5:1 A4 G4:.5 G4:.5 A4 D5 B4 C5:3",
  ],
  [
    "Тихая ночь",
    "Франц Грубер",
    90,
    "G4:1.5 A4:.5 G4 E4:3 G4:1.5 A4:.5 G4 E4:3 D5:2 D5 B4:3 C5:2 C5 G4:3 A4:2 A4 C5:1.5 B4:.5 A4 G4:1.5 A4:.5 G4 E4:3",
  ],
  [
    "Братец Яков",
    "Народная мелодия",
    112,
    "C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2",
  ],
  [
    "London Bridge",
    "Народная мелодия",
    116,
    "G4:1.5 A4:.5 G4 F4 E4 F4 G4:2 D4 E4 F4:2 E4 F4 G4:2 G4:1.5 A4:.5 G4 F4 E4 F4 G4:2 D4:2 G4:2 E4 C4:3",
  ],
  [
    "Mary Had a Little Lamb",
    "Народная мелодия",
    112,
    "E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:3",
  ],
  [
    "Old MacDonald",
    "Народная мелодия",
    116,
    "C4 C4 C4 G3 A3 A3 G3:2 E4 E4 D4 D4 C4:2 R:1 G3 C4 C4 C4 G3 A3 A3 G3:2 E4 E4 D4 D4 C4:3",
  ],
  [
    "Row, Row, Row Your Boat",
    "Народная мелодия",
    120,
    "C4:1.5 C4:.5 C4 D4:.5 E4:1.5 E4 D4:.5 E4 F4:.5 G4:3 C5:.5 C5:.5 C5:.5 G4:.5 G4:.5 G4:.5 E4:.5 E4:.5 E4:.5 C4:.5 C4:.5 C4:.5 G4:1.5 F4:.5 E4 D4:.5 C4:3",
  ],
  [
    "Greensleeves",
    "Народная мелодия",
    112,
    "A4 C5:2 D5 E5:1.5 F5:.5 E5 D5:2 B4 G4:1.5 A4:.5 B4 C5:2 A4 A4:1.5 G#4:.5 A4 B4:2 G#4 E4:2 A4 C5:2 D5 E5:1.5 F5:.5 E5 D5:2 B4 G4:1.5 A4:.5 B4 C5:1.5 B4:.5 A4 G#4:1.5 F#4:.5 G#4 A4:3",
  ],
  [
    "Коробейники",
    "Народная мелодия",
    138,
    "E5 B4:.5 C5:.5 D5 C5:.5 B4:.5 A4 A4:.5 C5:.5 E5 D5:.5 C5:.5 B4:1.5 C5:.5 D5 E5 C5 A4 A4:2 R:.5 D5 F5 A5 G5:.5 F5:.5 E5:1.5 C5:.5 E5 D5:.5 C5:.5 B4 B4:.5 C5:.5 D5 E5 C5 A4 A4:2",
  ],
  [
    "Калинка",
    "Иван Ларионов",
    124,
    "A4:.5 G4:.5 A4:.5 B4:.5 C5 A4 A4:.5 G4:.5 A4:.5 B4:.5 C5 A4 A4:.5 G4:.5 A4:.5 B4:.5 C5 B4:.5 A4:.5 G4:.5 F4:.5 E4:.5 F4:.5 G4 E4 A4:.5 G4:.5 A4:.5 B4:.5 C5 A4:2",
  ],
  [
    "Во поле берёза стояла",
    "Народная мелодия",
    112,
    "A4 A4 A4 G4 F4 F4 E4:2 D4 E4 F4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4:2 R:1 F4 F4 E4 E4 D4:3",
  ],
];

const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const padOffsets = [0, 2, 4, 5, 7, 9, 11];
export const MELODIES = themes.map(([title, author, bpm, score], id) => {
  let time = 0;
  const notes = [];
  for (const token of score.split(" ")) {
    const [pitch, beats = "1"] = token.split(":");
    const duration = (Number(beats) * 60) / bpm;
    if (pitch !== "R") {
      const [, letter, accidental, octave] = /^([A-G])([#b]?)(\d)$/.exec(pitch);
      const midi =
        (Number(octave) + 1) * 12 +
        semitones[letter] +
        (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
      const pitchClass = (midi + 12) % 12;
      // Хроматические ноты звучат точно, ближайший пэд показывает их движение.
      let index = padOffsets.reduce(
        (best, offset, i) =>
          Math.abs(offset - pitchClass) <
          Math.abs(padOffsets[best] - pitchClass)
            ? i
            : best,
        0,
      );
      if (pitchClass === 0 && midi >= 72) index = 7;
      notes.push({
        index,
        frequency: 440 * 2 ** ((midi - 69) / 12),
        time,
        duration: duration * 0.88,
      });
    }
    time += duration;
  }
  return { id, title, author, notes, duration: time };
});

export class MelodyPlayer extends EventTarget {
  constructor(engine) {
    super();
    this.engine = engine;
    this.voices = new Set();
    this.generation = 0;
    this.playing = false;
    this.selected = null;
  }
  changed() {
    this.dispatchEvent(new Event("change"));
  }
  async play(melody) {
    this.stop();
    const generation = this.generation;
    await this.engine.ready();
    if (generation !== this.generation) return;
    this.selected = melody;
    this.playing = true;
    this.started = this.engine.context.currentTime + 0.04;
    this.next = 0;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
    this.changed();
  }
  schedule() {
    const now = this.engine.context.currentTime;
    const horizon = now + 0.12;
    while (
      this.next < this.selected.notes.length &&
      this.started + this.selected.notes[this.next].time < horizon
    ) {
      const note = this.selected.notes[this.next++];
      this.voices.add(
        this.engine.noteOn(
          note.index,
          this.started + note.time,
          note.duration,
          note.frequency,
        ),
      );
    }
    for (const voice of this.voices)
      if (voice.end <= now) this.voices.delete(voice);
    if (
      this.next === this.selected.notes.length &&
      now >= this.started + this.selected.duration &&
      !this.voices.size
    ) {
      clearInterval(this.timer);
      this.playing = false;
      this.changed();
    }
  }
  stop() {
    this.generation++;
    clearInterval(this.timer);
    for (const voice of this.voices) voice.kill();
    this.voices.clear();
    this.playing = false;
    this.changed();
  }
}
