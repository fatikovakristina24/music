import { Rack } from "./audio/rack.js";
import { CATEGORIES, DEFAULT_GRID, DRUM_NAMES } from "./loops.js";
import { downloadWav } from "./audio/wav.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
export const rack = new Rack();
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const press = (v) => `aria-pressed="${Boolean(v)}"`;
const meter = () =>
  '<div class="meter" aria-hidden="true">' +
  Array.from({ length: 10 }, () => "<i></i>").join("") +
  "</div>";
let category = "Все",
  targetDeck = null,
  noticeTimer,
  grid = structuredClone(DEFAULT_GRID),
  preview = null,
  previewRequest = 0;
function notice(message) {
  $("#notice").textContent = message;
  $("#notice").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("#notice").hidden = true), 6500);
}
async function run(action) {
  try {
    await action();
  } catch (e) {
    console.error(e);
    notice(e.message || "Не удалось выполнить действие. Попробуй ещё раз.");
  }
}
function deckHtml(d, i) {
  return `<div class="deck-heading"><span class="deck-letter ${d.playing && rack.state === "running" ? "active" : ""}">${d.id}</span><div class="deck-title"><h2>${d.name}</h2><p>${d.description} / ${d.layers.length} слоя</p></div><span class="deck-bpm">${rack.bpm} BPM</span></div><div class="wave"><div class="idle-wave"><img src="assets/dj/wave-${i ? "b" : "a"}.svg" width="496" height="64" alt=""></div><canvas data-wave="${i}" aria-label="Звуковая волна деки ${d.id}"></canvas></div><div class="deck-transport"><button data-deck-play="${i}" ${press(d.playing && rack.state === "running")}>${d.playing && rack.state === "running" ? "Пауза" : "Играть"}</button><button data-restart="${i}">Сначала</button><label class="loop-length"><span class="sr-only">Длина петли деки ${d.id}</span><select data-length="${i}">${[1, 2, 4].map((n) => `<option value="${n}" ${n === d.length ? "selected" : ""}>Петля: ${n} ${n === 1 ? "такт" : "такта"}</option>`).join("")}</select></label></div><div class="layer-heading"><span>СЛОИ / ${d.layers.length} ИЗ 8</span><button data-add-layer="${i}">Добавить слой</button></div><div class="layers">${
    d.layers
      .map((l) => {
        const name = rack.library.find((x) => x.id === l.id);
        return `<div class="layer" data-layer="${esc(l.id)}"><div class="layer-title"><p class="layer-name">${esc(name?.name || l.id)}</p><p class="layer-meta">${esc(name?.category || "Свои")} / <output data-volume-output="${i}:${esc(l.id)}">${l.volume} %</output></p></div><input type="range" min="0" max="100" value="${l.volume}" data-volume="${esc(l.id)}" data-deck="${i}" aria-label="Громкость ${esc(name?.name)} на деке ${d.id}"><button data-layer-action="on" data-deck="${i}" data-id="${esc(l.id)}" ${press(l.on)}>${l.on ? "Вкл" : "Выкл"}</button><button data-layer-action="solo" data-deck="${i}" data-id="${esc(l.id)}" ${press(l.solo)}>Соло</button><button data-remove="${esc(l.id)}" data-deck="${i}">Убрать</button></div>`;
      })
      .join("") ||
    '<p class="empty-deck">Добавь луп из библиотеки ниже. Можно собрать до восьми слоёв.</p>'
  }</div><p class="deck-hint">${rack.jobs.some((j) => j.label.includes(`:${i}:`)) ? "Слой ожидает ближайшего такта." : "Новый слой вступит с ближайшего такта."}</p>`;
}
function renderDecks() {
  rack.decks.forEach((d, i) => {
    $(i ? "#deck-b" : "#deck-a").innerHTML = deckHtml(d, i);
  });
}
function renderMixer() {
  const eqNames = ["Верх", "Середина", "Низ"];
  $("#mixer").innerHTML =
    `<h2>МИКШЕР</h2><div class="eq-grid"><span class="letter">A</span><span></span><span class="letter">B</span>${eqNames.map((name, k) => [0, 1].map((i) => `<label class="knob"><img src="assets/dj/eq.svg" width="44" height="44" alt="" style="transform:rotate(${rack.decks[i].eq[k] * 10}deg)"><input type="range" min="-12" max="12" step="1" value="${rack.decks[i].eq[k]}" data-eq="${k}" data-deck="${i}" aria-label="${name}, дека ${i ? "B" : "A"}, дБ"><output class="eq-value">${rack.decks[i].eq[k]} dB</output></label>${i === 0 ? `<span class="eq-label">${name}</span>` : ""}`).join("")).join("")}</div><div class="faders">${rack.decks.map((d, i) => `<label class="fader"><span class="fader-body"><input type="range" min="-30" max="6" step="1" value="${d.gain}" data-gain="${i}" aria-label="Громкость деки ${d.id}, дБ">${meter()}</span><output>${d.gain} dB</output></label>`).join("")}</div><label class="cross">ПЕРЕХОД A / B<input type="range" id="cross" min="0" max="100" value="${rack.cross}" aria-label="Переход A — B"></label><div class="cross-letters"><span>A</span><span>B</span></div>`;
}
function renderLibrary() {
  const cats = [
    ...CATEGORIES,
    ...(rack.library.some((l) => l.category === "Свои") ? ["Свои"] : []),
  ];
  $("#library").innerHTML =
    `<div class="library-heading"><h2>Лупы</h2><div class="categories" role="group" aria-label="Категории лупов">${cats.map((c) => `<button data-category="${c}" ${press(c === category)}>${c}</button>`).join("")}</div><div class="library-tools"><button id="import">Добавить свой звук</button><button id="edit-beat">Редактор ритма</button></div></div><div class="loop-grid">${rack.library
      .filter((l) => category === "Все" || l.category === category)
      .map(
        (l) =>
          `<div class="loop"><p class="loop-name">${esc(l.name)}</p><p class="loop-meta">${esc(l.category)} / ${l.bars} ${l.bars === 1 ? "такт" : "такта"}</p><div class="assign">${[
            0, 1,
          ]
            .map((i) => {
              const has = rack.decks[i].layers.some((x) => x.id === l.id),
                pending = rack.jobs.some((j) => j.label === `add:${i}:${l.id}`);
              return `<button data-assign="${i}" data-id="${esc(l.id)}" ${press(has)} ${has || pending ? "disabled" : ""}>${pending ? "Ждёт" : `В ${i ? "B" : "A"}`}</button>`;
            })
            .join("")}</div></div>`,
      )
      .join("")}</div>`;
}
function renderScenes() {
  $("#scenes").innerHTML =
    ["Вступление", "Развитие", "Кульминация", "Финал"]
      .map(
        (n, i) =>
          `<button data-scene="${i}" ${press(rack.scene === n)}>${n}</button>`,
      )
      .join("") +
    `<button id="save-scene">Сохранить сцену</button>` +
    rack.savedScenes
      .map(
        (s, i) =>
          `<button class="saved-scene" data-recall="${i}" ${press(rack.scene === s.name)}>${s.name}</button>`,
      )
      .join("");
}
function sync() {
  const dragging = document.activeElement?.matches("input[type=range]");
  if (!dragging) {
    renderDecks();
    renderMixer();
  }
  renderLibrary();
  renderScenes();
  $("#play").textContent = rack.busy
    ? "Загрузка…"
    : rack.state === "running"
      ? "Пауза"
      : "Играть";
  $("#play").disabled = rack.busy;
  $("#example").disabled = $("#new").disabled = rack.busy;
  $("#record").disabled = rack.busy || rack.recordStarting;
  $("#record").textContent = rack.recording
    ? "Остановить запись"
    : "Записать трек";
  $("#record").classList.toggle("primary", !!rack.recording);
  $("#download").disabled = !rack.buffer || !!rack.recording;
  $("#stop").disabled = rack.state === "idle";
  $("#drop").disabled = rack.state !== "running" || !!rack.dropping;
  $("#drop").textContent = rack.dropping ? "ГОТОВИМ ДРОП" : "ДРОП";
  $("#bpm").value = rack.bpm;
  $("#key").value = rack.transpose;
  $("#bpm").disabled = $("#key").disabled = !!rack.formatBusy;
  $$("[data-fx]").forEach((b) =>
    b.setAttribute("aria-pressed", rack.fx[b.dataset.fx]),
  );
  $("#depth").value = rack.fx.depth;
  $("#depth-value").textContent = rack.fx.depth + " %";
  $$("input[type=range]").forEach(rangeFill);
}
function rangeFill(input) {
  const value = ((+input.value - +input.min) / (+input.max - +input.min)) * 100;
  input.style.setProperty("--fill", `${value}%`);
}
rack.addEventListener("change", sync);
rack.addEventListener("failure", (e) => notice(e.detail));
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  run(async () => {
    const d = b.dataset;
    if (b.id === "play") await rack.toggle();
    else if (b.id === "stop") await rack.stop();
    else if (b.id === "record") {
      if (rack.recording) await rack.finishRecord();
      else await rack.startRecord();
    } else if (b.id === "download" && rack.buffer)
      downloadWav(
        rack.buffer,
        `spletenie-${new Date().toISOString().replace(/[:.]/g, "-")}.wav`,
      );
    else if (b.id === "example") await rack.example();
    else if (b.id === "new") $("#new-dialog").showModal();
    else if (b.id === "confirm-new") {
      await stopPreview();
      await rack.reset();
      $("#new-dialog").close();
    } else if (b.id === "help") $("#help-dialog").showModal();
    else if ("close" in d) b.closest("dialog").close();
    else if (d.deckPlay !== undefined) {
      const i = +d.deckPlay;
      if (rack.state !== "running") {
        rack.decks[i].playing = true;
        await rack.play();
      } else rack.deck(i, "playing", !rack.decks[i].playing);
    } else if (d.restart !== undefined) rack.restart(+d.restart);
    else if (d.addLayer !== undefined) {
      targetDeck = +d.addLayer;
      category = "Все";
      renderLibrary();
      $("#library").scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      notice(`Выбери луп и нажми «В ${targetDeck ? "B" : "A"}».`);
    } else if (d.assign !== undefined) {
      await rack.add(+d.assign, d.id);
      targetDeck = null;
    } else if (d.layerAction) {
      const l = rack.decks[+d.deck].layers.find((l) => l.id === d.id);
      rack.layer(+d.deck, d.id, d.layerAction, !l[d.layerAction]);
    } else if (d.remove) rack.remove(+d.deck, d.remove);
    else if (d.category) {
      category = d.category;
      renderLibrary();
    } else if (d.fx) rack.effect(d.fx, !rack.fx[d.fx]);
    else if (b.id === "reset-fx") {
      rack.fx = {
        filter: false,
        echo: false,
        room: false,
        drive: false,
        depth: 32,
      };
      rack.apply();
      rack.changed();
    } else if (b.id === "drop") await rack.drop();
    else if (d.scene !== undefined) rack.sceneSelect(+d.scene);
    else if (b.id === "save-scene") {
      rack.saveScene();
      notice("Сцена сохранена: слои, баланс и эффекты.");
    } else if (d.recall !== undefined) rack.recall(+d.recall);
    else if (b.id === "import") $("#audio-file").click();
    else if (b.id === "edit-beat") {
      renderBeat();
      $("#beat-dialog").showModal();
    } else if (d.step !== undefined) {
      grid[+d.row][+d.step] = !grid[+d.row][+d.step];
      renderBeat();
      if (preview) await startPreview();
    } else if (b.id === "beat-clear") {
      grid = grid.map((row) => row.map(() => 0));
      renderBeat();
      if (preview) await startPreview();
    } else if (b.id === "beat-preview") {
      if (preview) await stopPreview();
      else await startPreview();
    } else if (b.id === "beat-save") {
      await stopPreview();
      await rack.saveBeat(grid, +$("#swing").value);
      category = "Ударные";
      renderLibrary();
      $("#beat-dialog").close();
      notice("Ритм добавлен в лупы. Выбери деку A или B.");
    }
  });
});
document.addEventListener("input", (e) => {
  const el = e.target,
    d = el.dataset,
    v = +el.value;
  if (el.matches("input[type=range]")) rangeFill(el);
  if (d.volume) {
    rack.layer(+d.deck, d.volume, "volume", v);
    el.closest(".layer").querySelector("output").textContent = v + " %";
  } else if (d.eq !== undefined) {
    rack.decks[+d.deck].eq[+d.eq] = v;
    rack.apply();
    el.parentElement.querySelector("img").style.transform =
      `rotate(${v * 10}deg)`;
    el.parentElement.querySelector("output").textContent = v + " dB";
    rack.demo = false;
  } else if (d.gain !== undefined) {
    rack.decks[+d.gain].gain = v;
    rack.apply();
    el.closest("label").querySelector("output").textContent = v + " dB";
    rack.demo = false;
  } else if (el.id === "cross") rack.mix(v);
  else if (el.id === "depth") rack.effect("depth", v);
  else if (el.id === "swing") $("#swing-value").textContent = v + " %";
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.length !== undefined)
    rack.setLength(+el.dataset.length, +el.value);
  if (el.id === "bpm" || el.id === "key")
    run(() => rack.format(+$("#bpm").value, +$("#key").value));
  if (el.id === "audio-file" && el.files[0])
    run(async () => {
      await rack.importFile(el.files[0]);
      category = "Свои";
      renderLibrary();
      el.value = "";
      notice("Звук добавлен в библиотеку.");
    });
  if (el.id === "swing" && preview) run(startPreview);
});
document.addEventListener("keydown", (e) => {
  if (
    e.repeat ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    document.querySelector("dialog[open]") ||
    e.target.closest("input,select,textarea,button")
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    run(() => rack.toggle());
  } else if (/^[1-4]$/.test(e.key)) rack.sceneSelect(+e.key - 1);
});
$$("dialog").forEach((d) => {
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  });
});
$("#beat-dialog").addEventListener("close", () => run(stopPreview));
function renderBeat() {
  $("#beat-grid").innerHTML = grid
    .map(
      (row, r) =>
        `<div class="beat-row"><span>${DRUM_NAMES[r]}</span>${row.map((on, s) => `<button class="step" data-row="${r}" data-step="${s}" ${press(on)} aria-label="${DRUM_NAMES[r]}, шаг ${s + 1}"></button>`).join("")}</div>`,
    )
    .join("");
}
async function stopPreview() {
  previewRequest++;
  if (!preview) return;
  try {
    preview.stop();
  } catch {}
  preview.disconnect();
  preview = null;
  $("#beat-preview").textContent = "Слушать";
}
async function startPreview() {
  await stopPreview();
  const request = previewRequest;
  const { renderLoop } = await import("./audio/synthesis.js");
  await rack.ready();
  const buffer = await renderLoop(
    { id: "preview", bars: 1, grid, swing: +$("#swing").value },
    rack.bpm,
    rack.transpose,
  );
  if (request !== previewRequest || !$("#beat-dialog").open) return;
  const s = rack.context.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.connect(rack.master);
  s.start();
  preview = s;
  preview.started = rack.context.currentTime;
  $("#beat-preview").textContent = "Стоп";
}
function animate() {
  const t = rack.elapsed;
  $("#clock").textContent =
    `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")} / такт ${String(rack.bar + 1).padStart(2, "0")}`;
  $$(".wave").forEach((wrap, i) => {
    const canvas = wrap.querySelector("canvas"),
      ctx = canvas.getContext("2d"),
      w = wrap.clientWidth,
      h = 64,
      dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    wrap.querySelector(".idle-wave").style.transform = `scaleX(${w / 496})`;
    const ch = rack.channels?.[i],
      running = rack.state === "running" && rack.decks[i].playing;
    wrap.querySelector(".idle-wave").hidden = running;
    let rms = 0;
    if (ch) {
      const a = new Float32Array(ch.meter.fftSize);
      ch.meter.getFloatTimeDomainData(a);
      rms = Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
      if (running) {
        ctx.strokeStyle = i ? "#7668b3" : "#a9b2ff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const v = a[Math.floor((x / w) * a.length)];
          const y = h / 2 + v * h * 1.9;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = "#545cad";
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const v = a[(Math.floor((x / w) * a.length) + 80) % a.length];
          const y = h / 2 + v * h * 1.3;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    const bars = $$(".fader")[i]?.querySelectorAll(".meter i");
    bars?.forEach((bar, k) =>
      bar.classList.toggle(
        "lit",
        running && k < Math.min(10, Math.ceil(rms * 32)),
      ),
    );
  });
  if (preview) {
    const step =
      Math.floor(
        (rack.context.currentTime - preview.started) / (rack.beat / 4),
      ) % 16;
    $$(".step").forEach((b) =>
      b.classList.toggle("current", +b.dataset.step === step),
    );
  } else $$(".step.current").forEach((b) => b.classList.remove("current"));
  if (rack.recording && rack.context.currentTime - rack.recordStart > 600)
    run(async () => {
      await rack.finishRecord();
      notice("Достигнуты 10 минут записи. Можно скачать трек.");
    });
  requestAnimationFrame(animate);
}
sync();
animate();
if (location.protocol === "file:")
  notice(
    "Открой сайт через Live Server в VS Code или по опубликованной ссылке.",
  );
