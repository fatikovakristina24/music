// У каждой ноты свой ритм, изгиб и оттенок. Аккорд смешивает их влияние.
export const NOTE_MOTION = [
  {
    lobes: 2,
    depth: 26,
    speed: 0.7,
    twist: 0,
    stretch: 0.1,
    color: [101, 116, 255],
  },
  {
    lobes: 3,
    depth: 34,
    speed: 0.9,
    twist: 0.05,
    stretch: 0,
    color: [119, 128, 255],
  },
  {
    lobes: 4,
    depth: 38,
    speed: 1.05,
    twist: -0.04,
    stretch: 0,
    color: [137, 149, 255],
  },
  {
    lobes: 3,
    depth: 29,
    speed: 0.8,
    twist: 0.24,
    stretch: 0.02,
    color: [155, 159, 255],
  },
  {
    lobes: 2,
    depth: 40,
    speed: 1.1,
    twist: -0.12,
    stretch: -0.04,
    color: [169, 148, 227],
  },
  {
    lobes: 6,
    depth: 28,
    speed: 1.4,
    twist: 0.07,
    stretch: 0,
    color: [183, 164, 236],
  },
  {
    lobes: 7,
    depth: 31,
    speed: 1.65,
    twist: -0.07,
    stretch: 0,
    color: [195, 184, 245],
  },
  {
    lobes: 9,
    depth: 23,
    speed: 1.9,
    twist: 0.12,
    stretch: -0.06,
    color: [211, 216, 255],
  },
];

export function contourPoint(x, y, line, levels, time, reducedMotion = false) {
  const dx = x - 468,
    dy = y - 214;
  const angle = Math.atan2(dy * 1.45, dx);
  const total = levels.reduce((sum, value) => sum + value, 0);
  if (total < 0.001) return [x, y];
  const strength = Math.min(1, total);
  let radial = 0,
    rotation = 0,
    stretch = 0;
  levels.forEach((weight, index) => {
    if (weight < 0.001) return;
    const profile = NOTE_MOTION[index];
    const phase = (reducedMotion ? 0 : time * profile.speed) + index * 0.6;
    const share = weight / Math.max(1, total);
    radial +=
      share *
      profile.depth *
      (Math.sin(angle * profile.lobes + phase + line * 0.075) +
        0.24 *
          Math.sin(angle * (profile.lobes + 2) - phase * 0.7 + line * 0.2));
    rotation += share * profile.twist * Math.sin(phase + line * 0.09);
    stretch += share * profile.stretch * Math.cos(phase);
  });
  const rx = dx * (1 + stretch) + Math.cos(angle) * radial;
  const ry =
    dy * (1 - 0.12 * strength - stretch * 0.3) +
    Math.sin(angle) * radial * 0.68;
  return [
    468 + rx * Math.cos(rotation) - ry * Math.sin(rotation),
    214 + rx * Math.sin(rotation) + ry * Math.cos(rotation),
  ];
}
