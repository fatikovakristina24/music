import { AudioEngine, NOTES } from "./audio/engine.js";
import { NoteLoop, LOOP_LIMIT_SECONDS } from "./loop.js";
import { VoiceRecorder, VOICE_LIMIT_SECONDS } from "./voice.js";
import { SoundVisuals } from "./visuals.js";

const $ = (selector) => document.querySelector(selector);
// Масштабируем весь desktop-макет, сохраняя его композицию.
function fitStudio() {
  $(".instrument").style.zoom = Math.min(1, window.innerWidth / 1440);
}
fitStudio();
window.addEventListener("resize", fitStudio);
const engine = new AudioEngine();
const loop = new NoteLoop(engine);
const voice = new VoiceRecorder(engine);
const held = new Map();
let mode = "play",
  inputGeneration = 0;
const releases = Array(NOTES.length).fill(0);
const decimals = (number) => number.toFixed(1);
const signed = (number) => (number > 0 ? `+${number}` : `${number}`);

const synthParameters = [
  {
    name: "release",
    label: "Длина звука",
    min: 0.1,
    max: 4,
    step: 0.1,
    value: 1.8,
    format: (value) => `${decimals(value)} s`,
  },
  {
    name: "echo",
    label: "Эхо",
    min: 0,
    max: 60,
    step: 1,
    value: 24,
    format: (value) => `${value} %`,
  },
  {
    name: "volume",
    label: "Громкость",
    min: 0,
    max: 100,
    step: 1,
    value: 65,
    format: (value) => `${value} %`,
  },
];
const voiceParameters = [
  {
    name: "pitch",
    label: "Высота голоса",
    min: -12,
    max: 12,
    step: 1,
    value: 0,
    format: signed,
  },
  {
    name: "child",
    label: "Детский голос",
    min: 0,
    max: 100,
    step: 1,
    value: 0,
  },
  {
    name: "robot",
    label: "Робот",
    min: 0,
    max: 100,
    step: 1,
    value: 0,
  },
  {
    name: "echo",
    label: "Эхо",
    min: 0,
    max: 60,
    step: 1,
    value: 0,
  },
  {
    name: "room",
    label: "Комната",
    min: 0,
    max: 100,
    step: 1,
    value: 0,
  },
  {
    name: "distortion",
    label: "Искажение",
    min: 0,
    max: 100,
    step: 1,
    value: 0,
  },
  {
    name: "radio",
    label: "Радио",
    min: 0,
    max: 100,
    step: 1,
    value: 0,
  },
];

function slider(container, config, prefix, onChange) {
  const id = `${prefix}-${config.name}`,
    format = config.format || ((value) => `${value} %`);
  const element = document.createElement("div");
  element.className = "slider";
  element.innerHTML = `<div class="slider-top"><label for="${id}">${config.label}</label><output for="${id}"></output></div><input id="${id}" type="range" min="${config.min}" max="${config.max}" step="${config.step}" value="${config.value}">`;
  const input = element.querySelector("input"),
    output = element.querySelector("output");
  const display = () => {
    const value = Number(input.value);
    output.value = format(value);
    input.style.setProperty(
      "--progress",
      `${((value - config.min) / (config.max - config.min)) * 100}%`,
    );
    input.setAttribute("aria-valuetext", `${config.label}: ${format(value)}`);
  };
  input.addEventListener("input", () => {
    display();
    onChange(config.name, Number(input.value));
  });
  display();
  container.append(element);
  return { input, display };
}
for (const config of synthParameters)
  slider($("#synth-sliders"), config, "synth", (name, value) =>
    engine.updateSynth(name, value),
  );
const effectSliders = new Map(
  voiceParameters.map((config) => [
    config.name,
    slider($("#voice-sliders"), config, "effect", (name, value) =>
      engine.updateEffect(name, value),
    ),
  ]),
);

