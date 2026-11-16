'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');

const origin = 'https://ptscps.com.vn';
const host = new URL(origin).hostname;
const width = Number(process.env.TEST_WIDTH || 412);
const folder = 'network-probe-' + width;
const entries = [
  {name: 'home', path: '/'},
  {name: 'news', path: '/c/hoat-dong-cua-cong-ty'},
  {name: 'service', path: '/dich-vu/van-hanh-va-bao-duong-fpso-fso-mopu'}
];
const variants = ['control', 'block_external_scripts'];
fs.mkdirSync(folder, {recursive: true});

function median(values) {
  const a = values.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  return a.length ? (a[Math.floor((a.length-1)/2)] + a[Math.floor(a.length/2)]) / 2 : null;
}
function sameHost(url) {
  try { return new URL(url).hostname === host; } catch { return true; }
}
async function sample(browser, entry, variant, cycle) {
  const mobile = width < 700;
  const context = await browser.newContext({
    viewport: {width, height: mobile ? 823 : 900},
    isMobile: mobile, hasTouch: mobile,
    deviceScaleFactor: mobile ? 1.5 : 1,
    ...(mobile ? {userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'} : {})
  });
  const page = await context.newPage();
  const errors = [], failed = [], blocked = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 250)));
  page.on('requestfailed', r => failed.push({
    type: r.resourceType(), url: r.url().slice(0, 200),
    error: r.failure()?.errorText
  }));
  // Intercept both arms equally; only the experimental arm blocks off-site JS.
  await page.route('**/*', route => {
    const r = route.request();
    if (variant === 'block_external_scripts' &&
        r.resourceType() === 'script' && !sameHost(r.url())) {
      blocked.push(r.url().slice(0, 240));
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    window.__fcpLongTasks = []; window.__fcpShifts = [];
    try {
      new PerformanceObserver(list => {
        for (const e of list.getEntries())
          window.__fcpLongTasks.push({start: e.startTime, duration: e.duration});
      }).observe({type: 'longtask', buffered: true});
    } catch {}
    try {
      new PerformanceObserver(list => {
        for (const e of list.getEntries())
          if (!e.hadRecentInput) window.__fcpShifts.push({start: e.startTime, value: e.value});
      }).observe({type: 'layout-shift', buffered: true});
    } catch {}
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', {cacheDisabled: true});
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150,
    downloadThroughput: 210 * 1024, uploadThroughput: 95 * 1024
  });
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
  const requests = new Map();
  cdp.on('Network.requestWillBeSent', e => {
    requests.set(e.requestId, {
      url: e.request.url.slice(0, 250),
      type: e.type, priority: e.request.initialPriority,
      start: e.timestamp, status: null
    });
  });
  cdp.on('Network.responseReceived', e => {
    const r = requests.get(e.requestId);
    if (r) Object.assign(r, {
      status: e.response.status, protocol: e.response.protocol,
      received: e.timestamp, encoding: e.response.headers['content-encoding'] ||
        e.response.headers['Content-Encoding'] || null
    });
  });
  cdp.on('Network.loadingFinished', e => {
    const r = requests.get(e.requestId);
    if (r) Object.assign(r, {end: e.timestamp, bytes: e.encodedDataLength});
  });
  const result = {entry: entry.name, variant, cycle, width};
  try {
    const response = await page.goto(origin + entry.path, {
      waitUntil: 'domcontentloaded', timeout: 75000
    });
    await page.waitForTimeout(2500);
    const data = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByType('paint')
        .find(e => e.name === 'first-contentful-paint');
      const fcp = paint?.startTime || 0;
      function geometry(selector) {
        const e = document.querySelector(selector);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
      }
      const tasks = window.__fcpLongTasks.filter(t => t.start < fcp);
      const head = [...document.head.querySelectorAll('script[src]')].map(e => ({
        src: e.src.slice(0, 180), async: e.async, defer: e.defer
      }));
      const fonts = [...document.fonts].map(f => ({
        family: f.family, status: f.status, display: f.display
      }));
      return {
        statusBody: document.body.className.slice(0, 200),
        ttfb: Math.round(nav.responseStart),
        fcp: Math.round(fcp),
        dom: Math.round(nav.domContentLoadedEventEnd),
        cls: window.__fcpShifts.reduce((s, x) => s + x.value, 0),
        longTaskCountBeforeFCP: tasks.length,
        longTaskMsBeforeFCP: Math.round(tasks.reduce((s,x)=>s+x.duration, 0)),
        head, fonts: fonts.slice(0, 30), fontStatus: document.fonts.status,
        bodyFont: getComputedStyle(document.body).fontFamily,
        geometry: {
          nav: geometry('#main-nav'), logo: geometry('.logo'),
          slider: geometry('.elementor-element-77137dd'),
          intro: geometry('.elementor-element-920fc5e')
        },
        scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth,
        elementorWidgets: document.querySelectorAll('.elementor-widget').length
      };
    });
    const items = [...requests.values()];
    const t0 = Math.min(...items.map(r=>r.start));
    const resources = items.map(r=>({
      url: r.url.replace(origin, ''), type: r.type, priority: r.priority,
      start: Math.round((r.start-t0)*1000),
      end: r.end ? Math.round((r.end-t0)*1000) : null,
      bytes: r.bytes || 0, status: r.status, encoding: r.encoding
    }));
    Object.assign(result, data, {
      http: response.status(), gap: data.fcp - data.ttfb,
      blocked, errors, failed: failed.slice(0, 20),
      thirdPartyScripts: resources.filter(r=>r.type === 'Script' && !sameHost(r.url)).slice(0, 50),
      criticalCSS: resources.filter(r=>r.type === 'Stylesheet' && r.start < data.fcp)
        .sort((a,b)=>(b.end||999999)-(a.end||999999)).slice(0, 40),
      earlyScripts: resources.filter(r=>r.type === 'Script' && r.start < data.fcp)
        .sort((a,b)=>a.start-b.start).slice(0, 45)
    });
    if (cycle === 0) {
      await page.screenshot({
        path: folder + '/' + entry.name + '-' + variant + '-' + width + '.png',
        animations: 'disabled', timeout: 20000
      });
    }
  } catch (e) {
    result.error = String(e.stack || e).slice(0, 800);
    process.exitCode = 1;
  }
  fs.writeFileSync(folder + '/' + entry.name + '-' + variant + '-' + cycle + '.json',
    JSON.stringify(result, null, 2));
  console.log('CASE ' + JSON.stringify({
    entry: result.entry, variant, cycle, http: result.http,
    fcp: result.fcp, ttfb: result.ttfb, gap: result.gap,
    cls: result.cls, longTaskMs: result.longTaskMsBeforeFCP,
    blocked: blocked.length, errors: errors.length, failed: failed.length,
    scrollWidth: result.scrollWidth, viewport: result.viewport,
    error: result.error
  }));
  if (variant === 'control' && cycle === 0) {
    console.log('RUNTIME ' + JSON.stringify({
      entry: result.entry, width, head: result.head,
      thirdPartyScripts: result.thirdPartyScripts,
      earlyScripts: result.earlyScripts,
      criticalCSS: result.criticalCSS,
      fonts: result.fonts, bodyFont: result.bodyFont
    }));
  }
  await context.close();
  return result;
}
async function main() {
  const browser = await chromium.launch({headless: true});
  const all = [];
  try {
    for (const entry of entries) {
      for (let cycle=0; cycle<3; cycle++) {
        const order = cycle % 2 ? [...variants].reverse() : variants;
        for (const variant of order)
          all.push(await sample(browser, entry, variant, cycle));
      }
    }
  } finally { await browser.close(); }
  for (const entry of entries) {
    const rows = all.filter(r=>r.entry===entry.name);
    const control = new Map(rows.filter(r=>r.variant==='control').map(r=>[r.cycle, r]));
    const pairs = rows.filter(r=>r.variant==='block_external_scripts' && control.has(r.cycle))
      .map(r=>({cycle:r.cycle, deltaGap:r.gap-control.get(r.cycle).gap,
        deltaFcp:r.fcp-control.get(r.cycle).fcp,
        deltaCLS:r.cls-control.get(r.cycle).cls,
        blocked:r.blocked.length, errors:r.errors.length}));
    console.log('PAIRED ' + JSON.stringify({
      entry: entry.name, width, paired: pairs,
      medianDeltaGap: median(pairs.map(p=>p.deltaGap)),
      baselineGap: median([...control.values()].map(r=>r.gap))
    }));
  }
}
main().catch(e=>{console.error('FATAL',e.stack||e); process.exitCode=1;});