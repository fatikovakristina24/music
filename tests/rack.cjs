const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const out =
  process.env.SPLETENIE_OUTPUT || path.join(os.tmpdir(), "spletenie-rack");
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1400 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(process.env.SPLETENIE_URL || "http://localhost:4173/");
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      async () =>
        (window.rack = (
          await import(document.querySelector("script[type=module]").src)
        ).rack),
    );
    for (const width of [1440, 1024, 768, 414, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({
        path: path.join(out, `rack-${width}.png`),
        fullPage: true,
      });
      const bounds = await page.evaluate(() => ({
        w: innerWidth,
        doc: document.documentElement.scrollWidth,
        over: [
          ...document.querySelectorAll("main button,main input,main select"),
        ]
          .filter((n) => {
            const r = n.getBoundingClientRect();
            return r.width && r.right > innerWidth + 1;
          })
          .map((n) => n.textContent || n.id),
      }));
      assert.equal(bounds.doc, bounds.w, JSON.stringify(bounds));
      assert.equal(bounds.over.length, 0, JSON.stringify(bounds));
    }
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.locator("#play").click();
    await page.waitForFunction(
      () => rack.state === "running" && rack.elapsed > 0.5,
      {},
      { timeout: 30000 },
    );
    const sample = () =>
      page.evaluate(async () => {
        const result = [0, 0];
        for (let n = 0; n < 12; n++) {
          rack.channels.forEach((ch, i) => {
            const a = new Float32Array(ch.meter.fftSize);
            ch.meter.getFloatTimeDomainData(a);
            result[i] = Math.max(
              result[i],
              Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length),
            );
          });
          await new Promise((r) => setTimeout(r, 100));
        }
        return result;
      });
    let levels = await sample();
    assert(levels[0] > 0.01);
    assert(levels[1] < 0.001);
    console.log("A SOLO", levels);
    await page.locator('[data-deck-play="1"]').click();
    levels = await sample();
    assert(levels.every((v) => v > 0.005));
    console.log("TWO DECKS", levels);
    await page.evaluate(() => rack.mix(0));
    await page.waitForTimeout(250);
    levels = await sample();
    assert(levels[0] > 0.005 && levels[1] < 0.001);
    await page.evaluate(() => rack.mix(100));
    await page.waitForTimeout(250);
    levels = await sample();
    assert(levels[1] > 0.005 && levels[0] < 0.001);
    await page.evaluate(() => rack.mix(50));
    // All factory loops are non-silent and have exact musical lengths.
    const loops = await page.evaluate(() =>
      rack.library.map((l) => {
        const b = rack.cache.get(rack.key).get(l.id);
        let peak = 0;
        for (const v of b.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
        return {
          id: l.id,
          peak,
          error: Math.abs(b.duration - l.bars * 4 * rack.beat),
        };
      }),
    );
    assert(
      loops.every((l) => l.peak > 0.001 && l.peak < 1 && l.error < 0.0001),
    );
    for (const fx of ["filter", "echo", "room", "drive"])
      await page.locator(`[data-fx="${fx}"]`).click();
    await page.waitForTimeout(300);
    assert(
      await page.evaluate(
        () =>
          rack.filter.frequency.value < 10000 &&
          rack.echoWet.gain.value > 0 &&
          rack.roomWet.gain.value > 0,
      ),
    );
    await page.locator("#reset-fx").click();
    await page.locator("#record").click();
    await page.waitForFunction(() => rack.recording);
    await page.waitForTimeout(350);
    await page.locator("#play").click();
    await page.waitForFunction(() => rack.context.state === "suspended");
    const frozen = await page.evaluate(() => rack.elapsed);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => rack.elapsed), frozen);
    await page.locator("#play").click();
    await page.waitForFunction(() => rack.state === "running");
    await page.locator('[data-assign="0"][data-id="hats"]').click();
    await page.waitForFunction(
      () => rack.decks[0].layers.some((l) => l.id === "hats"),
      {},
      { timeout: 6000 },
    );
    assert.equal(await page.evaluate(() => rack.jobs.length), 0);
    await page
      .locator('[data-layer-action="solo"][data-deck="0"][data-id="hats"]')
      .click();
    assert.equal(
      await page.evaluate(
        () => rack.decks[0].layers.find((l) => l.id === "hats").solo,
      ),
      true,
    );
    await page.locator("#record").click();
    await page.waitForFunction(() => rack.buffer && !rack.recording);
    const wav = await page.evaluate(() => ({
      channels: rack.buffer.numberOfChannels,
      duration: rack.buffer.duration,
      peak: Math.max(
        ...rack.buffer.getChannelData(0).slice(0, 30000).map(Math.abs),
      ),
    }));
    assert.equal(wav.channels, 2);
    assert(wav.duration > 0.5);
    assert(wav.peak > 0.001 && wav.peak < 1);
    const download = page.waitForEvent("download");
    await page.locator("#download").click();
    const dl = await download;
    const file = path.join(out, "mix.wav");
    await dl.saveAs(file);
    assert.equal(fs.readFileSync(file).toString("ascii", 0, 4), "RIFF");
    console.log("RECORD", wav);
    await page.locator("#drop").click();
    await page.waitForFunction(() => !rack.dropping, {}, { timeout: 6000 });
    assert(
      await page.evaluate(
        () => rack.decks[0].layers.find((l) => l.id === "kick").on,
      ),
    );
    await page.locator('[data-scene="2"]').click();
    await page.waitForFunction(
      () => rack.scene === "Кульминация",
      {},
      { timeout: 6000 },
    );
    await page.locator("#save-scene").click();
    assert.equal(await page.locator("[data-recall]").count(), 1);
    await page.locator("#bpm").selectOption("128");
    await page.waitForFunction(
      () => rack.bpm === 128 && !rack.formatBusy,
      {},
      { timeout: 10000 },
    );
    assert.equal(await page.evaluate(() => rack.live.size), 9);
    await page.locator("#edit-beat").click();
    assert.equal(await page.locator(".step").count(), 80);
    await page.locator("#beat-preview").click();
    await page.waitForFunction(
      () => document.querySelector("#beat-preview").textContent === "Стоп",
    );
    await page.locator("#beat-save").click();
    await page.waitForFunction(
      () => !document.querySelector("#beat-dialog").open,
    );
    assert(await page.evaluate(() => rack.library.some((l) => l.grid)));
    await page.locator("#stop").click();
    await page.waitForFunction(
      () => rack.state === "idle" && rack.context.state === "suspended",
    );
    assert.equal(await page.evaluate(() => rack.live.size), 0);
    await page.locator("#example").click();
    await page.waitForFunction(() => rack.demo && rack.recording);
    await page.evaluate(() => {
      rack.started = rack.context.currentTime - rack.beat * 4 * 55.8;
    });
    await page.waitForFunction(
      () => rack.state === "idle" && rack.buffer && !rack.recording,
      {},
      { timeout: 6000 },
    );
    assert.equal(await page.evaluate(() => rack.scene), "Финал");
    // Decode a local WAV into the library, then play it as a loop.
    await page.locator("#audio-file").setInputFiles(file);
    await page.waitForFunction(() => rack.library.some((l) => l.buffer));
    await page.locator("#new").click();
    await page.locator("#confirm-new").click();
    await page.waitForFunction(() => rack.decks.every((d) => !d.layers.length));
    assert.equal(await page.locator(".empty-deck").count(), 2);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: responsive bounds, dual audio, quantization, solo, drop, scenes, tempo, rhythm editor, WAV, pause, example ending, import, reset",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