const pads = NOTES.map((note, index) => {
  const button = document.createElement("button");
  button.className = "pad";
  button.type = "button";
  button.innerHTML = `<span class="key">${note.key}</span><span class="note">${note.label}</span>`;
  const wave = Array.from({ length: 109 }, (_, x) => {
    const y =
      122 +
      Math.sin((x / 108) * Math.PI * 2 * (1 + index * 0.27)) *
        4 *
        Math.sin((Math.PI * x) / 108);
    return `${x ? "L" : "M"} ${20 + x} ${y.toFixed(2)}`;
  }).join(" ");
  button.insertAdjacentHTML(
    "beforeend",
    `<svg class="pad-wave" viewBox="0 0 154 144" preserveAspectRatio="none" aria-hidden="true"><path d="${wave}" /></svg>`,
  );
  button.setAttribute(
    "aria-label",
    `${note.label}${index === 7 ? ", выше на октаву" : ""} — клавиша ${note.key}`,
  );
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    button.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    noteOn(`pointer-${event.pointerId}`, index);
  });
  button.addEventListener("pointerup", (event) =>
    noteOff(`pointer-${event.pointerId}`),
  );
  button.addEventListener("pointercancel", (event) =>
    noteOff(`pointer-${event.pointerId}`),
  );
  button.addEventListener("lostpointercapture", (event) =>
    noteOff(`pointer-${event.pointerId}`),
  );
  button.addEventListener("keydown", (event) => {
    if (["Space", "Enter"].includes(event.code)) {
      event.preventDefault();
      if (!event.repeat) noteOn(`pad-key-${index}`, index);
    }
  });
  button.addEventListener("keyup", (event) => {
    if (["Space", "Enter"].includes(event.code)) {
      event.preventDefault();
      noteOff(`pad-key-${index}`);
    }
  });
  button.addEventListener("blur", () => noteOff(`pad-key-${index}`));
  $("#pads").append(button);
  return button;
});

async function noteOn(token, index) {
  if (mode !== "play" || held.has(token)) return;
  const generation = inputGeneration;
  const note = { index, voice: null, released: false };
  held.set(token, note);
  try {
    await engine.ready();
    if (generation !== inputGeneration) return;
    // Даже короткий первый клик звучит, пока браузер включает аудио.
    note.voice = engine.noteOn(
      index,
      engine.context.currentTime,
      note.released ? 0.04 : null,
    );
    loop.noteOn(token, index);
    if (note.released) loop.noteOff(token);
  } catch (error) {
    held.delete(token);
    showError(error, "Не удалось включить звук");
  }
}
function noteOff(token) {
  const note = held.get(token);
  if (!note) return;
  note.released = true;
  note.voice?.stop(engine.context.currentTime, engine.synthSettings.release);
  if (note.voice)
    releases[note.index] =
      engine.context.currentTime + engine.synthSettings.release;
  loop.noteOff(token);
  held.delete(token);
}
function releaseHeld() {
  inputGeneration++;
  for (const token of held.keys()) noteOff(token);
}

document.addEventListener("keydown", (event) => {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    document.querySelector("dialog[open]")
  )
    return;
  const element = event.target;
  if (element.matches('input, textarea, select, [contenteditable="true"]'))
    return;
  if (mode === "voice" && event.code === "Space" && element === document.body) {
    event.preventDefault();
    if (!event.repeat) safe(() => voice.play());
    return;
  }
  const index = NOTES.findIndex((note) => note.code === event.code);
  if (index >= 0 && mode === "play") {
    event.preventDefault();
    if (!event.repeat) noteOn(event.code, index);
  }
});
document.addEventListener("keyup", (event) => noteOff(event.code));
window.addEventListener("blur", releaseHeld);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseHeld();
    loop.finishRecording();
    loop.stopPlayback();
    voice.leave();
  }
});
window.addEventListener("pagehide", () => {
  releaseHeld();
  loop.clear();
  voice.leave();
  voice.cleanupMicrophone();
  engine.stopAll();
});

function setMode(value) {
  if (value === mode) return;
  releaseHeld();
  loop.finishRecording();
  loop.stopPlayback();
  engine.stopAll();
  voice.leave();
  mode = value;
  engine.setSynthEnabled(value === "play");
  $("#play-screen").hidden = value !== "play";
  $("#voice-screen").hidden = value !== "voice";
  for (const name of ["play", "voice"]) {
    $(`#mode-${name}`).classList.toggle("selected", name === value);
    $(`#mode-${name}`).setAttribute("aria-pressed", String(name === value));
  }
  if (visuals) {
    visuals.mode = value;
    visuals.energy = 0;
    visuals.resize();
  }
}
$("#mode-play").addEventListener("click", () => setMode("play"));
$("#mode-voice").addEventListener("click", () => setMode("voice"));
document.querySelectorAll("[data-preset]").forEach((button) =>
  button.addEventListener("click", () => {
    engine.updateSynth("preset", button.dataset.preset);
    document.querySelectorAll("[data-preset]").forEach((other) => {
      const selected = other === button;
      other.classList.toggle("selected", selected);
      other.setAttribute("aria-pressed", String(selected));
    });
  }),
);

