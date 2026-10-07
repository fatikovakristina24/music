import { AudioEngine, NOTES } from "./audio/engine.js?v=20261008-weave";
import { Composition, BASS_OPTIONS } from "./composition.js?v=20261008-weave";
import { WeaveVisuals } from "./weave-visuals.js?v=20261008-weave";
import {
  VoiceRecorder,
  VOICE_LIMIT_SECONDS,
} from "./voice.js?v=20261008-weave";
import { SoundVisuals } from "./visuals.js?v=20261008-weave";

const $ = (selector) => document.querySelector(selector);
const compactLayout = matchMedia("(max-width: 1100px)");
const decimals = (number) => number.toFixed(1);
const signed = (number) => (number > 0 ? `+${number}` : `${number}`);
const engine = new AudioEngine();
engine.layers.push({
  enabled: true,
  preset: "soft",
  filter: 18000,
  echo: 0,
  room: 12,
  pan: 0,
  volume: 65,
});
engine.synthSettings.release = 0.35;
const composition = new Composition(engine);
const voice = new VoiceRecorder(engine);
let step = 0,
  mode = "play",
  inputGeneration = 0,
  voiceVisuals;
const held = new Map();
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
const effectSliders = new Map(
  voiceParameters.map((config) => [
    config.name,
    slider($("#voice-sliders"), config, "effect", (name, value) =>
      engine.updateEffect(name, value),
    ),
  ]),
);
const musicSliders = new Map(
  [
    {
      name: "volume",
      label: "Громкость",
      min: 0,
      max: 100,
      step: 1,
      value: 65,
    },
    { name: "echo", label: "Эхо", min: 0, max: 60, step: 1, value: 24 },
    { name: "room", label: "Комната", min: 0, max: 100, step: 1, value: 18 },
  ].map((config) => [
    config.name,
    slider($("#studio-sliders"), config, "music", (name, value) => {
      if (step === 3) {
        if (name === "volume") engine.updateSynth(name, value);
        else engine.updateMix(name, value);
      } else engine.updateLayer(step, name, value);
    }),
  ]),
);

const colors = [
  "#22286e",
  "#323d9e",
  "#424dbb",
  "#525ecd",
  "#6758a8",
  "#806fbb",
  "#978bd0",
  "#a9b2ff",
];
const pads = NOTES.map((note, index) => {
  const button = document.createElement("button");
  button.className = "studio-pad";
  button.type = "button";
  button.style.setProperty("--note-color", colors[index]);
  button.style.setProperty("--note-ink", index > 5 ? "#0a0a0b" : "#f3f3f0");
  const wave = Array.from(
    { length: 61 },
    (_, x) =>
      `${x ? "L" : "M"}${x},${(7 + Math.sin((x / 60) * Math.PI * (2 + index * 0.55)) * Math.sin((x / 60) * Math.PI) * 2.5).toFixed(2)}`,
  ).join(" ");
  button.innerHTML = `<span class="note">${note.label}${index === 7 ? " ↑" : ""}</span><span class="key">${note.key}</span><svg viewBox="0 0 60 14" aria-hidden="true"><path d="${wave}"/></svg>`;
  button.setAttribute(
    "aria-label",
    `${note.label}${index === 7 ? ", выше на октаву" : ""} — клавиша ${note.key}`,
  );
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    noteOn(`pointer-${event.pointerId}`, index);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(event, (e) => noteOff(`pointer-${e.pointerId}`));
  button.addEventListener("keydown", (e) => {
    if (["Enter", "Space"].includes(e.code)) {
      e.preventDefault();
      if (!e.repeat) noteOn(`pad-${index}`, index);
    }
  });
  button.addEventListener("keyup", (e) => {
    if (["Enter", "Space"].includes(e.code)) {
      e.preventDefault();
      noteOff(`pad-${index}`);
    }
  });
  button.addEventListener("blur", () => noteOff(`pad-${index}`));
  $("#pads").append(button);
  return button;
});
async function noteOn(token, index) {
  if (mode !== "play" || step !== 0 || held.has(token)) return;
  const generation = inputGeneration;
  const note = { index, released: false };
  held.set(token, note);
  try {
    await engine.ready();
    if (generation !== inputGeneration) return;
    note.source = engine.noteOn(
      index,
      engine.context.currentTime,
      note.released ? 0.08 : null,
      NOTES[index].frequency,
      0,
    );
    composition.noteOn(token, index);
    if (note.released) composition.noteOff(token);
  } catch (error) {
    held.delete(token);
    showError(error, "Не удалось включить звук");
  }
}
function noteOff(token) {
  const note = held.get(token);
  if (!note) return;
  note.released = true;
  note.source?.stop();
  composition.noteOff(token);
  held.delete(token);
}
function releaseHeld() {
  inputGeneration++;
  for (const token of [...held.keys()]) noteOff(token);
}
function editable(target) {
  return target.matches('input,select,textarea,[contenteditable="true"]');
}
document.addEventListener("keydown", (e) => {
  if (
    e.repeat ||
    e.ctrlKey ||
    e.altKey ||
    e.metaKey ||
    editable(e.target) ||
    document.querySelector("dialog[open]")
  )
    return;
  const index = NOTES.findIndex((n) => n.code === e.code);
  if (mode === "play" && step === 0 && index >= 0) {
    e.preventDefault();
    noteOn(e.code, index);
  }
  if (e.code === "Space" && !e.target.closest("button")) {
    e.preventDefault();
    safe(async () => {
      if (mode === "voice") await voice.play();
      else {
        await engine.ready();
        toggleTrack();
      }
    });
  }
});
document.addEventListener("keyup", (e) => noteOff(e.code));
window.addEventListener("blur", releaseHeld);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseHeld();
    composition.finishRecording();
    if (composition.kind) composition.pause();
    voice.leave();
  }
});
window.addEventListener("pagehide", () => {
  releaseHeld();
  composition.finishRecording();
  composition.stop();
  voice.leave();
  voice.cleanupMicrophone();
  engine.stopAll();
});

