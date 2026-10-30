const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const out =
  process.env.SPLETENIE_OUTPUT || path.join(os.tmpdir(), "spletenie-check");
const url = process.env.SPLETENIE_URL || "http://localhost:4173/";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1120 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  fs.mkdirSync(out, { recursive: true });
  try {
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(out, "intro-1440.png"),
      fullPage: true,
    });
    await page.locator("#start").click();
    await page.waitForFunction(
      () => !document.querySelector("#performance").hidden,
    );
    await page.evaluate(async () => {
      window.instrument = (
        await import(document.querySelector("script[type=module]").src)
      ).instrument;
    });
    await page.waitForTimeout(900);
    console.log(
      "START",
      await page.evaluate(() => ({
        state: instrument.state,
        elapsed: instrument.elapsed,
        error: document.querySelector("#notice").textContent,
      })),
    );
    const rms = () =>
      page.evaluate(() =>
        instrument.graph.channels.map((c) => {
          const d = new Float32Array(512);
          c.meter.getFloatTimeDomainData(d);
          return Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length);
        }),
      );
    await page.waitForFunction(
      () => window.instrument.elapsed > 0.35,
      {},
      { timeout: 15000 },
    );
    let signal = [0, 0, 0];
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(60);
      const sample = await rms();
      signal = signal.map((x, j) => Math.max(x, sample[j]));
    }
    console.log("SOLO", signal);
    assert.ok(signal[0] > 0.0001);
    assert.equal(signal[1], 0);
    assert.equal(signal[2], 0);
    for (const id of ["bass", "rhythm"])
      await page.locator("#" + id).evaluate((n) => {
        n.value = 100;
        n.dispatchEvent(new Event("input", { bubbles: true }));
      });
    signal = [0, 0, 0];
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(80);
      const sample = await rms();
      signal = signal.map((x, j) => Math.max(x, sample[j]));
    }
    console.log("MIX", signal);
    assert.ok(signal[1] > 0.0001);
    assert.ok(signal[2] > 0.0001);
    await page.locator("#brightness").evaluate((n) => {
      n.value = 100;
      n.dispatchEvent(new Event("input"));
    });
    await page.waitForTimeout(200);
    assert.ok(
      await page.evaluate(
        () => instrument.graph.channels[0].filter.frequency.value > 15000,
      ),
    );
    await page.locator("#pause").click();
    await page.waitForFunction(() => window.instrument.state === "paused");
    const before = await page.evaluate(() => instrument.elapsed);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => instrument.elapsed), before);
    assert.equal(await page.locator(".note.sounding").count(), 0);
    await page.locator("#resume").click();
    await page.waitForFunction(() => window.instrument.state === "running");
    for (const width of [1440, 768, 414, 360]) {
      await page.setViewportSize({
        width,
        height: width === 1440 ? 1120 : 1000,
      });
      await page.waitForTimeout(150);
      const bounds = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: innerWidth,
        bad: [...document.querySelectorAll("button,input")]
          .filter((n) => n.getClientRects().length)
          .filter((n) => {
            const r = n.getBoundingClientRect();
            return r.left < -0.5 || r.right > innerWidth + 0.5;
          })
          .map((n) => n.id || n.textContent),
      }));
      assert.ok(bounds.scroll <= width, JSON.stringify(bounds));
      assert.deepEqual(bounds.bad, []);
      await page.screenshot({
        path: path.join(out, "performance-" + width + ".png"),
        fullPage: true,
      });
    }
    await page.locator("[data-score]").first().click();
    assert.equal(await page.evaluate(() => instrument.state), "paused");
    await page.locator("#close-score").click();
    await page.locator("#resume").click();
    await page.waitForFunction(() => window.instrument.state === "running");
    await page.evaluate(() => {
      instrument.arm(1);
      instrument.started -= 31;
      instrument.nextStep = Math.ceil(instrument.elapsed / (60 / 112 / 2));
      instrument.pump();
    });
    assert.equal(await page.locator("#part-title").innerText(), "Бас");
    await page.keyboard.down("a");
    await page.keyboard.down("s");
    await page.waitForTimeout(200);
    assert.ok((await page.locator(".note.sounding").count()) >= 2);
    await page.keyboard.up("a");
    await page.keyboard.up("s");
    await page.evaluate(() => instrument.finish());
    await page.waitForFunction(() => window.instrument.state === "finished");
    assert.equal(await page.locator(".note.sounding").count(), 0);
    const download = page.waitForEvent("download");
    await page.locator("#download").click();
    const file = await download;
    await file.saveAs(path.join(out, "performance.wav"));
    const wav = fs.readFileSync(path.join(out, "performance.wav"));
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt16LE(22), 2);
    assert.ok(wav.length > 100000);
    console.log("WAV", wav.length);
    await page.locator("#again").click();
    assert.ok(await page.locator("#intro").isVisible());
    await page.evaluate(async () => {
      const { Performance } = await import(
        new URL(
          "./audio/performance.js",
          document.querySelector("script[type=module]").src,
        )
      );
      window.short = new Performance({ duration: 4 });
      await short.start(true);
    });
    await page.waitForFunction(
      () => window.short.state === "finished",
      {},
      { timeout: 10000 },
    );
    const complete = await page.evaluate(() => ({
      phase: short.phase,
      duration: short.buffer.duration,
      channels: short.buffer.numberOfChannels,
      peak: short.buffer
        .getChannelData(0)
        .reduce((m, x) => Math.max(m, Math.abs(x)), 0),
    }));
    console.log("NATURAL END", complete);
    assert.equal(complete.phase, 3);
    assert.ok(Math.abs(complete.duration - 4) < 0.02);
    assert.equal(complete.channels, 2);
    assert.ok(complete.peak > 0.01 && complete.peak < 1);

    const full = await page.evaluate(async () => {
      const { createGraph } = await import(
        new URL(
          "./audio/performance.js",
          document.querySelector("script[type=module]").src,
        )
      );
      const { BEAT, PARTS } = await import(
        new URL("./score.js", document.querySelector("script[type=module]").src)
      );
      const context = new OfflineAudioContext(2, 120 * 24000, 24000),
        graph = createGraph(context);
      PARTS.forEach((part, i) =>
        part.values.forEach((v, j) => graph.control(j, v, i * 30)),
      );
      for (let step = 0; (step * BEAT) / 2 < 119.85; step++)
        graph.step(
          step,
          (step * BEAT) / 2,
          (step * BEAT) / 2 >= 120 - BEAT * 4,
        );
      graph.fade.gain.setValueAtTime(1, 112);
      graph.fade.gain.linearRampToValueAtTime(0, 120);
      const audio = await context.startRendering(),
        samples = audio.getChannelData(0);
      const rms = [5, 35, 65, 95].map((s) => {
        let sum = 0;
        for (let k = s * 24000; k < (s + 5) * 24000; k++)
          sum += samples[k] * samples[k];
        return Math.sqrt(sum / (5 * 24000));
      });
      let peak = 0;
      for (const x of samples) peak = Math.max(peak, Math.abs(x));
      return { duration: audio.duration, peak, rms };
    });
    console.log("FULL COMPOSITION", full);
    assert.equal(full.duration, 120);
    assert.ok(full.peak < 1);
    assert.ok(full.rms.every((x) => x > 0.005));
    assert.ok(full.rms[3] > full.rms[0]);

    assert.deepEqual(errors, []);
    console.log(
      "PASS: audio channels, controls, pause, score, notes, responsive bounds, WAV, natural end",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
