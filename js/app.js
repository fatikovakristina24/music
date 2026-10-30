import { Performance } from "./audio/performance.js";
import { PARTS, NOTES, SCORE, formatTime } from "./score.js";
import { downloadWav } from "./audio/wav.js";
import { SoundLines } from "./visuals.js?v=20261030-performance";

export const instrument = new Performance();
const $ = (id) => document.getElementById(id);
const sections = {
  intro: $("intro"),
  performance: $("performance"),
  ending: $("ending"),
};
const ranges = [...document.querySelectorAll("[data-control]")];
const pads = [...document.querySelectorAll("[data-note]")];
const partButtons = [...document.querySelectorAll("[data-part]")];
const held = new Map();
const lines = new SoundLines($("visual"), instrument);
const endingLines = new SoundLines($("ending-visual"), instrument, true);
let busy = false;
function notice(message) {
  $("notice").textContent = message;
  $("notice").hidden = !message;
}
async function safely(action) {
  try {
    await action();
  } catch (error) {
    notice(error.message || "Не удалось выполнить действие. Попробуй ещё раз.");
  }
}
function controls() {
  ranges.forEach((range, i) => {
    const value = instrument.values[i];
    range.value = value;
    range.style.setProperty("--value", value + "%");
    $(range.id + "-value").value = value + " %";
  });
}
function render() {
  const state = instrument.state;
  sections.intro.hidden = state !== "idle";
  sections.ending.hidden = state !== "finished";
  sections.performance.hidden = ["idle", "finished"].includes(state);
  sections.performance.classList.toggle("is-demo", !!instrument.demo);
  $("part-title").textContent = PARTS[instrument.phase].name;
  $("part-number").textContent =
    "СПЛЕТЕНИЕ / " + (instrument.phase + 1) + " ИЗ 4";
  $("gesture-hint").textContent =
    state === "finishing"
      ? "Завершаем звук и сохраняем исполнение…"
      : PARTS[instrument.phase].hint;
  $("next").textContent =
    instrument.phase === 3
      ? "Завершить трек"
      : "Далее: " + PARTS[instrument.phase + 1].name;
  $("next").disabled =
    state !== "running" || !!instrument.pending || !!instrument.demo;
  $("pause").disabled = state !== "running";
  ranges.forEach((input) => {
    input.disabled = state !== "running";
  });
  partButtons.forEach((button, index) => {
    button.setAttribute("aria-current", String(index === instrument.phase));
    button.disabled =
      state !== "running" ||
      index !== instrument.phase + 1 ||
      !!instrument.demo;
    button.classList.toggle("queued", instrument.pending?.index === index);
  });
  $("transition-hint").textContent =
    state === "finishing"
      ? "Подготовка WAV…"
      : instrument.pending
        ? "Подготовлен переход: " +
          PARTS[instrument.pending.index].name +
          " / " +
          formatTime(instrument.pending.at)
        : instrument.demo
          ? "Звучит подготовленная композиция. Ползунками и нотами можно менять её исполнение."
          : instrument.phase < 3
            ? "Следующая часть: " + formatTime((instrument.phase + 1) * 30)
            : "В конце убери партии и заверши трек.";
  $("download").disabled = !instrument.buffer;
  if (instrument.buffer)
    $("ending-duration").textContent =
      "Исполнение завершено / " + formatTime(instrument.buffer.duration + 0.01);
  if (state === "paused" && !$("score-dialog").open && !$("pause-dialog").open)
    $("pause-dialog").showModal();
  if (state !== "paused" && $("pause-dialog").open) $("pause-dialog").close();
  controls();
}
async function begin(demo) {
  if (busy) return;
  busy = true;
  notice("");
  $("start").disabled = $("demo").disabled = true;
  try {
    await instrument.start(demo);
    window.scrollTo({ top: 0 });
  } finally {
    busy = false;
    $("start").disabled = $("demo").disabled = false;
  }
}
$("start").addEventListener("click", () => safely(() => begin(false)));
$("demo").addEventListener("click", () => safely(() => begin(true)));
ranges.forEach((input, index) =>
  input.addEventListener("input", () =>
    instrument.setValue(index, input.value),
  ),
);
partButtons.forEach((button, index) =>
  button.addEventListener("click", () => instrument.arm(index)),
);
$("next").addEventListener("click", () =>
  safely(() =>
    instrument.phase === 3
      ? instrument.finish()
      : instrument.arm(instrument.phase + 1),
  ),
);