const names = ["Мелодия", "Бас", "Ритм", "Весь трек"];
const titles = [
  "1. Сыграй мелодию",
  "2. Добавь бас",
  "3. Собери ритм",
  "4. Собери свой трек",
];
const descriptions = [
  "Нажми «Записать мелодию» и сыграй на клавишах. Мы сохраним её для повторения.",
  "Послушай три варианта и выбери тот, который подходит твоей мелодии.",
  "Нажимай на клетки: яркая клетка — удар, тёмная — пауза.",
  "Выбери партии для каждой части. Получится музыка с началом, развитием и финалом.",
];
function selectStep(value) {
  releaseHeld();
  composition.finishRecording();
  if (composition.kind === "preview") composition.stop();
  step = value;
  document.querySelectorAll("[data-step]").forEach((button) => {
    const active = Number(button.dataset.step) === step;
    button.classList.toggle("selected", active);
    if (active) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  ["melody", "bass", "rhythm", "track"].forEach(
    (name, i) => ($(`#step-${name}`).hidden = i !== step),
  );
  $("#step-title").textContent = titles[step];
  $("#step-description").textContent = descriptions[step];
  $("#settings-title").textContent = names[step];
  $("#settings-label").textContent =
    step === 3 ? "ЗВУЧАНИЕ ТРЕКА" : "НАСТРОЙКИ ПАРТИИ";
  for (const [name, control] of musicSliders) {
    control.input.value =
      step === 3
        ? name === "volume"
          ? engine.synthSettings.volume
          : engine.mixSettings[name]
        : engine.layers[step][name];
    control.display();
  }
  $("#timbre").hidden = step !== 0;
  $("#timbre-summary").hidden = step === 0;
  $("#timbre-summary").textContent =
    step === 1 ? "Басовый" : step === 2 ? "Ударные" : "Общий";
  $("#timbre").value = engine.layers[0].preset;
  $("#next-title").textContent =
    step === 3
      ? "Твоя композиция готова"
      : `Дальше — ${["добавить бас", "собрать ритм", "собрать трек"][step]}`;
  $("#next-description").textContent =
    step === 3
      ? "Послушай целиком, измени детали и скачай результат."
      : "Ты можешь вернуться к любому шагу и поменять звучание.";
  $("#step-next").textContent =
    step === 3
      ? "Скачать трек"
      : ["Дальше: бас", "Дальше: ритм", "Дальше: трек"][step];
  updateMusic();
}
document
  .querySelectorAll("[data-step]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      selectStep(Number(button.dataset.step)),
    ),
  );
$("#step-next").addEventListener("click", () =>
  step < 3
    ? selectStep(step + 1)
    : safe(() => composition.download(), "Не удалось скачать трек"),
);
$("#timbre").addEventListener("change", (e) =>
  engine.updateLayer(0, "preset", e.target.value),
);
$("#melody-record").addEventListener("click", () =>
  safe(async () => {
    releaseHeld();
    await engine.ready();
    if (composition.recording) composition.finishRecording();
    else composition.startRecording();
  }),
);
$("#melody-play").addEventListener("click", () =>
  safe(async () => {
    await engine.ready();
    composition.kind === "melody"
      ? composition.pause()
      : composition.play("melody");
  }),
);
$("#melody-clear").addEventListener("click", () => {
  releaseHeld();
  composition.clearMelody();
});
function toggleTrack() {
  if (composition.kind === "track") composition.pause();
  else composition.play("track");
}
$("#track-play").addEventListener("click", () =>
  safe(async () => {
    releaseHeld();
    await engine.ready();
    toggleTrack();
  }),
);
$("#track-download").addEventListener("click", () =>
  safe(() => composition.download(), "Не удалось скачать трек"),
);

for (const option of BASS_OPTIONS) {
  const item = document.createElement("div");
  item.className = "bass-option";
  item.dataset.bass = option.id;
  item.innerHTML = `<h3>${option.name}</h3><p>${option.description}</p><div class="action-row"><button class="button" data-preview="${option.id}">Послушать</button><button class="button" data-add-bass="${option.id}">Добавить</button></div>`;
  item.querySelector("[data-preview]").addEventListener("click", () =>
    safe(async () => {
      await engine.ready();
      composition.kind === "preview" && composition.previewId === option.id
        ? composition.stop()
        : composition.preview(option.id);
    }),
  );
  item.querySelector("[data-add-bass]").addEventListener("click", () => {
    composition.bass = composition.bass === option.id ? null : option.id;
    composition.refresh();
  });
  $("#bass-options").append(item);
}
for (const [drum, name] of ["Бочка", "Малый", "Хэт"].entries()) {
  const label = document.createElement("span");
  label.className = "drum-name";
  label.textContent = name;
  $("#drum-grid").append(label);
  for (let index = 0; index < 8; index++) {
    const button = document.createElement("button");
    button.className = "drum-step";
    button.textContent = index + 1;
    button.dataset.drum = drum;
    button.dataset.beat = index;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `${name}, шаг ${index + 1}`);
    button.addEventListener("click", () =>
      safe(async () => {
        composition.drums[drum][index] = !composition.drums[drum][index];
        const active = composition.drums[drum][index];
        const wasPlaying = !!composition.kind;
        composition.refresh();
        if (active && !wasPlaying) {
          await engine.ready();
          engine.drum(drum);
        }
      }),
    );
    $("#drum-grid").append(button);
  }
}
$("#rhythm-play").addEventListener("click", () =>
  safe(async () => {
    await engine.ready();
    composition.kind === "rhythm"
      ? composition.pause()
      : composition.play("rhythm");
  }),
);
$("#rhythm-clear").addEventListener("click", () => {
  composition.drums.forEach((row) => row.fill(false));
  composition.refresh();
});
for (let section = 0; section < 3; section++) {
  const item = document.createElement("div");
  item.className = "track-section";
  item.dataset.section = section;
  item.innerHTML = `<h3>${["Начало", "Развитие", "Финал"][section]}</h3><p class="part-duration"></p><div class="track-toggles"></div><p class="part-hint">Нажми на партию, чтобы включить её.</p>`;
  for (let channel = 0; channel < 3; channel++) {
    const button = document.createElement("button");
    button.textContent = names[channel];
    button.dataset.section = section;
    button.dataset.channel = channel;
    button.addEventListener("click", () => {
      composition.parts[section][channel] =
        !composition.parts[section][channel];
      composition.refresh();
    });
    item.querySelector(".track-toggles").append(button);
  }
  $("#track-sections").append(item);
}
function updateMusic() {
  const recording = composition.recording;
  const availability = [
    !!composition.notes.length,
    !!composition.bass,
    composition.hasDrums,
  ];
  $("#melody-record").textContent = recording
    ? "Остановить запись"
    : "Записать мелодию";
  $("#melody-record").setAttribute("aria-pressed", String(recording));
  $("#melody-play").textContent =
    composition.kind === "melody"
      ? "Пауза"
      : composition.pausedKind === "melody"
        ? "Продолжить"
        : "Послушать";
  $("#melody-play").disabled = !availability[0] || recording;
  $("#melody-clear").disabled = !availability[0] || recording;
  $("#track-play").textContent =
    composition.kind === "track"
      ? "Пауза"
      : composition.pausedKind === "track"
        ? "Продолжить"
        : "Слушать трек";
  $("#track-play").classList.toggle("active", composition.kind === "track");
  const hasScore = composition.events().events.length > 0;
  $("#track-play").disabled = !hasScore || recording;
  $("#track-download").disabled =
    !hasScore || recording || composition.exporting;
  $("#track-download").textContent = composition.exporting
    ? "Сохраняем…"
    : "Скачать трек";
  $("#step-next").disabled =
    step === 3 && (!hasScore || recording || composition.exporting);
  $("#rhythm-play").disabled = $("#rhythm-clear").disabled =
    !composition.hasDrums;
  $("#rhythm-play").textContent =
    composition.kind === "rhythm" ? "Пауза" : "Послушать ритм";
  $("#melody-status").textContent = recording
    ? `Записываем · ${decimals(composition.elapsed)} / 20.0 с`
    : availability[0]
      ? `Твоя мелодия · ${decimals(composition.loopBeats * composition.secondsPerBeat)} секунды`
      : "До 20 секунд · начни с нескольких нот";
  document
    .querySelectorAll("[data-thread]")
    .forEach((label) =>
      label.classList.toggle(
        "thread-on",
        availability[Number(label.dataset.thread)],
      ),
    );
  document.querySelectorAll("[data-bass]").forEach((item) => {
    const selected = composition.bass === item.dataset.bass;
    const preview =
      composition.kind === "preview" &&
      composition.previewId === item.dataset.bass;
    item.classList.toggle("selected", selected);
    const add = item.querySelector("[data-add-bass]");
    add.textContent = selected ? "Убрать бас" : "Добавить";
    add.setAttribute("aria-pressed", String(selected));
    const play = item.querySelector("[data-preview]");
    play.textContent = preview ? "Остановить" : "Послушать";
    play.classList.toggle("active", preview);
  });
  document
    .querySelectorAll(".drum-step")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(composition.drums[button.dataset.drum][button.dataset.beat]),
      ),
    );
  const bars = composition.sectionBars;
  document.querySelectorAll(".track-section").forEach((item, i) => {
    item.querySelector(".part-duration").textContent =
      `${bars[i]} такта · ${["знакомим с мелодией", "добавляем движение", "оставляем послезвучие"][i]}`;
    item.querySelectorAll("[data-channel]").forEach((button) => {
      const channel = Number(button.dataset.channel);
      button.disabled = !availability[channel];
      button.setAttribute(
        "aria-pressed",
        String(composition.parts[i][channel] && availability[channel]),
      );
      button.setAttribute(
        "aria-label",
        `${names[channel]} в части «${["Начало", "Развитие", "Финал"][i]}»`,
      );
    });
  });
}
composition.addEventListener("change", updateMusic);

