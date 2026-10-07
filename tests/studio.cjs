const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const url = process.env.CONTOUR_URL || "http://localhost:4173";
const out =
  process.env.CONTOUR_OUTPUT || path.join(os.tmpdir(), "kontur-studio-check");
fs.mkdirSync(out, { recursive: true });
const microphone = path.join(out, "microphone.wav");
const rate = 48000,
  frames = rate * 24;
const fixture = Buffer.alloc(44 + frames * 2);
fixture.write("RIFF", 0);
fixture.writeUInt32LE(36 + frames * 2, 4);
fixture.write("WAVEfmt ", 8);
fixture.writeUInt32LE(16, 16);
fixture.writeUInt16LE(1, 20);
fixture.writeUInt16LE(1, 22);
fixture.writeUInt32LE(rate, 24);
fixture.writeUInt32LE(rate * 2, 28);
fixture.writeUInt16LE(2, 32);
fixture.writeUInt16LE(16, 34);
fixture.write("data", 36);
fixture.writeUInt32LE(frames * 2, 40);
for (let i = 0; i < frames; i++)
  fixture.writeInt16LE(
    Math.round(9000 * Math.sin((i / rate) * Math.PI * 880)),
    44 + i * 2,
  );
fs.writeFileSync(microphone, fixture);
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${microphone}`,
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1120 },
    acceptDownloads: true,
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__analysers = [];
    const create = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function () {
      const analyser = create.call(this);
      window.__analysers.push(analyser);
      return analyser;
    };
  });
  const go = (step) => page.locator(`[data-step="${step}"]`).click();
  const rms = (index) =>
    page.evaluate((index) => {
      const analyser = window.__analysers[index],
        data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      return Math.sqrt(
        data.reduce((sum, sample) => sum + sample * sample, 0) / data.length,
      );
    }, index);
  try {
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(
      () => document.querySelector("#weave-canvas").width > 0,
    );
    assert.equal(await page.locator(".studio-pad").count(), 8);
    await page.screenshot({
      path: path.join(out, "melody-desktop.png"),
      fullPage: true,
    });
    // Первый короткий клик, затем полифония и запись.
    await page.locator(".studio-pad").first().click();
    await page.waitForTimeout(150);
    await page.locator("#melody-record").click();
    await page.keyboard.down("a");
    await page.keyboard.down("d");
    await page.waitForTimeout(160);
    assert.equal(await page.locator(".studio-pad.pressed").count(), 2);
    assert.ok((await rms(2)) > 0.0001, "Мелодия должна звучать в своём канале");
    assert.equal(
      await rms(3),
      0,
      "Клавиши не должны дублироваться в басовом канале",
    );
    await page.locator("#music-volume").evaluate((input) => {
      input.value = 0;
      input.dispatchEvent(new Event("input"));
    });
    await page.waitForTimeout(180);
    assert.ok(
      (await rms(2)) < 0.0001,
      "Громкость партии должна реально выключать её звук",
    );
    await page.locator("#music-volume").evaluate((input) => {
      input.value = 65;
      input.dispatchEvent(new Event("input"));
    });
    await page.keyboard.up("a");
    await page.keyboard.up("d");
    await page.keyboard.down("g");
    await page.waitForTimeout(230);
    await page.keyboard.up("g");
    await page.locator("#melody-record").click();
    await page.waitForTimeout(500);
    assert.equal(
      await page.locator(".studio-pad.pressed").count(),
      0,
      "Подсветка исчезает после конца ноты",
    );
    await page.locator("#melody-play").click();
    await page.waitForTimeout(350);
    assert.equal(await page.locator("#melody-play").innerText(), "Пауза");
    await page.locator("#melody-play").click();
    assert.equal(await page.locator("#melody-play").innerText(), "Продолжить");
    await go(1);
    await page.locator('[data-preview="pulse"]').click();
    await page.waitForTimeout(150);
    assert.ok(
      (await rms(3)) > 0.0001,
      "Басовый вариант должен реально звучать",
    );
    await page.locator('[data-add-bass="pulse"]').click();
    assert.equal(
      await page.locator('[data-add-bass="pulse"]').innerText(),
      "Убрать бас",
    );
    await go(2);
    for (const [drum, beat] of [
      [0, 0],
      [0, 4],
      [1, 2],
      [1, 6],
      [2, 0],
      [2, 2],
      [2, 4],
      [2, 6],
    ])
      await page.locator(`[data-drum="${drum}"][data-beat="${beat}"]`).click();
    await page.locator("#rhythm-play").click();
    await page.waitForTimeout(150);
    assert.ok(
      (await rms(4)) > 0.0001,
      "Ударные должны звучать в третьем канале",
    );
    await page.locator("#rhythm-play").click();
    await go(3);
    assert.equal(
      await page.locator(".track-toggles button:disabled").count(),
      0,
    );
    await page
      .locator('.track-toggles button[data-section="1"][data-channel="0"]')
      .click();
    assert.equal(
      await page
        .locator('.track-toggles button[data-section="1"][data-channel="0"]')
        .getAttribute("aria-pressed"),
      "false",
    );
    await page
      .locator('.track-toggles button[data-section="1"][data-channel="0"]')
      .click();
    await page.locator("#track-play").click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator(".track-section.playing").count(), 1);
    await page.locator("#track-play").click();
    const downloadEvent = page.waitForEvent("download");
    await page.locator("#track-download").click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), "kontur-track.wav");
    await download.saveAs(path.join(out, "track.wav"));
    const wav = fs.readFileSync(path.join(out, "track.wav"));
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt16LE(22), 2);
    assert.ok(wav.length > 1000000);
    assert.ok(
      wav.subarray(44).some((byte) => byte !== 0),
      "Экспорт не должен быть тишиной",
    );
    await page.screenshot({
      path: path.join(out, "track-desktop.png"),
      fullPage: true,
    });
    const structure = await page.evaluate(async () => {
      const { Composition } = await import(
        "./js/composition.js?v=20261008-weave"
      );
      const score = new Composition(null);
      score.notes = [{ index: 0, beat: 0, duration: 1 }];
      score.bass = "pulse";
      score.drums[0][0] = true;
      const events = score.events().events;
      return {
        introBass: events.some((e) => e.beat < 8 && e.channel === 1),
        developmentDrums: events.some(
          (e) => e.beat >= 8 && e.beat < 24 && e.channel === 2,
        ),
        finalDrums: events.some((e) => e.beat >= 24 && e.channel === 2),
      };
    });
    assert.deepEqual(structure, {
      introBass: false,
      developmentDrums: true,
      finalDrums: false,
    });
    // Отсутствие горизонтального скролла во всех шагах.
    for (const width of [768, 414, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      for (let step = 0; step < 4; step++) {
        await go(step);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `Переполнение ${width}, шаг ${step}`,
        );
        assert.ok(
          await page.locator("#track-download").evaluate((button) => {
            const r = button.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth;
          }),
          "Кнопки транспорта должны быть целиком видимы",
        );
      }
      await go(0);
      await page.screenshot({
        path: path.join(out, `melody-${width}.png`),
        fullPage: true,
      });
    }
    // Голосовой раздел остаётся рабочим.
    await page.setViewportSize({ width: 1440, height: 1120 });
    await page.locator("#mode-voice").click();
    await page.locator("#voice-record").click();
    await page.waitForFunction(() =>
      document.querySelector("#voice-record").textContent.includes("Закончить"),
    );
    await page.waitForTimeout(900);
    await page.locator("#voice-record").click();
    await page.waitForFunction(
      () => !document.querySelector("#voice-play").disabled,
    );
    await page.locator("#effect-child").evaluate((input) => {
      input.value = 40;
      input.dispatchEvent(new Event("input"));
    });
    await page.locator("#voice-play").click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator("#voice-play").innerText(), "Пауза");
    await page.locator("#voice-play").click();
    await page.screenshot({
      path: path.join(out, "voice-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 414, height: 1000 });
    await page.screenshot({
      path: path.join(out, "voice-414.png"),
      fullPage: true,
    });
    await page.locator("#mode-play").click();
    assert.equal(await page.locator("#play-screen").isVisible(), true);
    await go(0);
    await page.locator("#melody-record").click();
    await page.keyboard.down("a");
    await page.waitForFunction(
      () =>
        document.querySelector("#melody-record").textContent ===
        "Записать мелодию",
      null,
      { timeout: 25000 },
    );
    await page.keyboard.up("a");
    assert.equal(await page.locator("#tempo").count(), 0);
    assert.equal(await page.locator("#melody-play").isEnabled(), true);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: запись, полифония, отдельные каналы, бас, ритм, структура, WAV, голос, 1440/768/414/360.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
