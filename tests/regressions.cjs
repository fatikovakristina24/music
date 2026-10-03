const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

(async () => {
  const fixture = path.join(os.tmpdir(), 'contour-test-microphone.wav');
  if (!fs.existsSync(fixture)) throw new Error('Run browser.cjs first to create the test microphone.');
  const browser = await chromium.launch({ headless:true, args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${fixture}`] });
  const page = await browser.newPage({ viewport:{ width:1440, height:960 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__analysers = []; window.__streams = [];
    const original = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function () { const node = original.call(this); window.__analysers.push(node); return node; };
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let first = true;
    navigator.mediaDevices.getUserMedia = async (...args) => {
      if (first) { first = false; throw new DOMException('Test denial', 'NotAllowedError'); }
      const stream = await getMedia(...args); window.__streams.push(stream); return stream;
    };
  });
  const range = async value => page.locator('#effect-pitch').evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles:true })); }, value);
  const frequency = () => page.evaluate(() => {
    const analyser = window.__analysers[1]; const spectrum = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(spectrum);
    let peak = 0; for (let i = 1; i < spectrum.length; i++) if (spectrum[i] > spectrum[peak]) peak = i;
    return peak * analyser.context.sampleRate / analyser.fftSize;
  });
  try {
    await page.goto(process.env.CONTOUR_URL || 'http://localhost:4173');
    await page.locator('#mode-voice').click(); await page.locator('#voice-record').click();
    await page.waitForFunction(() => document.querySelector('#message-dialog').open);
    assert.match(await page.locator('#message-body').textContent(), /не разрешён/);
    await page.locator('#message-close').click();
    assert.equal(await page.locator('#voice-record').isDisabled(), false, 'Permission refusal can be retried');
    await page.locator('#voice-record').click();
    await page.waitForFunction(() => document.querySelector('#voice-record').textContent.includes('Закончить'));
    await page.waitForTimeout(2500); await page.locator('#voice-record').click();
    await page.waitForFunction(() => !document.querySelector('#voice-play').disabled);
    await page.locator('#voice-play').click(); await page.waitForTimeout(200);
    const dry = await frequency(); assert.ok(Math.abs(dry - 440) < 50, `Dry voice ${dry} Hz`);
    await range(12); await page.waitForTimeout(250);
    const high = await frequency(); assert.ok(Math.abs(high - 880) < 60, `Live pitch-up ${high} Hz`);
    await range(-12); await page.waitForTimeout(250);
    const low = await frequency(); assert.ok(Math.abs(low - 220) < 45, `Live pitch-down ${low} Hz`);
    await range(0);
    await page.locator('#effect-child').evaluate(input => { input.value = 100; input.dispatchEvent(new Event('input', { bubbles:true })); });
    await page.waitForTimeout(250);
    const child = await frequency(); assert.ok(Math.abs(child - 659.25) < 50, `Live child voice ${child} Hz`);
    await range(12); await page.waitForTimeout(250);
    const combined = await frequency(); assert.ok(Math.abs(combined - 1318.5) < 65, `Combined pitch + child ${combined} Hz`);
    const layout = await page.evaluate(() => {
      const sliders = [...document.querySelectorAll('#voice-sliders .slider')];
      const footnote = document.querySelector('.controls-footnote').getBoundingClientRect();
      return { count:sliders.length, labelsClear:sliders.every(slider => {
        const label = slider.querySelector('.slider-top').getBoundingClientRect();
        const input = slider.querySelector('input').getBoundingClientRect();
        return label.bottom <= input.top + (input.height - 16) / 2;
      }), bottom:sliders.at(-1).getBoundingClientRect().bottom, footnote:footnote.top };
    });
    assert.equal(layout.count, 7); assert.equal(layout.labelsClear, true); assert.ok(layout.bottom < layout.footnote);
    await page.screenshot({ path:path.join(process.cwd(), 'test-results', 'voice-child.png') });
    await page.locator('#mode-play').click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#mode-play').getAttribute('aria-pressed'), 'true');
    await page.locator('#mode-voice').click(); assert.equal(await page.locator('#voice-play').textContent(), '▶ Продолжить');
    // Starting a new recording and leaving the mode must stop microphone capture.
    await page.locator('#voice-record').click();
    await page.waitForFunction(() => document.querySelector('#voice-record').textContent.includes('Закончить'));
    await page.waitForTimeout(120); await page.locator('#mode-play').click();
    await page.waitForFunction(() => window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')));
    await page.keyboard.down('KeyA'); await page.keyboard.down('KeyD'); await page.waitForTimeout(80);
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(70);
    assert.equal(await page.locator('.pad.pressed').count(), 0, 'Blur releases held notes');
    await page.keyboard.up('KeyA'); await page.keyboard.up('KeyD');
    const pitchTail = await page.evaluate(async () => {
      const { AudioEngine } = await import('/js/audio/engine.js');
      const engine = new AudioEngine(); engine.effects.pitch = 12;
      const context = new OfflineAudioContext(1, 44100, 44100);
      const buffer = context.createBuffer(1, 44100, 44100), data = buffer.getChannelData(0);
      for (let i = 40000; i < 44100; i++) data[i] = .25 * Math.sin(2 * Math.PI * 440 * i / 44100);
      const rendered = await engine.exportVoice(buffer); const out = rendered.getChannelData(0);
      let tail = 0; for (let i = 44100; i < out.length; i++) tail += out[i] * out[i];
      return { tail, duration:rendered.duration };
    });
    assert.ok(pitchTail.tail > .01, 'WAV preserves the last syllable after pitch processing');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(process.cwd(), 'test-results', 'regressions.json'), JSON.stringify({ dry, high, low, child, combined, layout, pitchTail, errors, checks:'microphone refusal/retry, realtime pitch and child voice, combined pitch effects, seven-slider layout, mode switches, recording cleanup, held-note blur, pitch tail in WAV' }, null, 2));
    console.log('PASS: permission recovery, live pitch changes, cleanup, last-syllable export.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