function setMode(value) {
  if (mode === value) return;
  releaseHeld();
  composition.finishRecording();
  composition.stop();
  engine.stopAll();
  voice.leave();
  mode = value;
  engine.setSynthEnabled(value === "play");
  $("#play-screen").hidden = value !== "play";
  $("#voice-screen").hidden = value !== "voice";
  $(".studio-transport").hidden = value !== "play";
  $("#mode-voice").hidden = value === "voice";
  $("#mode-play").hidden = value === "play";
  document.body.classList.toggle("voice-mode", value === "voice");
  voiceVisuals?.resize();
  updateVoice();
}
$("#mode-voice").addEventListener("click", () => setMode("voice"));
$("#mode-play").addEventListener("click", () => setMode("play"));
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
voice.addEventListener("error", (e) => showError(e.detail));
function updateVoice() {
  const recording = voice.state === "recording";
  const busy = ["requesting", "processing", "loading"].includes(voice.state);
  const playing = voice.state === "playing",
    hasRecording = !!voice.buffer;
  const enabled = hasRecording && !recording && !busy;
  $("#voice-record").disabled = busy;
  $("#voice-record").textContent = recording
    ? compactLayout.matches
      ? "Остановить запись"
      : "Закончить запись"
    : voice.state === "requesting"
      ? "Разреши микрофон…"
      : compactLayout.matches && hasRecording
        ? "Записать заново"
        : "Записать голос";
  $("#voice-play").disabled = !enabled;
  $("#voice-play").textContent = playing
    ? "Пауза"
    : voice.state === "paused"
      ? "Продолжить"
      : compactLayout.matches
        ? "Слушать"
        : "Послушать";
  $("#voice-reset").disabled = $("#voice-delete").disabled = !enabled;
  $("#voice-effects").disabled = !enabled;
  $("#voice-download").disabled = !enabled || voice.exporting;
  $("#voice-download").textContent = voice.exporting ? "Сохраняем…" : "Скачать";
  $("#voice-summary").textContent = recording
    ? "Идёт запись…"
    : voice.state === "processing"
      ? "Готовим запись…"
      : hasRecording
        ? `Запись · ${decimals(voice.buffer.duration)} секунды`
        : "Пока нет записи";
  $("#voice-caption").textContent = recording
    ? compactLayout.matches
      ? "Говори — звук рисует форму"
      : "Твой голос становится формой"
    : playing
      ? compactLayout.matches
        ? "Твой голос звучит иначе"
        : "Теперь твой голос звучит иначе"
      : hasRecording
        ? "Твой голос готов к эксперименту"
        : "У каждого голоса есть своя форма";
  $("#voice-heading").textContent = recording
    ? "Говори — мы слушаем"
    : hasRecording
      ? "Послушай, что получилось"
      : compactLayout.matches
        ? "Попробуй свой голос"
        : "Начни со своего голоса";
  $("#voice-description").textContent = recording
    ? `Запись закончится через ${VOICE_LIMIT_SECONDS} секунд. Можно остановить её раньше.`
    : hasRecording
      ? compactLayout.matches
        ? "Меняй эффекты ниже и слушай результат."
        : "Меняй эффекты справа и слушай результат. Исходный голос сохраняется."
      : compactLayout.matches
        ? `Запиши фразу до ${VOICE_LIMIT_SECONDS} секунд, затем меняй её звучание.`
        : `Нажми «Записать голос» и скажи что-нибудь. Можно записать до ${VOICE_LIMIT_SECONDS} секунд.`;
  $("#voice-status").textContent = recording
    ? `Записываем · 0.0 / ${decimals(VOICE_LIMIT_SECONDS)} с`
    : playing
      ? "Слушаем запись…"
      : hasRecording
        ? `Твоя запись · ${decimals(voice.buffer.duration)} секунды`
        : compactLayout.matches
          ? "Пока нет записи"
          : "Запиши фразу — и посмотри, как она звучит ↓";
  $(".voice-panel").classList.toggle(
    "has-recording",
    hasRecording && !recording,
  );
  $("#voice-play").classList.toggle("active", playing && compactLayout.matches);
  $(".controls-description").textContent = compactLayout.matches
    ? enabled
      ? "Эффекты можно сочетать"
      : "Эффекты доступны после записи"
    : "Сочетай эффекты и слушай результат";
  $(".privacy").textContent = compactLayout.matches
    ? "Голос остаётся в этой вкладке."
    : "Голос обрабатывается в браузере — загрузка на сервер не нужна.";
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

new WeaveVisuals(engine, composition, pads, (now, sounding) => {
  if (mode !== "play") return;
  if (composition.recording)
    $("#melody-status").textContent =
      `Записываем · ${decimals(composition.elapsed)} / 20.0 с`;
  const active = sounding.find((v) => v.channel === 0);
  $("#weave-caption").textContent = composition.recording
    ? "Записываем твою мелодию — нота за нотой."
    : composition.kind === "track"
      ? "Играет твоя композиция"
      : composition.kind === "preview"
        ? "Слушаем басовую партию"
        : active
          ? `Сейчас звучит ${NOTES[active.index].label}`
          : composition.hasMusic
            ? "Каждая партия становится частью общего звучания."
            : "Пока тихо. Сыграй первую ноту.";
  const playhead = composition.kind
    ? Math.floor(composition.playhead * 2) % 8
    : -1;
  document
    .querySelectorAll(".drum-step")
    .forEach((button) =>
      button.classList.toggle(
        "playhead",
        Number(button.dataset.beat) === playhead &&
          ["track", "rhythm"].includes(composition.kind),
      ),
    );
  const bars = composition.sectionBars,
    beat = composition.playhead;
  const part = beat < bars[0] * 4 ? 0 : beat < (bars[0] + bars[1]) * 4 ? 1 : 2;
  document
    .querySelectorAll(".track-section")
    .forEach((item, i) =>
      item.classList.toggle(
        "playing",
        composition.kind === "track" && part === i,
      ),
    );
});
async function startVoiceVisuals() {
  try {
    const response = await fetch(
      new URL("../assets/contours.json?v=2", import.meta.url),
    );
    if (!response.ok) throw new Error("Не удалось загрузить графику голоса.");
    voiceVisuals = new SoundVisuals(
      engine,
      voice,
      await response.json(),
      () => {
        if (mode !== "voice") return;
        if (voice.state === "recording")
          $("#voice-status").textContent =
            `Записываем · ${decimals(voice.elapsed)} / 20.0 с`;
        if (voice.state === "playing")
          $("#voice-status").textContent =
            `Слушаем запись · ${decimals(voice.elapsed)} / ${decimals(voice.buffer.duration)} секунды`;
      },
      { voiceOnly: true },
    );
  } catch (error) {
    showError(error, "Не удалось загрузить визуализацию");
  }
}
selectStep(0);
updateVoice();
startVoiceVisuals();
compactLayout.addEventListener("change", updateVoice);
