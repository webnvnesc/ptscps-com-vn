'use strict';
// Read-only visual readiness probe. Measures the painted hero region against
// SR7's JS activation; no changes to WordPress, slider state, or production assets.
const fs = require('node:fs');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const device = process.env.VISUAL_DEVICE === 'desktop' ? 'desktop' : 'mobile';
const cycles = Math.min(3, Math.max(1, Number(process.env.VISUAL_CYCLES || 2)));
const mobile = device === 'mobile';
const out = 'sr7-visual-readiness-' + device;
fs.mkdirSync(out, { recursive: true });
const targetTimes = [1000, 1800, 2800, 3900, 5200, 6800, 8500, 10500, 12500];
function pixels(buffer) {
  const img = PNG.sync.read(buffer);
  let sampled = 0, nonwhite = 0, dark = 0, saturated = 0;
  for (let y = 0; y < img.height; y += 8) {
    for (let x = 0; x < img.width; x += 8) {
      const p = (y * img.width + x) * 4;
      const r = img.data[p], g = img.data[p + 1], b = img.data[p + 2];
      if (Math.min(r, g, b) < 240) nonwhite++;
      if ((r + g + b) / 3 < 85) dark++;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 35) saturated++;
      sampled++;
    }
  }
  return {
    w: img.width, h: img.height,
    nonwhite: Number((nonwhite / sampled).toFixed(3)),
    dark: Number((dark / sampled).toFixed(3)),
    saturated: Number((saturated / sampled).toFixed(3))
  };
}
async function run(browser, cycle) {
  const ctx = await browser.newContext({
    viewport: { width: mobile ? 412 : 1440, height: mobile ? 850 : 900 },
    deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile,
    serviceWorkers: 'block',
    ...(mobile ? { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36' } : {})
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 250)));
  await page.addInitScript(() => {
    window.__ptscpsVisual = { lcp: [], ready: [], shifts: [], longtasks: [] };
    try {
      new PerformanceObserver(l => l.getEntries().forEach(e => window.__ptscpsVisual.lcp.push({
        t: Math.round(e.startTime), render: Math.round(e.renderTime || 0),
        tag: e.element?.localName || null, id: e.element?.id || null,
        url: e.url || null
      }))).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
    try {
      new PerformanceObserver(l => l.getEntries().forEach(e => {
        if (!e.hadRecentInput) window.__ptscpsVisual.shifts.push({ t: Math.round(e.startTime), value: e.value });
      })).observe({ type: 'layout-shift', buffered: true });
    } catch {}
    try {
      new PerformanceObserver(l => l.getEntries().forEach(e =>
        window.__ptscpsVisual.longtasks.push({ t: Math.round(e.startTime), duration: Math.round(e.duration) })
      )).observe({ type: 'longtask', buffered: true });
    } catch {}
    document.addEventListener('sr.module.ready', () => {
      window.__ptscpsVisual.ready.push(Math.round(performance.now()));
    }, true);
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (mobile) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150, downloadThroughput: 210 * 1024, uploadThroughput: 95 * 1024
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  const report = { device, cycle, frames: [], errors };
  try {
    const response = await page.goto('https://ptscps.com.vn/', { waitUntil: 'commit', timeout: 90000 });
    report.http = response.status();
    for (let i = 0; i < targetTimes.length; i++) {
      let now = await page.evaluate(() => performance.now()).catch(() => targetTimes[i]);
      await page.waitForTimeout(Math.max(0, targetTimes[i] - now));
      const snapshot = await page.evaluate(() => {
        const m = document.querySelector('sr7-module#SR7_1_1');
        const s = m ? getComputedStyle(m) : null;
        const r = m?.getBoundingClientRect();
        const slide = m?.querySelector('sr7-slide');
        const cs = slide ? getComputedStyle(slide) : null;
        const targets = ['sr7-loader', '.sr7-loader', '.sr7-preloader', '.tp-loader', 'sr7-progress', 'sr7-slide'];
        const layers = [];
        for (const q of targets) {
          const el = m?.querySelector(q) || document.querySelector(q);
          if (!el) continue;
          const v = getComputedStyle(el);
          layers.push({ q, display: v.display, visibility: v.visibility,
            opacity: v.opacity, zIndex: v.zIndex, position: v.position });
        }
        return {
          t: Math.round(performance.now()), readyState: document.readyState,
          poster: m?.getAttribute('data-ptscps-poster') || null,
          preload: [...document.querySelectorAll('link[data-ptscps-sr7-first-preload]')]
            .map(x => ({ href: x.href, priority: x.fetchPriority })),
          rect: r ? { x: Math.max(0, r.x), y: Math.max(0, r.y),
            w: Math.max(0, Math.min(r.width, innerWidth - Math.max(0, r.x))),
            h: Math.max(0, Math.min(r.height, innerHeight - Math.max(0, r.y))) } : null,
          current: m?.getAttribute('data-current') || null,
          module: s ? { display: s.display, visibility: s.visibility,
            opacity: s.opacity, bg: s.backgroundImage?.slice(0, 180) } : null,
          firstSlide: cs ? { display: cs.display, visibility: cs.visibility, opacity: cs.opacity } : null,
          layers
        };
      });
      const frame = { ...snapshot };
      if (snapshot.rect?.w > 40 && snapshot.rect?.h > 40) {
        try {
          const png = await page.screenshot({
            type: 'png', animations: 'allow',
            clip: { x: Math.round(snapshot.rect.x), y: Math.round(snapshot.rect.y),
              width: Math.floor(snapshot.rect.w), height: Math.floor(snapshot.rect.h) },
            timeout: 10000
          });
          frame.pixels = pixels(png);
          fs.writeFileSync(out + '/case-' + cycle + '-frame-' + i + '.png', png);
        } catch (err) {
          frame.screenshotError = String(err.message).slice(0, 240);
        }
      }
      report.frames.push(frame);
    }
    const evidence = await page.evaluate(() => ({
      observer: window.__ptscpsVisual,
      ttfb: Math.round(performance.getEntriesByType('navigation')[0]?.responseStart || 0),
      fcp: performance.getEntriesByType('paint').filter(x => x.name === 'first-contentful-paint')
        .map(x => Math.round(x.startTime)),
      assets: performance.getEntriesByType('resource')
        .filter(x => /ruby-banner|banner[23]\.jpg|\/sr7\.js|\/tptools\.js|sliderrevolution\/sliders\/1/.test(x.name))
        .map(x => ({ url: x.name.split('?')[0].split('/').slice(-2).join('/'),
          start: Math.round(x.startTime), end: Math.round(x.responseEnd) }))
    }));
    report.evidence = evidence;
    report.summary = {
      http: report.http, ttfb: evidence.ttfb, fcp: evidence.fcp,
      lcp: evidence.observer?.lcp?.at(-1) || null, ready: evidence.observer?.ready || [],
      longtasks: evidence.observer?.longtasks?.length || 0,
      cls: (evidence.observer?.shifts || []).reduce((a, x) => a + x.value, 0),
      frames: report.frames.map(x => ({
        t: x.t, current: x.current, firstSlide: x.firstSlide,
        pixels: x.pixels, layers: x.layers, screenshotError: x.screenshotError || null
      })),
      errors
    };
    console.log('SR7_VISUAL_READINESS ' + JSON.stringify({ device, cycle, ...report.summary }).slice(0, 18000));
    if (report.http !== 200 || !report.frames.some(x => x.pixels)) process.exitCode = 1;
  } catch (err) {
    report.error = String(err.stack || err).slice(0, 1500);
    console.log('SR7_VISUAL_ERROR ' + JSON.stringify({ device, cycle, error: report.error }));
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(out + '/case-' + cycle + '.json', JSON.stringify(report, null, 2));
    await ctx.close();
  }
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-extensions'] });
  try { for (let i = 0; i < cycles; i++) await run(browser, i); }
  finally { await browser.close(); }
})().catch(e => { console.error('SR7_VISUAL_FATAL ' + String(e.stack || e)); process.exitCode = 1; });
