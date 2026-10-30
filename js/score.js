export const TEMPO = 112;
export const DURATION = 120;
export const BEAT = 60 / TEMPO;
export const NOTES = [
  { label: "Ре", key: "A", code: "KeyA", frequency: 293.664768 },
  { label: "Фа", key: "S", code: "KeyS", frequency: 349.228231 },
  { label: "Ля", key: "D", code: "KeyD", frequency: 440 },
  { label: "Ми", key: "F", code: "KeyF", frequency: 329.627557 },
];
export const PARTS = [
  {
    name: "Мотив",
    time: "00:00—00:30",
    values: [0, 0, 20],
    hint: "Слушай мотив. Начни с мягкого, спокойного тембра.",
  },
  {
    name: "Бас",
    time: "00:30—01:00",
    values: [48, 0, 35],
    hint: "Введи низкий бас: та же мелодия получает опору.",
  },
  {
    name: "Ритм",
    time: "01:00—01:30",
    values: [62, 65, 60],
    hint: "Добавь ударные и постепенно усиливай движение.",
  },
  {
    name: "Сплетение",
    time: "01:30—02:00",
    values: [78, 100, 90],
    hint: "Раскрой тембр. Затем по очереди убери партии и заверши трек.",
  },
];
export const BASS = [73.416192, 58.27047, 87.307058, 65.406391];
export const MELODY = [0, null, null, 1, 2, null, 3, null];
export const SCORE = [
  [
    "00:00—00:30 / Мотив",
    "Мягкая мелодия звучит одна. Четыре ноты: Ре, Фа, Ля, Ми. Фильтр прикрыт, атака плавная.",
  ],
  [
    "00:30—01:00 / Бас",
    "Введи бас. Низкие Ре, Си-бемоль, Фа и До меняют опору повторяющегося мотива.",
  ],
  [
    "01:00—01:30 / Ритм",
    "Добавь бочку на долях, малый на второй и четвёртой, хэт между долями. Усиливай движение.",
  ],
  [
    "01:30—02:00 / Сплетение",
    "Раскрой фильтр: все партии звучат вместе. В последние восемь секунд убери ударные и бас, заверши мотив на Ре.",
  ],
];
export function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
