const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(process.env.CONTOUR_URL || "http://localhost:4173");
    await page.waitForFunction(
      () => document.querySelectorAll(".pad").length === 8,
    );
    const range = async (id, value) =>
      page.locator(id).evaluate((input, value) => {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    const picture = () =>
      page.locator("#synth-canvas").evaluate((canvas) => canvas.toDataURL());
    await range("#synth-release", 0.1);
    await range("#synth-echo", 0);
    await page.waitForTimeout(250);
    const idle = await picture();
    const frames = [];
    for (const key of [
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyF",
      "KeyG",
      "KeyH",
      "KeyJ",
      "KeyK",
    ]) {
      await page.keyboard.down(key);
      await page.waitForFunction(
        () => document.querySelectorAll(".pad.pressed").length === 1,
      );
      await page.waitForTimeout(350);
      frames.push(await picture());
      fs.mkdirSync("test-results", { recursive: true });
      await page.screenshot({ path: `test-results/motion-${key}.png` });
      await page.keyboard.up(key);
      await page.waitForTimeout(700);
    }
    assert.equal(
      new Set(frames).size,
      8,
      "Each note produces a distinct contour",
    );
    for (const frame of frames)
      assert.notEqual(frame, idle, "A note visibly changes the idle contour");
    await page.keyboard.down("KeyA");
    await page.keyboard.down("KeyD");
    await page.keyboard.down("KeyG");
    await page.waitForTimeout(350);
    const chord = await picture();
    assert.ok(!frames.includes(chord), "A chord combines the note shapes");
    await range("#synth-volume", 0);
    await page.waitForTimeout(1300);
    assert.equal(
      await picture(),
      idle,
      "Muted audio returns the visual to its idle shape",
    );
    await range("#synth-volume", 65);
    await page.keyboard.up("KeyA");
    await page.keyboard.up("KeyD");
    await page.keyboard.up("KeyG");
    await page.waitForTimeout(1000);
    assert.equal(
      await picture(),
      idle,
      "Released notes leave no lingering animation",
    );
    for (const width of [1440, 1280, 775]) {
      await page.setViewportSize({ width, height: 700 });
      await page.waitForTimeout(200);
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        "No horizontal overflow",
      );
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    assert.deepEqual(errors, []);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll(".pad").length === 8,
    );
    await page.waitForTimeout(250);
    await page.keyboard.down("KeyA");
    await page.keyboard.down("KeyD");
    await page.keyboard.down("KeyG");
    await page.waitForTimeout(500);
    const output = path.join(process.cwd(), "test-results");
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "note-motion.png") });
    const first = await picture();
    await page.waitForTimeout(200);
    assert.notEqual(
      await picture(),
      first,
      "The contour continues moving during a held note",
    );
    console.log(
      "PASS: eight distinct note shapes, chord mixing, mute/release, reduced motion, animation",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message.split("\n")[0]);
  process.exitCode = 1;
});
