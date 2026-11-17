'use strict';
/** Chrome browser-only protocol A/B; never changes origin configuration. */
const {chromium}=require('playwright');
const fs=require('node:fs');
const device=process.env.PROTOCOL_DEVICE==='desktop'?'desktop':'mobile';
const count=Math.max(3,Math.min(6,Number(process.env.PROTOCOL_CYCLES||4)));
const dir='ptscps-browser-protocol-'+device;
fs.mkdirSync(dir,{recursive:true});
const origin='https://ptscps.com.vn/';
const target=/\/(?:jannah\/assets\/css\/style\.min\.css|jquery\/jquery\.min\.js|elementor\/assets\/css\/widget-spacer\.min\.css)/i;
const median=x=>{const s=x.filter(Number.isFinite).sort((a,b)=>a-b);return s.length?(s[(s.length-1)>>1]+s[s.length>>1])/2:null};
async function run(browser,mode,cycle) {
 const mobile=device==='mobile';
 const ctx=await browser.newContext({
  viewport:{width:mobile?412:1440,height:mobile?850:900},deviceScaleFactor:1,
  isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',
  ...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})
 });
 const page=await ctx.newPage();
 const cdp=await ctx.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 const errs=[],requests=[],startTimes=new Map();
 page.on('pageerror',e=>errs.push(e.message.slice(0,150)));
 page.on('requestfailed',r=>{
  if(r.url().startsWith(origin))errs.push('network '+r.url().split('/').at(-1).slice(0,50)+' '+r.failure()?.errorText);
 });
 if(mobile) {
  await cdp.send('Network.emulateNetworkConditions',{
   offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:95*1024
  });
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 }
 cdp.on('Network.requestWillBeSent',e=>{
  if(e.request.url.startsWith(origin))startTimes.set(e.requestId,{url:e.request.url,type:e.type,t:e.timestamp});
 });
 cdp.on('Network.responseReceived',e=>{
  const r=startTimes.get(e.requestId);
  if(!r)return;
  if(e.type==='Document'||target.test(r.url))requests.push({kind:e.type,url:r.url.split('?')[0].replace(origin,'/'),
   protocol:e.response.protocol,status:e.response.status,waitMs:Math.round((e.timestamp-r.t)*1000),
   connectionId:e.response.connectionId,reused:e.response.connectionReused});
 });
 await page.addInitScript(()=>{
  window.__protocolPerf={lcp:[],shifts:[],longtasks:[]};
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>
   window.__protocolPerf.lcp.push({t:Math.round(e.startTime),url:e.url||null,id:e.element?.id||null})
  )).observe({type:'largest-contentful-paint',buffered:true})}catch{}
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>{
   if(!e.hadRecentInput)window.__protocolPerf.shifts.push({t:Math.round(e.startTime),value:e.value});
  })).observe({type:'layout-shift',buffered:true})}catch{}
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>
   window.__protocolPerf.longtasks.push({start:e.startTime,duration:e.duration})
  )).observe({type:'longtask',buffered:true})}catch{}
 });
 let row={device,mode,cycle,requests,errs};
 try {
  const response=await page.goto(origin,{waitUntil:'domcontentloaded',timeout:85000});
  await page.waitForTimeout(4200);
  const perf=await page.evaluate(()=>{
   const nav=performance.getEntriesByType('navigation')[0];
   const fcp=performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint');
   const g=window.__protocolPerf;
   const rect=q=>{const el=document.querySelector(q);if(!el)return null;
    const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(x=>Math.round(x));};
   return {ttfb:Math.round(nav?.responseStart||0),fcp:Math.round(fcp?.startTime||0),
    lcp:g.lcp.at(-1)||null,
    cls:g.shifts.reduce((s,x)=>s+x.value,0),
    longtaskBlocking:g.longtasks.reduce((s,x)=>s+Math.max(x.duration-50,0),0),
    geometry:{slider:rect('.elementor-element-77137dd'),module:rect('sr7-module#SR7_1_1'),
      intro:rect('.elementor-element-920fc5e'),logo:rect('.logo')},
    loaded:{slider:!!document.querySelector('sr7-module#SR7_1_1'),
      preload:document.querySelectorAll('link[data-ptscps-sr7-first-preload]').length}
   };
  });
  Object.assign(row,{status:response.status(),...perf});
  row.protocol=requests.find(x=>x.kind==='Document')?.protocol||null;
  row.expected=mode==='http1'?'http/1.1':'h2';
  row.valid=row.status===200&&row.fcp>0&&row.lcp?.t>0&&
    row.protocol===row.expected&&row.loaded.slider&&errs.length===0;
  console.log('BROWSER_PROTOCOL_CASE '+JSON.stringify({
   device,cycle,mode,valid:row.valid,http:row.status,protocol:row.protocol,expected:row.expected,
   ttfb:row.ttfb,fcp:row.fcp,lcp:row.lcp?.t,cls:row.cls,
   longtaskBlocking:row.longtaskBlocking,
   resources:requests,geometry:row.geometry,errors:errs.slice(0,5)
  }).slice(0,11000));
  if(cycle===0)await page.screenshot({path:dir+'/'+mode+'-first.png',animations:'disabled'});
 }catch(e) {
  row.error=String(e.stack||e).slice(0,900);
  console.log('BROWSER_PROTOCOL_ERROR '+JSON.stringify({device,cycle,mode,error:row.error}));
 }finally{
  fs.writeFileSync(dir+'/'+mode+'-'+cycle+'.json',JSON.stringify(row,null,2));
  await ctx.close();
 }
 return row;
}
(async()=>{
 const browsers={http2:await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']}),
  http1:await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions','--disable-http2']})};
 const rows=[];
 try {
  for(let i=0;i<count;i++) {
   const modes=i%2===0?['http2','http1']:['http1','http2'];
   for(const mode of modes)rows.push(await run(browsers[mode],mode,i));
  }
 }finally{for(const b of Object.values(browsers))await b.close();}
 const pairs=[];
 for(let i=0;i<count;i++){
  const a=rows.find(x=>x.cycle===i&&x.mode==='http2'),b=rows.find(x=>x.cycle===i&&x.mode==='http1');
  if(!a?.valid||!b?.valid)continue;
  pairs.push({cycle:i,h1MinusH2TTFB:b.ttfb-a.ttfb,
   h1MinusH2FCP:b.fcp-a.fcp,h1MinusH2LCP:b.lcp.t-a.lcp.t,
   h1MinusH2CLS:b.cls-a.cls,h1MinusH2LongTask:b.longtaskBlocking-a.longtaskBlocking});
 }
 const summary={device,attempted:count,valid:pairs.length,medians:{}};
 for(const k of ['h1MinusH2TTFB','h1MinusH2FCP','h1MinusH2LCP','h1MinusH2CLS','h1MinusH2LongTask']){
  summary.medians[k]=median(pairs.map(x=>x[k]));
 }
 summary.recommendDisableH2=false; // diagnostic only: single runner and n=4 are not enough to change server settings
 fs.writeFileSync(dir+'/summary.json',JSON.stringify({summary,pairs},null,2));
 console.log('BROWSER_PROTOCOL_DECISION '+JSON.stringify({summary,pairs}));
 if(pairs.length<count)process.exitCode=1;
})().catch(e=>{console.error('BROWSER_PROTOCOL_FATAL '+String(e.stack||e));process.exitCode=1;});
