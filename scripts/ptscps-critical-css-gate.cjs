'use strict';
/**
 * Browser-only A/B: keep Jannah base/Elementor/SR7/JQuery unchanged.
 * Inline the CSS rules actually used above the fold, in place of Jannah's
 * main style.min.css link, with full stylesheet loaded nonblocking and
 * restored at its original DOM position. No changes to production.
 */
const { chromium } = require('playwright');
const postcss = require('postcss');
const fs = require('node:fs');
const crypto = require('node:crypto');
const BASE = 'https://ptscps.com.vn/';
const CSS_PATH = '/wp-content/themes/jannah/assets/css/style.min.css';
const device = process.env.CSS_DEVICE === 'desktop' ? 'desktop' : 'mobile';
const width = device === 'desktop' ? 1440 : 412;
const repeats = Math.min(7, Math.max(3, Number(process.env.CSS_PAIRS || 5)));
const outDir = 'critical-css-gate-' + device;
fs.mkdirSync(outDir, { recursive: true });
const med = x => {
  const s = [...x].sort((a,b) => a-b);
  return s.length ? (s.length % 2 ? s[(s.length-1)/2] : (s[s.length/2-1] + s[s.length/2])/2) : null;
};
function matchStyle(tag) {
  const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1] || '';
  return /rel\s*=\s*["']stylesheet["']/i.test(tag) && href.includes(CSS_PATH);
}
function transform(html,css) {
  let hits = 0;
  const next = html.replace(/<link\b[^>]*>/gi,tag=>{
    if (!matchStyle(tag)) return tag;
    hits++;
    if (hits > 1) return tag;
    const style = '<style id="ptscps-critical-ab">' + css.replace(/<\/style/gi,'<\\/style') + '</style>';
    const async = tag.replace(/\s+media\s*=\s*(["']).*?\1/gi,'')
      .replace(/\/?>$/, ' media="print" onload="this.media=\'all\'">');
    return style + async + '<noscript>' + tag + '</noscript>';
  });
  return {html:next,hits};
}
async function coverage(browser) {
  const samples=[];
  for(const w of [412,1440]) {
    const ctx=await browser.newContext({
      viewport:{width:w,height:w<700?850:900},deviceScaleFactor:1,
      isMobile:w<700,hasTouch:w<700,serviceWorkers:'block'
    });
    const page=await ctx.newPage();
    await page.coverage.startCSSCoverage({resetOnNavigation:false});
    const response=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:75000});
    if(response.status()!==200)throw Error('coverage HTTP '+response.status());
    await page.waitForTimeout(4200);
    const data=await page.coverage.stopCSSCoverage();
    const found=data.filter(e=>e.url.includes(CSS_PATH));
    if(found.length!==1)throw Error('expected one CSS coverage at width '+w+', got '+found.length);
    samples.push({width:w,text:found[0].text,ranges:found[0].ranges});
    console.log('COVERAGE '+JSON.stringify({width:w,source:found[0].text.length,ranges:found[0].ranges.length}));
    await ctx.close();
  }
  if(samples[0].text!==samples[1].text)throw Error('source CSS differs between devices; abort');
  const root=postcss.parse(samples[0].text,{from:'jannah-style.min.css'});
  const ranges=samples.flatMap(x=>x.ranges);
  let kept=0,removed=0;
  root.walkRules(node=>{
    const lo=node.source?.start?.offset, hi=node.source?.end?.offset;
    const used=(lo!=null&&hi!=null&&ranges.some(x=>x.end>lo&&x.start<=hi));
    if(!used) {node.remove();removed++} else kept++;
  });
  root.walkAtRules(node=>{
    if (['font-face','keyframes','-webkit-keyframes','property','charset'].includes(node.name)) return;
    if (node.nodes && node.nodes.length===0) node.remove();
  });
  const css=root.toString();
  const stats={sourceBytes:Buffer.byteLength(samples[0].text),
    criticalBytes:Buffer.byteLength(css),kept,removed,
    sha256:crypto.createHash('sha256').update(css).digest('hex')};
  fs.writeFileSync(outDir+'/critical.css',css);
  fs.writeFileSync(outDir+'/critical-stats.json',JSON.stringify(stats,null,2));
  console.log('CRITICAL_SIZE '+JSON.stringify(stats));
  if(stats.criticalBytes<500||stats.criticalBytes>26000)throw Error('unsafe critical CSS size');
  return css;
}
async function trial(browser,critical,variant,cycle,order) {
  const mobile = device === 'mobile';
  const ctx=await browser.newContext({
    viewport:{width,height:mobile?850:900},isMobile:mobile,hasTouch:mobile,
    deviceScaleFactor:1,serviceWorkers:'block',
    ...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})
  });
  const page=await ctx.newPage();
  const errors=[];let modified=false,seen=0;
  page.on('pageerror',e=>errors.push(e.message.slice(0,240)));
  page.on('requestfailed',r=>{
    if(r.url().includes(CSS_PATH))errors.push('CSS failed '+r.failure()?.errorText);
  });
  // Intercept in both variants to equalize response interception overhead.
  await page.route(BASE,async route=>{
    const r=await route.fetch({timeout:65000});
    const html=await r.text();
    if(variant==='critical') {
      const result=transform(html,critical);
      seen=result.hits;modified=seen===1;
      await route.fulfill({response:r,body:result.html});
    } else {
      await route.fulfill({response:r,body:html});
    }
  });
  await page.addInitScript(()=>{
    window.__ptscpsCssGate={lcp:[],shifts:[],tasks:[]};
    try{new PerformanceObserver(l=>l.getEntries().forEach(e=>
      window.__ptscpsCssGate.lcp.push({t:Math.round(e.startTime),
        url:e.url||null,el:e.element?.id||e.element?.localName||null})
    )).observe({type:'largest-contentful-paint',buffered:true})}catch{}
    try{new PerformanceObserver(l=>l.getEntries().forEach(e=>{
      if(!e.hadRecentInput)window.__ptscpsCssGate.shifts.push({t:Math.round(e.startTime),v:e.value});
    })).observe({type:'layout-shift',buffered:true})}catch{}
    try{new PerformanceObserver(l=>l.getEntries().forEach(e=>
      window.__ptscpsCssGate.tasks.push({t:Math.round(e.startTime),d:Math.round(e.duration)})
    )).observe({type:'longtask',buffered:true})}catch{}
  });
  const cdp=await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  if(mobile) {
    await cdp.send('Network.emulateNetworkConditions',{
      offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:95*1024
    });
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  }
  const row={device,variant,cycle,order};
  try {
    const response=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:85000});
    await page.waitForTimeout(6600);
    const fields=await page.evaluate(()=>{
      const n=performance.getEntriesByType('navigation')[0];
      const paint=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
      const css=performance.getEntriesByType('resource').filter(x=>x.name.includes('/assets/css/style.min.css'));
      const $=q=>{
        const e=document.querySelector(q);
        if(!e)return null;
        const r=e.getBoundingClientRect(),s=getComputedStyle(e);
        return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),
          display:s.display,font:s.fontFamily,opacity:s.opacity};
      };
      const v=window.__ptscpsCssGate;
      return {
        ttfb:Math.round(n?.responseStart||0),
        fcp:Math.round(paint?.startTime||0),lcp:v.lcp.at(-1)||null,
        cls:v.shifts.reduce((a,b)=>a+b.v,0),
        longTaskBlocking:v.tasks.reduce((a,b)=>a+Math.max(0,b.d-50),0),
        longTaskCount:v.tasks.length,
        criticalPresent:!!document.querySelector('#ptscps-critical-ab'),
        fullStyleLink:[...document.querySelectorAll('link[rel="stylesheet"]')]
          .filter(x=>x.href.includes('/assets/css/style.min.css'))
          .map(x=>({media:x.media,onload:!!x.onload})),
        cssNetwork:css.map(x=>({end:Math.round(x.responseEnd),
          transferred:x.transferSize,start:Math.round(x.startTime)})),
        pageWidth:document.documentElement.scrollWidth,
        geom:{header:$('#main-nav'),logo:$('.logo'),intro:$('.elementor-element-920fc5e'),
          slider:$('.elementor-element-77137dd'),module:$('sr7-module#SR7_1_1'),
          search:$('.search-form')}
      };
    });
    Object.assign(row,fields,{http:response.status(),modified,matched:seen,errors});
    row.afterTtfb=row.fcp-row.ttfb;
    row.passed=response.status()===200&&row.fcp>0&&row.cssNetwork.length>0&&errors.length===0&&
      (variant==='control'||(modified&&row.criticalPresent&&
        row.fullStyleLink.length===1&&row.fullStyleLink[0].media==='all'));
    if(cycle===0){
      await page.screenshot({path:outDir+'/'+variant+'-'+order+'.png',
        fullPage:false,animations:'disabled'});
    }
    console.log('CSS_GATE_CASE '+JSON.stringify({
      device,variant,cycle,order,passed:row.passed,ttfb:row.ttfb,fcp:row.fcp,
      afterTtfb:row.afterTtfb,lcp:row.lcp?.t,cls:row.cls,longTaskBlocking:row.longTaskBlocking,
      cssNetwork:row.cssNetwork,geom:row.geom,errors:errors.slice(0,5)
    }).slice(0,6500));
    if(!row.passed)process.exitCode=1;
  }catch(e) {
    row.error=String(e.stack||e).slice(0,1200);process.exitCode=1;
    console.log('CSS_GATE_ERROR '+JSON.stringify({device,variant,cycle,error:row.error}));
  }finally {
    fs.writeFileSync(outDir+'/'+cycle+'-'+variant+'.json',JSON.stringify(row,null,2));
    await ctx.close();
  }
  return row;
}
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
  try {
    const critical=await coverage(browser);
    const rows=[];
    for(let cycle=0;cycle<repeats;cycle++){
      const order=cycle%2===0?['control','critical']:['critical','control'];
      for(const variant of order)rows.push(await trial(browser,critical,variant,cycle,order.indexOf(variant)));
    }
    const pairs=[];
    for(let cycle=0;cycle<repeats;cycle++) {
      const a=rows.find(x=>x.cycle===cycle&&x.variant==='control');
      const b=rows.find(x=>x.cycle===cycle&&x.variant==='critical');
      if(!a?.passed||!b?.passed)continue;
      const d={cycle,deltaFcp:b.fcp-a.fcp,
        deltaAfterTtfb:b.afterTtfb-a.afterTtfb,
        deltaLcp:(b.lcp?.t||0)-(a.lcp?.t||0),
        deltaCls:b.cls-a.cls,
        deltaLongTask:b.longTaskBlocking-a.longTaskBlocking};
      const g=(x,y)=>Math.abs((x?.y||0)-(y?.y||0));
      d.visualBoundsDelta=Math.max(...['header','logo','intro','slider','module']
        .flatMap(q=>['x','y','w','h'].map(p=>Math.abs((b.geom[q]?.[p]||0)-(a.geom[q]?.[p]||0)))));
      pairs.push(d);
      console.log('CSS_GATE_PAIR '+JSON.stringify(d));
    }
    const metrics=['deltaFcp','deltaAfterTtfb','deltaLcp','deltaCls','deltaLongTask','visualBoundsDelta'];
    const summary={device,attempted:repeats,completed:pairs.length};
    for(const m of metrics)summary[m+'Median']=med(pairs.map(x=>x[m]));
    summary.fcpWins=pairs.filter(x=>x.deltaAfterTtfb<=-150).length;
    summary.bigRegressions=pairs.filter(x=>x.deltaAfterTtfb>=150).length;
    summary.recommendedForCanary=pairs.length===repeats&&
      summary.deltaAfterTtfbMedian<=-150 &&
      summary.deltaLcpMedian<=0 &&
      summary.deltaClsMedian<=0.005 &&
      pairs.every(x=>x.deltaCls<=0.005 && x.visualBoundsDelta<=3) &&
      summary.deltaLongTaskMedian<=25 && summary.fcpWins>=Math.ceil(repeats*0.8) &&
      summary.bigRegressions===0;
    console.log('CSS_GATE_DECISION '+JSON.stringify(summary));
    fs.writeFileSync(outDir+'/summary.json',JSON.stringify({summary,pairs},null,2));
    if(pairs.length!==repeats)process.exitCode=1;
  }finally {await browser.close();}
})().catch(e=>{console.error('CSS_GATE_FATAL '+String(e.stack||e));process.exitCode=1;});
