const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const url = process.env.CONTOUR_URL || "http://localhost:4173";
const output = path.join(process.cwd(), "test-results");
fs.mkdirSync(output, { recursive: true });
const fixture = path.join(os.tmpdir(), "contour-mobile-microphone.wav");
const rate = 48000,
  frames = rate * 24;
const wav = Buffer.alloc(44 + frames * 2);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + frames * 2, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(frames * 2, 40);
for (let i = 0; i < frames; i++)
  wav.writeInt16LE(
    Math.round(9000 * Math.sin((2 * Math.PI * 440 * i) / rate)),
    44 + i * 2,
  );
fs.writeFileSync(fixture, wav);
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${fixture}`,
    ],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 414, height: 896 },
      isMobile: true,
      hasTouch: true,
      permissions: ["microphone"],
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__analysers = [];
      const create = AudioContext.prototype.createAnalyser;
      AudioContext.prototype.createAnalyser = function () {
        const n = create.call(this);
        window.__analysers.push(n);
        return n;
      };
    });
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(
      () => document.querySelector("#synth-canvas").width > 300,
    );
    const layout = await page.evaluate(() => {
      const b = (s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        stage: b("#synth-stage"),
        pads: [...document.querySelectorAll(".pad")].map((p) => {
          const r = p.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
        loop: b(".loop-panel"),
        controls: b(".synth-controls"),
        horizontal:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
        zoom: document.querySelector(".instrument").style.zoom,
      };
    });
    assert.equal(layout.stage.width, 374);
    assert.equal(layout.stage.height, 254);
    assert.equal(layout.pads[0].height, 92);
    assert.equal(layout.pads[0].width, 87.5);
    assert.equal(layout.pads[0].y, layout.pads[3].y);
    assert.ok(layout.pads[4].y > layout.pads[0].y);
    assert.ok(layout.controls.y > layout.loop.y);
    assert.equal(layout.horizontal, false);
    assert.equal(layout.zoom, "1");
    await page.screenshot({
      path: path.join(output, "mobile-ready.png"),
      fullPage: true,
    });
    const cdp = await context.newCDPSession(page);
    // Первое полное касание разрешает звук по правилам мобильного браузера.
    await page.locator(".pad").first().tap();
    await page.waitForFunction(
      () => window.__analysers[0]?.context.state === "running",
    );
    const touches = [0, 4].map((i, id) => ({
      x: layout.pads[i].x + 30,
      y: layout.pads[i].y + 30,
      id: id + 1,
    }));
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: touches,
    });
    await page.waitForFunction(
      () => document.querySelectorAll(".pad.pressed").length === 2,
    );
    await page.waitForTimeout(300);
    const energy = () =>
      page.evaluate(() => {
        const a = window.__analysers[0],
          v = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(v);
        return Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
      });
    assert.ok((await energy()) > 0.005, "Real audio during a touch chord");
    await page.screenshot({
      path: path.join(output, "mobile-chord.png"),
      fullPage: true,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForFunction(
      () => document.querySelectorAll(".pad.pressed").length === 0,
    );
    await page.locator("#loop-record").tap();
    await page.locator(".pad").nth(2).tap();
    await page.waitForTimeout(400);
    await page.locator("#loop-record").tap();
    assert.ok(await page.locator("#loop-play").isEnabled());
    await page.locator("#loop-play").tap();
    await page.waitForTimeout(300);
    assert.match(await page.locator("#loop-status").textContent(), /Повторяем/);
    await page.locator("#loop-play").tap();
    await page.locator("#help-open").tap();
    assert.ok(await page.locator("#help-dialog").isVisible());
    assert.ok(
      await page.getByRole("heading", { name: "Играй касанием" }).isVisible(),
    );
    await page.screenshot({ path: path.join(output, "mobile-help.png") });
    await page.locator("#help-done").tap();
    await page.locator("#mode-voice").tap();
    await page.screenshot({
      path: path.join(output, "mobile-voice-empty.png"),
      fullPage: true,
    });
    assert.equal(await page.locator("#effect-child").count(), 1);
    assert.equal(await page.locator("#voice-delete").isVisible(), false);
    await page.locator("#voice-record").tap();
    await page.waitForFunction(() =>
      document
        .querySelector("#voice-record")
        .textContent.includes("Остановить"),
    );
    await page.waitForTimeout(900);
    await page.locator("#voice-record").tap();
    await page.waitForFunction(
      () => !document.querySelector("#voice-play").disabled,
    );
    await page.locator("#voice-play").tap();
    await page.locator("#effect-child").evaluate((e) => {
      e.value = 75;
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.ok(await page.locator("#voice-download").isVisible());
    await page.screenshot({
      path: path.join(output, "mobile-voice-effects.png"),
      fullPage: true,
    });
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#voice-download").tap();
    const download = await downloadPromise;
    await download.saveAs(path.join(output, "mobile-voice.wav"));
    assert.ok(fs.statSync(path.join(output, "mobile-voice.wav")).size > 1000);
    await page.locator("#voice-delete").tap();
    assert.equal(await page.locator("#voice-download").isVisible(), false);
    for (const width of [320, 375, 390, 414, 600, 775, 1440]) {
      await page.setViewportSize({ width, height: 896 });
      await page.waitForTimeout(100);
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        `No overflow at ${width}`,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: mobile layout, multitouch audio, loop, microphone, child effect, WAV, help, responsive widths",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
