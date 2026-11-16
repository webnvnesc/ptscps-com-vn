'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs');
fs.mkdirSync('waterfall-results',{recursive:true});
const URL='https://ptscps.com.vn/';
async function probe(name,width,slow){
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width,height:width<=500?823:900},
  isMobile:width<=500,hasTouch:width<=500,deviceScaleFactor:1.5});
 const page=await context.newPage();
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');
 const requests=new Map();
 const failures=[],consoleErr=[];
 cdp.on('Network.requestWillBeSent',e=>{
   if(!e.request.url.startsWith(URL))return;
   const old=requests.get(e.requestId);
   requests.set(e.requestId,{url:e.request.url.replace(URL,'/'),
    resourceType:e.type,initiator:e.initiator?.type||'',
    initialPriority:e.request.initialPriority||null,requestTime:e.timestamp,
    wallTime:e.wallTime,requestHeaders:{
      accept:e.request.headers?.Accept||e.request.headers?.accept||null,
      acceptEncoding:e.request.headers?.['Accept-Encoding']||null
    },redirectFrom:old?.url||null});
 });
 cdp.on('Network.responseReceived',e=>{
   const r=requests.get(e.requestId);if(!r)return;
   Object.assign(r,{responseTime:e.timestamp,responseStatus:e.response.status,
      httpProtocol:e.response.protocol,connectionId:e.response.connectionId,
      encodedDataLength:e.response.encodedDataLength,
      fromDiskCache:e.response.fromDiskCache,fromServiceWorker:e.response.fromServiceWorker,
      headers:e.response.headers,
      timing:e.response.timing
   });
 });
 cdp.on('Network.loadingFinished',e=>{
   const r=requests.get(e.requestId);if(r)Object.assign(r,{finishedAt:e.timestamp,wireBytes:e.encodedDataLength});
 });
 cdp.on('Network.loadingFailed',e=>{
   const r=requests.get(e.requestId);if(r)r.error=e.errorText;
 });
 page.on('pageerror',e=>failures.push(e.message.slice(0,250)));
 page.on('console',e=>{if(e.type()==='error')consoleErr.push(e.text().slice(0,180))});
 await page.addInitScript(()=>{
  window.__layout=[];
  try{new PerformanceObserver(list=>{for(const x of list.getEntries()){if(!x.hadRecentInput)window.__layout.push({t:x.startTime,v:x.value})}}).observe({type:'layout-shift',buffered:true})}catch(e){}
 });
 if(slow){
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,
     downloadThroughput:205*1024,uploadThroughput:95*1024});
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 }
 let navigation;
 try{
   navigation=await page.goto(URL,{waitUntil:'domcontentloaded',timeout:70000});
   await page.waitForTimeout(4800);
   const metrics=await page.evaluate(()=>{
     const n=performance.getEntriesByType('navigation')[0],
       f=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
     return {fcpMs:Math.round(f?.startTime||0),ttfbMs:Math.round(n.responseStart),
       domMs:Math.round(n.domContentLoadedEventEnd),loadMs:Math.round(n.loadEventEnd),
       cls:window.__layout.reduce((a,x)=>a+x.v,0),scripts:document.scripts.length,
       styles:document.querySelectorAll('link[rel=stylesheet]').length,
       fontStatus:document.fonts.status};
   });
   const start=[...requests.values()].find(x=>x.resourceType==='Document'&&x.wallTime)?.requestTime||
     Math.min(...[...requests.values()].map(x=>x.requestTime));
   const selected=[...requests.values()].filter(x=>/\.(?:css|js|woff2?|ttf)(?:[?#]|$)/i.test(x.url)||
     x.resourceType==='Document').map(x=>({
       url:x.url,kind:x.resourceType,initiator:x.initiator,
       startMs:Math.round((x.requestTime-start)*1000),
       headersMs:x.responseTime?Math.round((x.responseTime-start)*1000):null,
       finishMs:x.finishedAt?Math.round((x.finishedAt-start)*1000):null,
       waitingMs:x.responseTime?Math.round((x.responseTime-x.requestTime)*1000):null,
       bodyMs:x.finishedAt&&x.responseTime?Math.round((x.finishedAt-x.responseTime)*1000):null,
       bytes:x.wireBytes||0,http:x.httpProtocol,status:x.responseStatus,
       encoding:x.headers?.['content-encoding']||x.headers?.['Content-Encoding']||null,
       priority:x.initialPriority,connectionId:x.connectionId,
       error:x.error||null
     })).sort((a,b)=>a.startMs-b.startMs);
   const critical=selected.filter(x=>/jannah\/assets\/css|elementor\/assets\/css|sr7\.css|jquery\.min\.js/.test(x.url));
   const result={name,width,slow,http:navigation.status(),metrics,
    requests:requests.size,selected,critical,failures,consoleErr:consoleErr.slice(0,10)};
   fs.writeFileSync('waterfall-results/'+name+'.json',JSON.stringify(result,null,2));
   console.log('PAGE '+JSON.stringify({name,...metrics,requests:requests.size,pageErrors:failures.length}));
   for(const c of critical)console.log('CSS '+JSON.stringify({name,...c}));
   console.log('CRITICAL_SUMMARY '+JSON.stringify({name,criticalCount:critical.length,
     completedBeforeFCP:critical.filter(x=>x.finishMs!=null&&x.finishMs<=metrics.fcpMs).length,
     lateStyles:critical.filter(x=>x.kind==='Stylesheet'&&x.finishMs>metrics.fcpMs).map(x=>x.url)}));
 }catch(e){console.error('FAILED '+name+' '+String(e.stack||e).slice(0,1200));process.exitCode=1}
 await context.close();await browser.close();
}
(async()=>{await probe('mobile-throttled',412,true);await probe('desktop-fast',1440,false);})().catch(e=>{
 console.error('FATAL '+e.stack);process.exitCode=1
});