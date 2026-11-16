'use strict';
/** Read-only cold-browser diagnosis: LCP paragraph, Exo actual font face, Jannah CSS, text rendering.
 * No HTML rewrites or production edits. All timing is navigation-relative and device-emulated.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const width = Number(process.env.TEST_WIDTH || 412);
const cycles = Number(process.env.TEST_CYCLES || 4);
const mobile = width < 700;
const root = 'text-render-'+width;
fs.mkdirSync(root, {recursive:true});
const median = xs => {const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?(a[(a.length-1)>>1]+a[a.length>>1])/2:null};
async function runOne(browser,cycle) {
 const context=await browser.newContext({
   viewport:{width,height:mobile?823:900},deviceScaleFactor:mobile?2:1,
   isMobile:mobile,hasTouch:mobile,
   ...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})
 });
 const page=await context.newPage(), errors=[], requests=new Map();
 page.on('pageerror',e=>errors.push(e.message.slice(0,200)));
 await page.addInitScript(()=>{
  window.__ptscpsRender={lcp:[],shifts:[],fontEvents:[],domEvent:null};
  const p=window.__ptscpsRender;
  try {
   new PerformanceObserver(l=>l.getEntries().forEach(x=>p.lcp.push({
    t:Math.round(x.startTime),load:Math.round(x.loadTime||0),render:Math.round(x.renderTime||0),
    size:x.size, tag:x.element?.localName||null, content:x.element?.textContent?.trim().slice(0,100)||null,
    url:x.url||null
   }))).observe({type:'largest-contentful-paint',buffered:true});
  }catch(e){}
  try {new PerformanceObserver(l=>l.getEntries().forEach(x=>{
   if(!x.hadRecentInput)p.shifts.push({t:Math.round(x.startTime),v:x.value})
  })).observe({type:'layout-shift',buffered:true})}catch(e){}
  for(const event of ['loading','loadingdone','loadingerror']){
   try{document.fonts.addEventListener(event,e=>p.fontEvents.push({
     event,t:Math.round(performance.now()),faces:[...(e.fontfaces||[])].map(f=>({family:f.family,weight:f.weight,status:f.status}))
   }))}catch(e){}
  }
  try{document.fonts.ready.then(()=>p.fontEvents.push({event:'ready',t:Math.round(performance.now())}))}catch(e){}
  document.addEventListener('DOMContentLoaded',()=>p.domEvent=Math.round(performance.now()));
 });
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,
   downloadThroughput:210*1024,uploadThroughput:95*1024});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 let t0=null;
 cdp.on('Network.requestWillBeSent',e=>{
  if(t0===null&&e.type==='Document')t0=e.timestamp;
  if(/\.css(?:[?#]|$)|\.woff2?(?:[?#]|$)|\/fonts|font\.googleapis|exo|jquery|sr7|logo-2024\.jpg/i.test(e.request.url)){
   requests.set(e.requestId,{
    url:e.request.url,type:e.type,priority:e.request.initialPriority||null,
    start:Math.round((e.timestamp-(t0??e.timestamp))*1000)
   });
  }
 });
 cdp.on('Network.responseReceived',e=>{
  const r=requests.get(e.requestId);
  if(r){r.status=e.response.status;r.protocol=e.response.protocol;r.response= Math.round((e.timestamp-t0)*1000);
   r.fontMime=e.response.mimeType;}
 });
 cdp.on('Network.loadingFinished',e=>{
  const r=requests.get(e.requestId);
  if(r){r.end=Math.round((e.timestamp-t0)*1000);r.bytes=e.encodedDataLength||0}
 });
 cdp.on('Network.loadingFailed',e=>{
  const r=requests.get(e.requestId);if(r)r.failure=e.errorText;
 });
 const snap=async()=>page.evaluate(()=>{
  const nav=performance.getEntriesByType('navigation')[0];
  const fcp=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
  const p=[...document.querySelectorAll('p')].find(x=>(x.textContent||'').includes('Công ty Cổ phần Dịch vụ Khai thác Dầu khí PTSC'));
  const css=p?getComputedStyle(p):null;
  const r=p?.getBoundingClientRect();
  const l=[...document.images].find(i=>(i.currentSrc||i.src||'').includes('logo-2024.jpg'));
  const lr=l?.getBoundingClientRect();
  const fonts=[...document.fonts].filter(f=>/exo|roboto|sans/i.test(f.family)).map(x=>({
   family:x.family,style:x.style,weight:x.weight,display:x.display,status:x.status
  }));
  if(p)p.setAttribute('data-ptscps-render-probe','1');
  return {
    now:Math.round(performance.now()),ttfb:Math.round(nav?.responseStart||0),
    fcp:Math.round(fcp?.startTime||0),dom:window.__ptscpsRender.domEvent,
    lcp:window.__ptscpsRender.lcp,
    cls:window.__ptscpsRender.shifts.reduce((a,e)=>a+e.v,0),
    fontEvents:window.__ptscpsRender.fontEvents,
    fontStatus:document.fonts.status,fonts,
    logo2024:l?{src:l.currentSrc||l.src,loading:l.loading,fetchPriority:l.fetchPriority,decoding:l.decoding,complete:l.complete,naturalWidth:l.naturalWidth,naturalHeight:l.naturalHeight,rect:lr?[lr.x,lr.y,lr.width,lr.height].map(Math.round):null,outerHTML:l.outerHTML.slice(0,500)}:null,
    intro:p?{
     text:p.textContent.trim().slice(0,190),rect:r?[r.x,r.y,r.width,r.height].map(Math.round):null,
     family:css.fontFamily,weight:css.fontWeight,size:css.fontSize,lineHeight:css.lineHeight,
     opacity:css.opacity,visibility:css.visibility,display:css.display,
     animation:css.animationName,transform:css.transform
    }:null
  }
 });
 let out={cycle,width};
 try {
  const response=await page.goto('https://ptscps.com.vn/',{waitUntil:'domcontentloaded',timeout:80000});
  const early=await snap();
  await page.waitForTimeout(5200);
  const late=await snap();
  let platformFonts=null, platformError=null;
  try {
   await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
   const {root:dom}=await cdp.send('DOM.getDocument',{depth:2});
   const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:dom.nodeId,selector:'p[data-ptscps-render-probe="1"]'});
   if(nodeId)platformFonts=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;
  }catch(e){platformError=String(e.message).slice(0,160)}
  const all=[...requests.values()].sort((a,b)=>a.start-b.start);
  const CSSfiles=all.filter(x=>x.type==='Stylesheet');
  const fontfiles=all.filter(x=>x.type==='Font'||/\.woff2?(?:[?#]|$)/i.test(x.url));
  const mainCSS=CSSfiles.find(x=>/jannah\/assets\/css\/style\.min\.css/.test(x.url))||null;
  const lateLCP=late.lcp.at(-1)?.t||null;
  out={...out,http:response.status(),early,late,platformFonts,platformError,
   cssCount:CSSfiles.length,fontFiles:fontfiles,mainCSS,
   latestCssEnd:Math.max(0,...CSSfiles.map(x=>x.end||0)),
   fcpAfterTtfb:late.fcp-late.ttfb,
   lcpAfterTtfb:lateLCP===null?null:lateLCP-late.ttfb,
   lcpMinusCss:lateLCP===null||!mainCSS?.end?null:lateLCP-mainCSS.end,
   requests:all,errors};
  if(cycle===1)await page.screenshot({path:root+'/render-'+width+'.png',fullPage:false});
 }catch(e){out.error=String(e.stack||e).slice(0,950);process.exitCode=1}
 console.log('RENDER_CASE '+JSON.stringify({
  cycle,width,http:out.http,ttfb:out.late?.ttfb,fcp:out.late?.fcp,lcp:out.late?.lcp?.at(-1),
  gap:out.fcpAfterTtfb,mainCSS:out.mainCSS,fonts:out.fontFiles,face:out.late?.fonts?.filter(f=>f.status==='loaded').slice(0,16),
  events:out.late?.fontEvents,platformFonts:out.platformFonts,platformError:out.platformError,
  intro:out.late?.intro,logo2024:out.late?.logo2024,logoNetwork:out.requests?.filter(x=>x.url.includes('logo-2024.jpg')),cls:out.late?.cls,errors:out.errors,error:out.error
 }));
 fs.writeFileSync(root+'/cycle-'+cycle+'.json',JSON.stringify(out,null,2));
 await context.close();
 return out;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 const rows=[];
 try{for(let cycle=1;cycle<=cycles;cycle++)rows.push(await runOne(browser,cycle))}
 finally{await browser.close()}
 const good=rows.filter(x=>x.late?.fcp>0&&x.mainCSS?.end);
 const summary={width,cycles:good.length,medianTtfb:median(good.map(x=>x.late.ttfb)),
 medianFcp:median(good.map(x=>x.late.fcp)),
 medianLcp:median(good.map(x=>x.late.lcp.at(-1)?.t)),
 medianFcpAfterTtfb:median(good.map(x=>x.fcpAfterTtfb)),
 medianCssFinish:median(good.map(x=>x.mainCSS.end)),
 medianLcpMinusCss:median(good.map(x=>x.lcpMinusCss)),
 fontFamilies:[...new Set(good.flatMap(x=>x.late.fonts.map(f=>f.family)))],
 fontRequestURLs:[...new Set(good.flatMap(x=>x.fontFiles.map(f=>f.url)))],
 mainCssURLs:[...new Set(good.map(x=>x.mainCSS.url))],
 errors:rows.flatMap(x=>x.errors||[]),failed:rows.filter(x=>x.error).map(x=>x.error)};
 console.log('RENDER_SUMMARY '+JSON.stringify(summary));
 fs.writeFileSync(root+'/summary.json',JSON.stringify(summary,null,2));
 if(good.length!==cycles)process.exitCode=1;
})().catch(e=>{console.error('RENDER_FATAL',e.stack||e);process.exitCode=1});
