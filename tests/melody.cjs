const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const output = path.join(process.cwd(), "test-results");
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.env.CONTOUR_URL || "http://localhost:4173");
    const render = await page.evaluate(async () => {
      const { AudioEngine } = await import(
        "./js/audio/engine.js?v=20261005-center1"
      );
      const engine = new AudioEngine();
      const rms = (buffer, start, end) => {
        const data = buffer
          .getChannelData(0)
          .slice(
            Math.floor(start * buffer.sampleRate),
            Math.floor(end * buffer.sampleRate),
          );
        return Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length);
      };
      const frequency = (buffer) => {
        const data = buffer.getChannelData(0),
          rate = buffer.sampleRate;
        let crosses = 0;
        for (let i = rate * 0.1; i < rate * 0.3; i++)
          if (data[i - 1] <= 0 && data[i] > 0) crosses++;
        return crosses / 0.2;
      };
      const notes = [
        { index: 0, time: 0.05, duration: 0.4 },
        { index: 4, time: 0.05, duration: 0.4 },
        { index: 2, time: 0.8, duration: 0.4 },
      ];
      engine.synthSettings = {
        preset: "soft",
        volume: 65,
        echo: 0,
        release: 0.1,
      };
      engine.layers[0] = {
        preset: "soft",
        volume: 65,
        filter: 6000,
        pan: -100,
        room: 0,
        echo: 0,
      };
      engine.layers[1].volume = 0;
      engine.layers[1].room = engine.layers[1].echo = 0;
      const chord = await engine.exportMelody(notes, 1.4);
      const solo = await engine.exportMelody(
        [{ index: 0, time: 0, duration: 0.4 }],
        0.5,
      );
      engine.layers[0].preset = "bass";
      const bass = await engine.exportMelody(
        [{ index: 0, time: 0, duration: 0.4 }],
        0.5,
      );
      engine.layers[0].echo = 60;
      const echo = await engine.exportMelody(
        [{ index: 0, time: 0, duration: 0.4 }],
        0.5,
      );
      engine.synthSettings.volume = 0;
      const mute = await engine.exportMelody(notes, 1.4);
      engine.synthSettings.volume = 65;
      const longNotes = Array.from({ length: 40 }, (_, i) => ({
        index: i % 8,
        time: i * 0.45,
        duration: 0.15,
      }));
      const long = await engine.exportMelody(longNotes, 20);
      return {
        channels: chord.numberOfChannels,
        duration: chord.duration,
        first: rms(chord, 0.1, 0.3),
        gap: rms(chord, 0.65, 0.75),
        last: rms(chord, 0.85, 1),
        soloHz: frequency(solo),
        bassHz: frequency(bass),
        echoTail: rms(echo, 0.9, 1.1),
        echoDuration: echo.duration,
        mute: rms(mute, 0.1, 0.3),
        longLast: rms(long, 17.6, 17.65),
        longDuration: long.duration,
      };
    });
    assert.equal(render.channels, 2);
    assert.ok(render.duration >= 1.54 && render.duration < 1.55);
    assert.ok(render.first > 0.01 && render.last > 0.01);
    assert.ok(render.gap < 0.0001);
    assert.ok(Math.abs(render.soloHz - 261.6) < 10);
    assert.ok(Math.abs(render.bassHz - 130.8) < 10);
    assert.ok(render.echoTail > 0.001 && render.echoDuration > 3);
    assert.equal(render.mute, 0);
    assert.ok(render.longLast > 0.001 && render.longDuration > 20);
    assert.equal(await page.locator("#loop-download").isEnabled(), false);
    await page.locator("#loop-record").click();
    assert.equal(await page.locator("#loop-download").isEnabled(), false);
    await page.keyboard.down("KeyA");
    await page.keyboard.down("KeyG");
    await page.waitForTimeout(250);
    await page.keyboard.up("KeyA");
    await page.keyboard.up("KeyG");
    await page.locator("#loop-record").click();
    assert.ok(await page.locator("#loop-download").isEnabled());
    await page.locator("#loop-play").click();
    const pending = page.waitForEvent("download");
    await page.locator("#loop-download").click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), "kontur-melody.wav");
    const file = path.join(output, "melody.wav");
    await download.saveAs(file);
    const wav = fs.readFileSync(file);
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.toString("ascii", 8, 12), "WAVE");
    assert.equal(wav.readUInt16LE(22), 2);
    assert.ok(wav.length > 10000);
    assert.match(await page.locator("#loop-status").textContent(), /Повторяем/);
    await page.locator("#loop-clear").click();
    assert.equal(await page.locator("#loop-download").isEnabled(), false);
    for (const width of [320, 414, 600, 775, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await page.waitForTimeout(100);
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: melody WAV, polyphony/timing, 40 notes, presets, mute, echo tails, download states and layout",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
