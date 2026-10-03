// Цвет и отдельный рисунок каждой ноты. Аккорды смешивают рисунки.
export const NOTE_MOTION = [
  { color: [101, 116, 255] },
  { color: [119, 128, 255] },
  { color: [137, 149, 255] },
  { color: [155, 159, 255] },
  { color: [169, 148, 227] },
  { color: [183, 164, 236] },
  { color: [195, 184, 245] },
  { color: [211, 216, 255] },
];

export function contourPoint(x, y, line, levels, time, reducedMotion = false) {
  const dx = x - 468,
    dy = (y - 214) * 1.45;
  const angle = Math.atan2(dy, dx),
    radius = Math.hypot(dx, dy);
  const total = levels.reduce((sum, value) => sum + value, 0);
  if (total < 0.001) return [x, y];
  const clock = reducedMotion ? 0 : time;
  let px = x,
    py = y;
  levels.forEach((weight, index) => {
    if (weight < 0.001) return;
    const share = weight / Math.max(1, total);
    const phase = clock * (0.8 + index * 0.2);
    let a = angle,
      r = radius,
      sx = 1,
      sy = 1;
    switch (index) {
      case 0: // Низкая нота: широкая горизонтальная пульсация.
        sx = 1.26 + 0.12 * Math.sin(phase);
        sy = 0.52 + 0.08 * Math.cos(phase);
        break;
      case 1: // Треугольный контур медленно поворачивается.
        r *= 0.84 + 0.21 * Math.cos(3 * angle);
        a += 0.18 * Math.sin(phase);
        break;
      case 2: // Квадрат с округлёнными углами.
        r *=
          0.82 /
          Math.pow(
            Math.pow(Math.abs(Math.cos(angle)), 6) +
              Math.pow(Math.abs(Math.sin(angle)), 6),
            1 / 6,
          );
        a += Math.PI / 4 + 0.1 * Math.sin(phase);
        break;
      case 3: // Вихрь: внутренние и внешние линии закручиваются по-разному.
        a += line * 0.13 + phase * 0.35;
        r *= 0.7 + 0.26 * Math.sin(2 * angle + phase);
        break;
      case 4: // Восьмёрка: два раскрывающихся крыла.
        const spread = 1.05 + 0.13 * Math.sin(phase);
        px += share * (468 + radius * Math.cos(angle) * spread - x);
        py += share * (214 + radius * Math.sin(2 * angle) * 0.47 - y);
        return;
      case 5: // Пять крупных лепестков.
        r *= 0.7 + 0.28 * Math.cos(5 * angle + 0.4 * Math.sin(phase));
        a += 0.12 * Math.sin(phase);
        break;
      case 6: // Шестилучевая звезда с острыми лучами.
        r *= 0.54 + 0.52 * Math.pow((1 + Math.cos(6 * angle)) / 2, 3);
        a += phase * 0.12;
        break;
      case 7: // Высокая нота: частые волны бегут по контуру.
        r *= 0.84 + 0.16 * Math.sin(12 * angle - phase * 2 + line * 0.16);
        break;
    }
    px += share * (468 + Math.cos(a) * r * sx - x);
    py += share * (214 + (Math.sin(a) * r * sy) / 1.45 - y);
  });
  return [px, py];
}