async function noteDown(token, index) {
  if (held.has(token) || instrument.state !== "running") return;
  const entry = { index, released: false, until: Infinity };
  held.set(token, entry);
  try {
    const voice = await instrument.live(index);
    entry.release = voice.release;
    entry.until = voice.until;
    if (entry.released || instrument.state !== "running") voice.release();
  } catch (error) {
    held.delete(token);
    notice(error.message);
  }
}
function noteUp(token) {
  const entry = held.get(token);
  if (!entry) return;
  entry.released = true;
  entry.release?.();
  held.delete(token);
}
function releaseAll() {
  for (const key of [...held.keys()]) noteUp(key);
}
pads.forEach((pad, index) => {
  pad.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pad.setPointerCapture(event.pointerId);
    safely(() => noteDown("pointer:" + event.pointerId, index));
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    pad.addEventListener(type, (event) => noteUp("pointer:" + event.pointerId));
  pad.addEventListener("keydown", (event) => {
    if (["Enter", " "].includes(event.key) && !event.repeat) {
      event.preventDefault();
      safely(() => noteDown("pad:" + index, index));
    }
  });
  pad.addEventListener("keyup", (event) => {
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      noteUp("pad:" + index);
    }
  });
});
window.addEventListener("keydown", (event) => {
  if (
    $("score-dialog").open ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  const editing = event.target.matches("input,textarea,select");
  if (editing) return;
  const index = NOTES.findIndex((note) => note.code === event.code);
  if (index >= 0) {
    event.preventDefault();
    safely(() => noteDown(event.code, index));
  }
  if (/^Digit[1-4]$/.test(event.code)) {
    event.preventDefault();
    instrument.arm(Number(event.code.slice(-1)) - 1);
  }
  if (event.code === "Space" && !event.target.matches("button")) {
    event.preventDefault();
    safely(() =>
      instrument.state === "paused" ? instrument.resume() : pause(),
    );
  }
});
window.addEventListener("keyup", (event) => noteUp(event.code));
window.addEventListener("blur", releaseAll);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseAll();
    if (instrument.state === "running") safely(pause);
  }
});

async function pause() {
  releaseAll();
  await instrument.pause();
}
$("pause").addEventListener("click", () => safely(pause));
$("resume").addEventListener("click", () => safely(() => instrument.resume()));
$("pause-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  safely(() => instrument.resume());
});
$("finish-paused").addEventListener("click", () =>
  safely(() => instrument.finish()),
);
document.querySelectorAll("[data-score]").forEach((button) =>
  button.addEventListener("click", () =>
    safely(async () => {
      if (instrument.state === "running") await pause();
      if ($("pause-dialog").open) $("pause-dialog").close();
      $("score-dialog").showModal();
    }),
  ),
);
$("close-score").addEventListener("click", () => $("score-dialog").close());
$("score-dialog").addEventListener("close", render);
$("again").addEventListener("click", () => {
  releaseAll();
  instrument.state = "idle";
  instrument.offset = 0;
  instrument.phase = 0;
  render();
  window.scrollTo({ top: 0 });
});
$("download").addEventListener("click", () =>
  safely(async () => {
    if (!instrument.buffer) return;
    $("download").disabled = true;
    try {
      downloadWav(instrument.buffer, "spletenie-performance.wav");
    } finally {
      $("download").disabled = false;
    }
  }),
);
for (const [title, description] of SCORE) {
  const section = document.createElement("section");
  section.className = "score-part";
  const heading = document.createElement("h3"),
    paragraph = document.createElement("p");
  heading.textContent = title;
  paragraph.textContent = description;
  section.append(heading, paragraph);
  $("score-parts").append(section);
}
instrument.addEventListener("change", render);
instrument.addEventListener("failure", (event) => notice(event.detail));
let last = 0;
function frame(time) {
  if (time - last >= 30) {
    last = time;
    $("clock").textContent = formatTime(instrument.elapsed);
    const now = instrument.context?.currentTime || 0;
    const active = new Set();
    if (instrument.state === "running") {
      for (const note of instrument.notes)
        if (note.start <= instrument.elapsed && note.end > instrument.elapsed)
          active.add(note.index);
      for (const [key, note] of held) {
        if (now >= note.until) {
          held.delete(key);
          continue;
        }
        active.add(note.index);
      }
      controls();
    }
    pads.forEach((pad, index) => {
      pad.classList.toggle("sounding", active.has(index));
      pad.setAttribute("aria-pressed", String(active.has(index)));
    });
    if (!sections.performance.hidden) lines.draw(time);
    if (!sections.ending.hidden) endingLines.draw(time);
  }
  requestAnimationFrame(frame);
}
render();
requestAnimationFrame(frame);
