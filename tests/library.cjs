const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__pitches = [];
      window.__events = [];
      const create = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        window.__audioContext = this;
        const node = create.call(this),
          start = node.start.bind(node);
        node.start = (...args) => {
          window.__pitches.push(node.frequency.value);
          window.__events.push({
            frequency: node.frequency.value,
            when: args[0],
          });
          return start(...args);
        };
        return node;
      };
    });
    await page.goto(process.env.CONTOUR_URL || "http://localhost:4173");
    const themes = await page.evaluate(async () => {
      const { MELODIES } = await import("./js/melodies.js?v=20261005-labels1");
      return MELODIES.map((m) => ({
        id: m.id,
        title: m.title,
        notes: m.notes.length,
        duration: m.duration,
        frequency: m.notes[0].frequency,
        valid: m.notes.every(
          (n) =>
            n.index >= 0 &&
            n.index <= 7 &&
            n.frequency > 0 &&
            n.duration > 0 &&
            Number.isFinite(n.time),
        ),
      }));
    });
    assert.equal(themes.length, 20);
    assert.equal(new Set(themes.map((t) => t.title)).size, 20);
    assert.equal(themes[0].title, "Ода к радости");
    assert(themes.every((t) => t.valid && t.notes >= 16 && t.duration > 3));
    await page.click("#loop-record");
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(160);
    await page.keyboard.up("KeyA");
    await page.click("#loop-record");
    for (const theme of themes) {
      await page.evaluate(() => (window.__pitches = []));
      await page.click("#melody-library summary");
      await page.click(`[data-melody="${theme.id}"]`);
      await page.waitForFunction(() => window.__pitches.length >= 2);
      const pitches = await page.evaluate(() => window.__pitches.slice(0, 2));
      assert(Math.abs(pitches[0] - theme.frequency) < 0.001);
      assert(Math.abs(pitches[1] - theme.frequency / 2) < 0.001);
      assert.equal(
        await page.locator("#melody-library").getAttribute("open"),
        null,
      );
      assert(
        (await page.locator("#melody-selected").textContent()).includes(
          theme.title,
        ),
      );
      assert.equal(await page.locator("#melody-stop").isDisabled(), false);
      assert.equal(await page.locator("#loop-download").isDisabled(), false);
    }
    await page.click("#melody-stop");
    assert.equal(await page.locator("#melody-stop").isDisabled(), true);
    await page.evaluate(() => {
      window.__events = [];
    });
    await page.click("#melody-library summary");
    await page.click('[data-melody="1"]');
    await page.waitForFunction(() => window.__events.length >= 2);
    const sync = await page.evaluate(async () => {
      const { MELODIES } = await import("./js/melodies.js?v=20261005-labels1");
      const melody = MELODIES[1],
        started = window.__events[0].when;
      const errors = [];
      let checked = 0;
      await new Promise((resolve) => {
        const frame = () => {
          const elapsed = window.__audioContext.currentTime - started;
          const note = melody.notes.find(
            (n) =>
              elapsed >= n.time + 0.03 && elapsed < n.time + n.duration - 0.03,
          );
          if (note) {
            checked++;
            const status = document.querySelector("#synth-status").textContent;
            const pad =
              document.querySelectorAll(".pad .note")[note.index].textContent;
            if (status !== note.label || pad !== note.label)
              errors.push({ expected: note.label, status, pad });
          }
          if (elapsed >= 2) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      return { checked, errors };
    });
    assert(sync.checked > 20);
    assert.deepEqual(
      sync.errors,
      [],
      "Current note labels follow the audio clock, including sharps and release tails",
    );
    await page.click("#melody-stop");
    const shortest = themes.reduce((a, b) => (a.duration < b.duration ? a : b));
    await page.click("#melody-library summary");
    await page.click(`[data-melody="${shortest.id}"]`);
    await page.waitForFunction(
      () => document.querySelector("#melody-stop").disabled,
      null,
      { timeout: Math.ceil(shortest.duration * 1000) + 6000 },
    );
    await page.click("#melody-library summary");
    await page.click('[data-melody="0"]');
    await page.click("#mode-voice");
    assert.equal(await page.locator("#melody-stop").isDisabled(), true);
    await page.click("#mode-play");
    for (const width of [320, 414, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.click("#melody-library summary");
      const bounds = await page.evaluate(() => {
        const menu = document
          .querySelector(".melody-menu")
          .getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          left: menu.left,
          right: menu.right,
          width: innerWidth,
        };
      });
      assert.equal(bounds.overflow, false);
      assert(bounds.left >= 0 && bounds.right <= bounds.width + 0.1);
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator("#melody-library").getAttribute("open"),
        null,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: 20 themes, exact pitches, selection, stop, natural completion, preserved recording, mode cleanup, dropdown bounds and Escape.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