$("#loop-record").addEventListener("click", () =>
  safe(async () => {
    await engine.ready();
    if (loop.state === "recording") loop.finishRecording();
    else loop.startRecording();
  }),
);
$("#loop-play").addEventListener("click", () =>
  safe(async () => {
    await engine.ready();
    if (loop.state === "playing") loop.stopPlayback();
    else loop.startPlayback();
  }),
);
$("#loop-clear").addEventListener("click", () => loop.clear());
loop.addEventListener("change", updateLoop);
function updateLoop() {
  const recording = loop.state === "recording",
    playing = loop.state === "playing";
  $("#loop-record").textContent = recording ? "■ Остановить" : "● Записать";
  $("#loop-record").classList.toggle("active", recording);
  $("#loop-play").textContent = playing ? "Ⅱ Пауза" : "▶ Повтор";
  $("#loop-play").classList.toggle("active", playing);
  $("#loop-play").disabled = !loop.notes.length || recording;
  $("#loop-clear").disabled = loop.state === "empty" || recording;
  $("#loop-status").textContent = recording
    ? `Записываем · 0.0 / ${decimals(LOOP_LIMIT_SECONDS)} с`
    : playing
      ? `Повторяем · ${decimals(loop.duration)} секунды`
      : loop.notes.length
        ? `Фраза · ${decimals(loop.duration)} секунды`
        : "Сначала запиши свою мелодию →";
}

$("#voice-record").addEventListener("click", () => safe(() => voice.record()));
$("#voice-play").addEventListener("click", () => safe(() => voice.play()));
$("#voice-reset").addEventListener("click", () => {
  engine.resetEffects();
  updateVoice();
});
$("#voice-delete").addEventListener("click", () => voice.delete());
$("#voice-download").addEventListener("click", () =>
  safe(() => voice.download(), "Не удалось сохранить запись"),
);
voice.addEventListener("change", updateVoice);
voice.addEventListener("error", (event) => showError(event.detail));

function updateVoice() {
  const recording = voice.state === "recording";
  const busy = ["requesting", "processing", "loading"].includes(voice.state);
  const playing = voice.state === "playing",
    hasRecording = !!voice.buffer;
  const enabled = hasRecording && !recording && !busy;
  $("#voice-record").disabled = busy;
  $("#voice-record").textContent = recording
    ? "■ Закончить запись"
    : voice.state === "requesting"
      ? "Разреши микрофон…"
      : "● Записать голос";
  $("#voice-play").disabled = !enabled;
  $("#voice-play").textContent = playing
    ? "Ⅱ Пауза"
    : voice.state === "paused"
      ? "▶ Продолжить"
      : "▶ Послушать";
  $("#voice-reset").disabled = $("#voice-delete").disabled = !enabled;
  $("#voice-effects").disabled = !enabled;
  $("#voice-download").disabled = !enabled || voice.exporting;
  $("#voice-download").textContent = voice.exporting
    ? "Сохраняем…"
    : "Скачать запись ↓";
  $("#voice-summary").textContent = recording
    ? "Идёт запись…"
    : voice.state === "processing"
      ? "Готовим запись…"
      : hasRecording
        ? `Запись · ${decimals(voice.buffer.duration)} секунды`
        : "Пока нет записи";
  $("#voice-caption").textContent = recording
    ? "Твой голос становится формой"
    : playing
      ? "Теперь твой голос звучит иначе"
      : hasRecording
        ? "Твой голос готов к эксперименту"
        : "У каждого голоса есть своя форма";
  $("#voice-heading").textContent = recording
    ? "Говори — мы слушаем"
    : hasRecording
      ? "Послушай, что получилось"
      : "Начни со своего голоса";
  $("#voice-description").textContent = recording
    ? `Запись закончится через ${VOICE_LIMIT_SECONDS} секунд. Можно остановить её раньше.`
    : hasRecording
      ? "Меняй эффекты справа и слушай результат. Исходный голос сохраняется."
      : `Нажми «Записать голос» и скажи что-нибудь. Можно записать до ${VOICE_LIMIT_SECONDS} секунд.`;
  $("#voice-status").textContent = recording
    ? `Записываем · 0.0 / ${decimals(VOICE_LIMIT_SECONDS)} с`
    : playing
      ? "Слушаем запись…"
      : hasRecording
        ? `Твоя запись · ${decimals(voice.buffer.duration)} секунды`
        : "Запиши фразу — и посмотри, как она звучит ↓";
  for (const [name, { input, display }] of effectSliders) {
    input.value = engine.effects[name];
    display();
  }
}

