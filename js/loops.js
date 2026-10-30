// Все заводские партии сочинены и синтезируются локально; аудиофайлы не загружаются.
export const LIBRARY = [
  ["kick", "Ровная бочка", "Ударные", 1],
  ["break", "Ломаный грув", "Ударные", 2],
  ["hats", "Хэты 1/16", "Ударные", 1],
  ["bass", "Глубокий бас", "Бас", 4],
  ["pulse", "Пульс", "Бас", 2],
  ["acid", "Кислотная линия", "Бас", 4],
  ["motif", "Мотив Ре", "Мелодии", 4],
  ["arp", "Арпеджио", "Мелодии", 4],
  ["chords", "Чистые аккорды", "Аккорды", 4],
  ["air", "Воздух", "Атмосфера", 4],
  ["pad", "Тёмный пад", "Атмосфера", 4],
  ["rise", "Подъём", "FX", 2],
].map(([id, name, category, bars]) => ({ id, name, category, bars }));
export const CATEGORIES = [
  "Все",
  "Ударные",
  "Бас",
  "Мелодии",
  "Аккорды",
  "Атмосфера",
  "FX",
];
export const ROOTS = [0, -4, 3, -2];
export const DEFAULT_GRID = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
];
export const DRUM_NAMES = ["Бочка", "Малый", "Хэты", "Клэп", "Шейкер"];
export function initialDecks() {
  return [
    {
      id: "A",
      name: "Тихий мотив",
      description: "Мотив и атмосфера",
      playing: true,
      gain: -3,
      eq: [0, 0, 0],
      length: 4,
      layers: [
        { id: "kick", volume: 80, on: false },
        { id: "bass", volume: 78, on: false },
        { id: "motif", volume: 84, on: true },
        { id: "air", volume: 60, on: true },
      ],
    },
    {
      id: "B",
      name: "Плотный грув",
      description: "Бас и ритм",
      playing: false,
      gain: -1,
      eq: [0, 0, 0],
      length: 4,
      layers: [
        { id: "break", volume: 92, on: true },
        { id: "pulse", volume: 78, on: true },
        { id: "arp", volume: 55, on: true },
        { id: "pad", volume: 40, on: true },
      ],
    },
  ].map((d) => ({
    ...d,
    layers: d.layers.map((l) => ({ ...l, solo: false })),
  }));
}
