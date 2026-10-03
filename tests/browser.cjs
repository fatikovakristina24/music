/* Run with Node and Playwright installed; see tests/README.md. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const baseURL = process.env.CONTOUR_URL || 'http://localhost:4173';
const output = path.join(process.cwd(), 'test-results');
fs.mkdirSync(output, { recursive:true });
const fixture = path.join(os.tmpdir(), 'contour-test-microphone.wav');
const rate = 48000, frames = rate * 24;
const wav = Buffer.alloc(44 + frames * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + frames * 2, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
for (let i = 0; i < frames; i++) wav.writeInt16LE(Math.round(9000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
fs.writeFileSync(fixture, wav);

(async () => {
  const browser = await chromium.launch({ headless:true, args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${fixture}`] });
  const context = await browser.newContext({ viewport:{ width:1440, height:960 }, acceptDownloads:true, permissions:['microphone'] });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__analysers = []; window.__streams = [];
    const create = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function () { const node = create.call(this); window.__analysers.push(node); return node; };
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (...args) => { const stream = await original(...args); window.__streams.push(stream); return stream; };
  });
  const range = async (id, value) => page.locator(id).evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles:true })); }, value);
  const rms = () => page.evaluate(() => { const data = new Float32Array(2048); window.__analysers[0].getFloatTimeDomainData(data); return Math.sqrt(data.reduce((s, x) => s + x * x, 0) / data.length); });

  try {
    await page.goto(baseURL); await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelector('#synth-canvas').width > 0);
    assert.equal(await page.locator('.pad').count(), 8);
    await page.screenshot({ path:path.join(output, 'synth-ready.png') });
    const bounds = await page.evaluate(() => Object.fromEntries(['#synth-stage','.synth-controls','.pads','.loop-panel'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, { x:r.x,y:r.y,width:r.width,height:r.height }]; })));
    assert.equal(bounds['#synth-stage'].x, 48); assert.equal(bounds['#synth-stage'].y, 116);
    assert.equal(bounds['.synth-controls'].x, 1048); assert.ok(Math.abs(bounds['.pads'].y - 674) < 1);
    assert.ok(Math.abs(bounds['.loop-panel'].y - 850) < 1);

    // The first quick click must unlock audio and still produce a note.
    await page.locator('.pad').first().click(); await page.waitForTimeout(120);
    assert.ok(await rms() > .005, 'First click is audible');
    await page.keyboard.down('KeyA'); await page.keyboard.down('KeyD'); await page.keyboard.down('KeyG');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.pad.pressed').count(), 3);
    assert.ok(await rms() > .02, 'Chord produces real audio');
    await page.screenshot({ path:path.join(output, 'synth-active.png') });
    await range('#synth-volume', 0); await page.waitForTimeout(400);
    assert.ok(await rms() < .001, 'Volume slider actually mutes');
    await range('#synth-volume', 65);
    await page.keyboard.up('KeyA'); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyG');
    await page.locator('[data-preset="bass"]').click();
    assert.equal(await page.locator('[data-preset="bass"]').getAttribute('aria-pressed'), 'true');

    await page.locator('#loop-record').click();
    await page.keyboard.down('KeyS'); await page.waitForTimeout(120); await page.keyboard.up('KeyS');
    await page.waitForTimeout(180); await page.keyboard.down('KeyF'); await page.waitForTimeout(120); await page.keyboard.up('KeyF');
    await page.locator('#loop-record').click(); await page.locator('#loop-play').click();
    await page.waitForTimeout(160);
    assert.ok((await page.locator('#loop-status').textContent()).includes('Повторяем'));
    assert.ok(await rms() > .005, 'Loop produces real audio');
    await page.locator('#loop-play').click();
    assert.equal(await page.locator('#loop-play').textContent(), '▶ Повтор');
    await page.locator('#loop-clear').click(); assert.equal(await page.locator('#loop-play').isDisabled(), true);
    await page.locator('#help-open').click(); assert.equal(await page.locator('#help-dialog').isVisible(), true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#help-dialog').isVisible(), false);

    await page.locator('#mode-voice').click();
    assert.equal(await page.locator('#effect-pitch').isDisabled(), true);
    await page.locator('#voice-record').click();
    await page.waitForFunction(() => document.querySelector('#voice-record').textContent.includes('Закончить'));
    await page.waitForTimeout(850); await page.locator('#voice-record').click();
    await page.waitForFunction(() => !document.querySelector('#voice-play').disabled);
    assert.equal(await page.locator('#effect-pitch').isDisabled(), false);
    for (const [name, value] of Object.entries({ pitch:4, robot:45, echo:24, room:35, distortion:12, radio:30 })) await range(`#effect-${name}`, value);
    await page.locator('#voice-play').click(); await page.waitForTimeout(180);
    assert.equal(await page.locator('#voice-play').textContent(), 'Ⅱ Пауза');
    await page.screenshot({ path:path.join(output, 'voice-playing.png') });
    await range('#effect-pitch', 7); await page.locator('#voice-play').click();
    assert.equal(await page.locator('#voice-play').textContent(), '▶ Продолжить');
    await page.locator('#voice-play').click(); await page.waitForTimeout(150);
    await page.locator('#voice-play').click();
    const downloadPromise = page.waitForEvent('download'); await page.locator('#voice-download').click();
    const download = await downloadPromise; const downloaded = path.join(output, 'voice.wav'); await download.saveAs(downloaded);
    const saved = fs.readFileSync(downloaded);
    assert.equal(saved.toString('ascii', 0, 4), 'RIFF'); assert.equal(saved.toString('ascii', 8, 12), 'WAVE');
    assert.ok(saved.length > 48000, 'Processed WAV contains samples and effect tails');
    await page.locator('#voice-reset').click();
    assert.equal(await page.locator('#effect-pitch').inputValue(), '0'); assert.equal(await page.locator('#effect-room').inputValue(), '0');
    await page.locator('#voice-delete').click(); assert.equal(await page.locator('#voice-play').isDisabled(), true);

    // An actual worklet recording must stop itself at exactly 20 seconds.
    await page.locator('#voice-record').click();
    await page.waitForFunction(() => document.querySelector('#voice-record').textContent.includes('Закончить'));
    await page.waitForFunction(() => !document.querySelector('#voice-play').disabled, null, { timeout:24000 });
    assert.ok((await page.locator('#voice-summary').textContent()).includes('20.0'), '20-second cap');
    assert.equal(await page.evaluate(() => window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))), true, 'Microphone is released');

    // Compare every effect against a dry reference using offline audio, not UI labels.
    const dsp = await page.evaluate(async () => {
      const { AudioEngine } = await import('/js/audio/engine.js');
      const { DEFAULT_EFFECTS } = await import('/js/audio/effects.js');
      const { shiftBuffer } = await import('/js/audio/pitch-dsp.js');
      const engine = new AudioEngine(), sourceContext = new OfflineAudioContext(1, 44100, 44100);
      const input = sourceContext.createBuffer(1, 44100, 44100), samples = input.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = .18 * Math.sin(2 * Math.PI * 440 * i / 44100) + .08 * Math.sin(2 * Math.PI * 1500 * i / 44100) + .05 * Math.sin(2 * Math.PI * 5000 * i / 44100);
      const dry = (await engine.exportVoice(input)).getChannelData(0); const changes = {};
      for (const name of ['robot','echo','room','distortion','radio','pitch']) {
        engine.effects = { ...DEFAULT_EFFECTS, [name]:name === 'pitch' ? 12 : 60 };
        const rendered = await engine.exportVoice(input), audio = rendered.getChannelData(0);
        let difference = 0, peak = 0, tailEnergy = 0;
        for (let i = 0; i < audio.length; i++) { peak = Math.max(peak, Math.abs(audio[i])); if (i < dry.length) difference += (audio[i] - dry[i]) ** 2; else tailEnergy += audio[i] ** 2; }
        changes[name] = { difference:Math.sqrt(difference / dry.length), peak, tail:tailEnergy, duration:rendered.duration };
      }
      const tone = sourceContext.createBuffer(1, 44100, 44100); const raw = tone.getChannelData(0);
      for (let i = 0; i < raw.length; i++) raw[i] = .3 * Math.sin(2 * Math.PI * 440 * i / 44100);
      const shifted = shiftBuffer(sourceContext, tone, 12).getChannelData(0);
      const magnitude = frequency => {
        let a = 0, b = 0;
        for (let i = 12000; i < 22000; i++) { const t = 2 * Math.PI * frequency * i / 44100; a += shifted[i] * Math.cos(t); b += shifted[i] * Math.sin(t); }
        return Math.hypot(a, b);
      };
      return { changes, pitch:{ at440:magnitude(440), at880:magnitude(880), length:shifted.length, originalLength:raw.length } };
    });
    for (const [name, result] of Object.entries(dsp.changes)) {
      assert.ok(result.difference > .005, `${name} changes the actual sound`);
      assert.ok(result.peak < 1, `${name} does not clip`);
      if (['echo','room'].includes(name)) assert.ok(result.tail > .01, `${name} creates a tail`);
    }
    assert.equal(dsp.pitch.length, dsp.pitch.originalLength, 'Pitch preserves duration');
    assert.ok(dsp.pitch.at880 > dsp.pitch.at440 * 5, 'Pitch shifts 440 Hz to 880 Hz');
    await page.setViewportSize({ width:1024, height:768 }); await page.waitForTimeout(100);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, 'Desktop layout fits 1024px');
    assert.deepEqual(errors, [], 'No unhandled browser exceptions');
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ bounds, dsp, browser:browser.version(), errors, checks:'UI, polyphony, first click, volume, loop, voice recording/pause/reset/delete/download, 20-second cap, released microphone, six DSP effects, pitch frequency/duration, desktop layout' }, null, 2));
    console.log('PASS: interaction, audio DSP, recording/export, 20-second limit and layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
