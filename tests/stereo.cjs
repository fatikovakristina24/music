const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__oscillators = [];
      window.__analysers = [];
      const analyse = AudioContext.prototype.createAnalyser;
      AudioContext.prototype.createAnalyser = function () {
        const node = analyse.call(this);
        window.__analysers.push(node);
        return node;
      };
      const create = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const oscillator = create.call(this);
        window.__oscillators.push(oscillator);
        return oscillator;
      };
    });
    await page.goto(process.env.CONTOUR_URL || "http://localhost:4173");
    const report = await page.evaluate(async () => {
      const { AudioEngine } = await import(
        "./js/audio/engine.js?v=20261005-center2"
      );
      const engine = new AudioEngine();
      const initialPan = engine.layers.map((layer) => layer.pan);
      engine.layers[0].pan = -100;
      engine.layers[1].pan = 100;
      engine.synthSettings.release = 0.1;
      engine.layers.forEach((layer) => {
        layer.room = layer.echo = 0;
      });
      const notes = [{ index: 0, time: 0.02, duration: 0.25 }];
      const render = () => engine.exportMelody(notes, 0.5);
      const rms = (buffer, channel, start = 0.08, end = 0.2) => {
        const data = buffer
          .getChannelData(channel)
          .slice(
            Math.floor(start * buffer.sampleRate),
            Math.floor(end * buffer.sampleRate),
          );
        return Math.sqrt(
          data.reduce((sum, sample) => sum + sample * sample, 0) / data.length,
        );
      };
      const hz = (buffer, channel) => {
        const data = buffer.getChannelData(channel),
          rate = buffer.sampleRate;
        let count = 0;
        for (let i = Math.floor(rate * 0.08); i < Math.floor(rate * 0.2); i++)
          if (data[i - 1] <= 0 && data[i] > 0) count++;
        return count / 0.12;
      };
      const both = await render();
      engine.layers[0].enabled = false;
      const disabledA = await render();
      engine.layers[1].enabled = false;
      const disabledBoth = await render();
      engine.layers[0].enabled = true;
      const disabledB = await render();
      engine.layers[1].enabled = true;
      engine.layers[1].volume = 0;
      const onlyA = await render();
      engine.layers[0].volume = 0;
      engine.layers[1].volume = 50;
      const onlyB = await render();
      engine.layers[1].pan = -100;
      const panB = await render();
      engine.layers[1].pan = 100;
      engine.layers[1].preset = "bright";
      engine.layers[1].filter = 6000;
      const open = await render();
      engine.layers[1].filter = 100;
      const closed = await render();
      engine.layers[1].filter = 6000;
      engine.layers[1].echo = 60;
      const echo = await render();
      engine.layers[1].echo = 0;
      engine.layers[1].room = 100;
      const room = await render();
      engine.layers[1].volume = 0;
      const muted = await render();
      return {
        initialPan,
        both: [rms(both, 0), rms(both, 1)],
        disabledA: [rms(disabledA, 0), rms(disabledA, 1)],
        disabledB: [rms(disabledB, 0), rms(disabledB, 1)],
        disabledBoth: [rms(disabledBoth, 0), rms(disabledBoth, 1)],
        onlyA: [rms(onlyA, 0), rms(onlyA, 1)],
        onlyB: [rms(onlyB, 0), rms(onlyB, 1)],
        frequencies: [hz(both, 0), hz(both, 1)],
        panB: [rms(panB, 0), rms(panB, 1)],
        filter: [rms(open, 1), rms(closed, 1)],
        echo: [rms(echo, 0, 0.87, 1.02), rms(echo, 1, 0.87, 1.02)],
        room: [rms(room, 0, 0.7, 0.85), rms(room, 1, 0.7, 0.85)],
        mute: [rms(muted, 0), rms(muted, 1)],
      };
    });
    assert.deepEqual(
      report.initialPan,
      [0, 0],
      "Both voices start in the centre",
    );
    assert.equal(await page.locator("#synth-pan").inputValue(), "0");
    assert.ok(
      report.both.every((value) => value > 0.005),
      "Both channels sound simultaneously",
    );
    assert.ok(
      report.onlyA[0] > 0.005 && report.onlyA[1] < 1e-8,
      "A is isolated in L",
    );
    assert.ok(
      report.onlyB[1] > 0.005 && report.onlyB[0] < 1e-8,
      "B is isolated in R",
    );
    assert.ok(
      Math.abs(report.frequencies[0] - 261.6) < 12 &&
        Math.abs(report.frequencies[1] - 130.8) < 12,
      "The two voices have different real timbres/octaves",
    );
    assert.ok(
      report.panB[0] > 0.005 && report.panB[1] < 1e-8,
      "Pan really changes routing",
    );
    assert.ok(
      report.filter[0] > report.filter[1] * 3,
      "Filter attenuates high frequencies",
    );
    assert.ok(
      report.echo[1] > 0.001 && report.echo[0] < 1e-8,
      "B echo stays in B's channel",
    );
    assert.ok(
      report.room[1] > 0.00001 && report.room[0] < 1e-8,
      "B reverb stays in B's channel",
    );
    assert.deepEqual(report.mute, [0, 0]);
    assert.ok(report.disabledA[0] < 1e-8 && report.disabledA[1] > 0.005);
    assert.ok(report.disabledB[1] < 1e-8 && report.disabledB[0] > 0.005);
    assert.deepEqual(report.disabledBoth, [0, 0]);
    const range = async (id, value) =>
      page.locator(id).evaluate((input, value) => {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    await range("#synth-filter", 1000);
    await range("#synth-volume", 17);
    await page.locator('[data-preset="bright"]').click();
    await page.locator('[data-layer="1"]').click();
    assert.equal(await page.locator("#synth-pan").inputValue(), "0");
    await range("#synth-pan", 100);
    assert.equal(await page.locator("#synth-filter").inputValue(), "950");
    assert.equal(await page.locator("#synth-volume").inputValue(), "50");
    assert.equal(
      await page.locator('[data-preset="bass"]').getAttribute("aria-pressed"),
      "true",
    );
    await range("#synth-filter", 3000);
    await range("#synth-volume", 44);
    await page.locator('[data-layer="0"]').click();
    await range("#synth-pan", -100);
    assert.equal(await page.locator("#synth-filter").inputValue(), "1000");
    assert.equal(await page.locator("#synth-volume").inputValue(), "17");
    assert.equal(
      await page.locator('[data-preset="bright"]').getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#loop-record").click();
    await page.keyboard.down("KeyA");
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(250);
    assert.equal(await page.locator(".pad.pressed").count(), 2);
    assert.equal(
      await page.evaluate(() => window.__oscillators.length),
      4,
      "Two voices per note in live playback",
    );
    const outputLevel = () =>
      page.evaluate(() => {
        const data = new Float32Array(2048);
        window.__analysers[0].getFloatTimeDomainData(data);
        return Math.sqrt(
          data.reduce((sum, sample) => sum + sample * sample, 0) / data.length,
        );
      });
    await page.locator('[data-layer-toggle="0"]').click();
    await page.locator('[data-layer-toggle="1"]').click();
    await page.waitForTimeout(500);
    assert.ok(
      (await outputLevel()) < 0.00001,
      "Both switches mute live audio, including effect tails",
    );
    await page.locator('[data-layer="1"]').click();
    assert.equal(
      await page
        .locator('[data-layer-toggle="1"]')
        .getAttribute("aria-pressed"),
      "false",
      "Selecting settings does not enable a voice",
    );
    await page.locator('[data-layer-toggle="0"]').click();
    await page.waitForTimeout(250);
    assert.ok(
      (await outputLevel()) > 0.001,
      "A can resume while B is disabled",
    );
    assert.equal(
      await page.locator('[data-layer-toggle="0"]').textContent(),
      "Вкл",
    );
    await page.locator('[data-layer-toggle="1"]').click();
    await page.keyboard.up("KeyA");
    await page.keyboard.up("KeyD");
    await page.locator("#loop-record").click();
    const pending = page.waitForEvent("download");
    await page.locator("#loop-download").click();
    const file = await (await pending).path();
    const wav = fs.readFileSync(file);
    assert.equal(wav.readUInt16LE(22), 2);
    let left = 0,
      right = 0,
      different = 0;
    for (let i = 44; i + 3 < wav.length; i += 4) {
      const l = wav.readInt16LE(i),
        r = wav.readInt16LE(i + 2);
      left += l * l;
      right += r * r;
      different += Math.abs(l - r);
    }
    assert.ok(
      left > 0 && right > 0 && different > 1000,
      "Downloaded WAV contains two distinct sounding channels",
    );
    assert.deepEqual(errors, []);
    fs.mkdirSync("test-results", { recursive: true });
    fs.writeFileSync(
      "test-results/stereo.json",
      JSON.stringify(report, null, 2),
    );
    console.log(
      "Two voices, independent effects, L/R routing, live polyphony and stereo WAV: passed",
      report,
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