const help = $("#help-dialog");
$("#help-open").addEventListener("click", () => {
  releaseHeld();
  help.showModal();
});
for (const id of ["#help-close", "#help-done"])
  $(id).addEventListener("click", () => help.close());
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      dialog.close();
  });
$("#message-close").addEventListener("click", () =>
  $("#message-dialog").close(),
);
function showError(error, title = "Не удалось начать запись") {
  console.error(error);
  const messages = {
    NotAllowedError:
      "Доступ к микрофону не разрешён. Разреши его в настройках сайта в браузере и попробуй снова.",
    NotFoundError:
      "Микрофон не найден. Подключи его или выбери встроенный микрофон в настройках системы.",
    NotReadableError:
      "Микрофон сейчас недоступен. Проверь, не занят ли он другой программой, и попробуй снова.",
  };
  $("#message-title").textContent = title;
  $("#message-body").textContent =
    messages[error.name] || error.message || "Попробуй ещё раз.";
  if (!$("#message-dialog").open) $("#message-dialog").showModal();
}
async function safe(action, title) {
  try {
    await action();
  } catch (error) {
    showError(error, title);
  }
}

let visuals;
try {
  const response = await fetch(
    new URL("../assets/contours.json?v=2", import.meta.url),
  );
  if (!response.ok)
    throw new Error(
      "Не удалось загрузить форму. Проверь файлы в папке assets.",
    );
  const geometry = await response.json();
  visuals = new SoundVisuals(engine, voice, geometry, (now) => {
    if (mode === "play") {
      const sounding = [...engine.voices].filter(
        (v) => v.start <= now && v.end > now,
      );
      for (let index = 0; index < pads.length; index++) {
        const pressed =
          [...held.values()].some((v) => v.index === index) ||
          sounding.some((v) => v.index === index && v.gateEnd > now);
        pads[index].classList.toggle("pressed", pressed);
        pads[index].classList.toggle(
          "releasing",
          !pressed &&
            (releases[index] > now || sounding.some((v) => v.index === index)),
        );
        pads[index].setAttribute("aria-pressed", String(pressed));
      }
      const active = sounding.length > 0;
      $("#synth-stage").classList.toggle("sounding", active);
      $("#synth-caption").textContent = active
        ? sounding.length > 1
          ? "Сейчас звучит аккорд"
          : "Звучит твоя первая нота"
        : "Твой звук начинается здесь";
      const labels = [...new Set(sounding.map((v) => NOTES[v.index].label))];
      $("#synth-status").textContent = active
        ? labels.join(" + ")
        : "Нажми любую ноту внизу ↓";
      if (loop.state === "recording")
        $("#loop-status").textContent =
          `Записываем · ${decimals(loop.elapsed)} / ${decimals(LOOP_LIMIT_SECONDS)} с`;
    } else {
      if (voice.state === "recording")
        $("#voice-status").textContent =
          `Записываем · ${decimals(voice.elapsed)} / ${decimals(VOICE_LIMIT_SECONDS)} с`;
      if (voice.state === "playing")
        $("#voice-status").textContent =
          `Слушаем запись · ${decimals(voice.elapsed)} / ${decimals(voice.buffer.duration)} секунды`;
    }
  });
} catch (error) {
  showError(error, "Запусти проект через локальный сервер");
}
updateLoop();
updateVoice();
