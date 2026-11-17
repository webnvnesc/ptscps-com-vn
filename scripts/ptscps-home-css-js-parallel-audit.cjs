'use strict';
/**
 * PTSCPS public homepage cold-load CSS/JS concurrency diagnostics (read-only).
 * CDP network request timestamps are stronger evidence than HTML tag order.
 * Fresh isolated browser context, disabled HTTP cache, service workers blocked.
 */
const {chromium}=require('playwright');
const fs=require('node:fs');
const ROOT='https://ptscps.com.vn/';
const OUT='ptscps-css-js-parallel-check';
fs.mkdirSync(OUT,{recursive:true});
const cases=[
 {name:'desktop-cold-1',width:1440,mobile:false,throttle:false},
 {name:'desktop-cold-2',width:1440,mobile:false,throttle:false},
 {name:'mobile-cold-1',width:412,mobile:true,throttle:false},
 {name:'mobile-cold-2',width:412,mobile:true,throttle:false},
 {name:'mobile-throttled',width:412,mobile:true,throttle:true}
];
const normalize=url=>url.replace(/^https:\/\/ptscps\.com\.vn/i,'');
const group=url=>{
 if(/\/wp-content\/themes\/jannah-child\//.test(url))return 'jannah-child';
 if(/\/wp-content\/themes\/jannah\//.test(url))return 'jannah';
 if(/\/wp-content\/plugins\/revslider\/|sr7(?:\.min)?\.js|tptools/.test(url))return 'slider';
 if(/\/wp-content\/plugins\/elementor-pro\//.test(url))return 'elementor-pro';
 if(/\/wp-content\/plugins\/elementor\//.test(url))return 'elementor';
 if(/\/wp-content\/cache\/asp\//.test(url))return 'ajax-search';
 if(/\/wp-includes\/js\/jquery\//.test(url))return 'jquery';
 if(/\/wp-includes\//.test(url))return 'wp-core';
 if(/\/wp-content\/plugins\//.test(url))return 'plugin-other';
 if(/^(?!https:\/\/ptscps\.com\.vn).+^https?:/i.test(url))return 'third-party';
 return /^https:\/\/ptscps\.com\.vn/i.test(url)?'first-party-other':'third-party';
};
const kind=(url,type)=>{
 if(type==='Stylesheet'||/\.css(?:[?#]|$)/i.test(url))return 'CSS';
 if(type==='Script'||/\.m?js(?:[?#]|$)/i.test(url))return 'JS';
 if(type==='Document')return 'HTML';
 return 'other';
};
function concurrency(rows){
 const events=[];
 for(const x of rows)if(Number.isFinite(x.startMs)&&Number.isFinite(x.endMs)){
  events.push([x.startMs,1],[x.endMs,-1]);
 }
 events.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 let concurrent=0,max=0;
 for(const [,delta] of events){concurrent+=delta;max=Math.max(max,concurrent);}
 const starts=rows.filter(x=>Number.isFinite(x.startMs)).map(x=>x.startMs);
 const finishes=rows.filter(x=>Number.isFinite(x.endMs)).map(x=>x.endMs);
 const firstDone=finishes.length?Math.min(...finishes):null;
 return {
  requests:rows.length,
  peakParallel:max,
  startedBeforeAnyFinished:firstDone===null?null:rows.filter(x=>x.startMs<firstDone).length,
  firstRequestMs:starts.length?Math.min(...starts):null,
  lastRequestMs:starts.length?Math.max(...starts):null,
  finalCompleteMs:finishes.length?Math.max(...finishes):null,
  parserCount:rows.filter(x=>x.initiator==='parser').length,
  scriptCount:rows.filter(x=>x.initiator==='script').length
 };
}
async function check(browser,test){
 const context=await browser.newContext({
  viewport:{width:test.width,height:test.mobile?850:900},
  isMobile:test.mobile,hasTouch:test.mobile,
  deviceScaleFactor:test.mobile?2:1,serviceWorkers:'block',
  userAgent:test.mobile?
   'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36':
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
 });
 const page=await context.newPage();
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 if(test.throttle){
  await cdp.send('Network.emulateNetworkConditions',{
    offline:false,latency:155,downloadThroughput:240*1024,uploadThroughput:95*1024
  });
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 }
 let t0=null;
 const req=new Map(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.message).slice(0,240)));
 cdp.on('Network.requestWillBeSent',e=>{
  if(t0===null&&e.type==='Document')t0=e.timestamp;
  if(t0===null)t0=e.timestamp;
  const r={
   url:e.request.url,
   kind:kind(e.request.url,e.type),
   initiator:e.initiator?.type||'unknown',
   initiatorUrl:e.initiator?.url||e.initiator?.stack?.callFrames?.[0]?.url||null,
   priority:e.request.initialPriority||null,
   t:e.timestamp,
   startMs:Math.round((e.timestamp-t0)*1000),
   method:e.request.method
  };
  req.set(e.requestId,r);
 });
 cdp.on('Network.responseReceived',e=>{
  const r=req.get(e.requestId);if(!r)return;
  r.status=e.response.status;
  r.headersAtMs=Math.round((e.timestamp-t0)*1000);
  r.fromDiskCache=!!e.response.fromDiskCache;
  r.fromServiceWorker=!!e.response.fromServiceWorker;
  r.fromPrefetchCache=!!e.response.fromPrefetchCache;
  r.protocol=e.response.protocol;
  r.responseHeaders=e.response.headers;
 });
 cdp.on('Network.loadingFinished',e=>{
  const r=req.get(e.requestId);if(!r)return;
  r.endMs=Math.round((e.timestamp-t0)*1000);
  r.bytes=e.encodedDataLength;
 });
 cdp.on('Network.loadingFailed',e=>{
  const r=req.get(e.requestId);if(!r)return;
  r.error=e.errorText;
 });
 let status=0,metrics={};
 try{
  const response=await page.goto(ROOT,{waitUntil:'domcontentloaded',timeout:75000});
  status=response.status();
  await page.waitForTimeout(test.throttle?4400:3000);
  metrics=await page.evaluate(()=>{
   const n=performance.getEntriesByType('navigation')[0],paints=performance.getEntriesByType('paint');
   return {
    fcpMs:Math.round(paints.find(x=>x.name==='first-contentful-paint')?.startTime||0),
    ttfbMs:Math.round(n.responseStart),
    domMs:Math.round(n.domContentLoadedEventEnd),
    loadMs:Math.round(n.loadEventEnd||0),
    scripts:[...document.querySelectorAll('script[src]')].map(x=>({
     url:x.src,async:x.async,defer:x.defer,type:x.type||'classic',inHead:!!x.closest('head')
    })),
    styles:[...document.querySelectorAll('link[rel=stylesheet]')].map(x=>x.href),
    bodyMode:document.body.classList.contains('is-mobile')?'mobile':document.body.classList.contains('is-desktop')?'desktop':'unknown',
    slider:!!document.querySelector('sr7-module,rs-module')
   };
  });
  const html=[...req.values()].find(x=>x.kind==='HTML');
  const resources=[...req.values()].filter(x=>x.kind==='CSS'||x.kind==='JS').map(r=>{
    const tag=r.kind==='JS'?metrics.scripts.find(x=>x.url===r.url):null;
    const url=normalize(r.url);
    return {
     type:r.kind,
     path:url,
     group:group(r.url),
     startMs:r.startMs,headersMs:r.headersAtMs??null,
     endMs:r.endMs??null,
     durationMs:r.endMs==null?null:r.endMs-r.startMs,
     bytes:Math.round(r.bytes||0),
     status:r.status??null,protocol:r.protocol||null,
     priority:r.priority,
     initiator:r.initiator,
     initiatorUrl:r.initiatorUrl?normalize(r.initiatorUrl).slice(0,160):null,
     fromDiskCache:r.fromDiskCache||false,fromServiceWorker:r.fromServiceWorker||false,
     error:r.error||null,
     async:tag?.async??null,defer:tag?.defer??null,head:tag?.inHead??null,scriptType:tag?.type??null
    };
   }).sort((a,b)=>a.startMs-b.startMs||a.type.localeCompare(b.type));
  const css=resources.filter(x=>x.type==='CSS'),js=resources.filter(x=>x.type==='JS');
  const fcp=metrics.fcpMs;
  const bins=[0,200,500,1000,2000,4000,8000,Number.POSITIVE_INFINITY];
  const buckets={};
  for(let i=0;i<bins.length-1;i++){
   const text=bins[i]+'-'+(Number.isFinite(bins[i+1])?bins[i+1]:'later')+'ms';
   buckets[text]={CSS:css.filter(x=>x.startMs>=bins[i]&&x.startMs<bins[i+1]).length,
                  JS:js.filter(x=>x.startMs>=bins[i]&&x.startMs<bins[i+1]).length};
  }
  const result={
   name:test.name,device:test.mobile?'mobile':'desktop',throttled:test.throttle,
   status,metrics:{fcpMs:metrics.fcpMs,ttfbMs:metrics.ttfbMs,domMs:metrics.domMs,loadMs:metrics.loadMs,
    scriptTags:metrics.scripts.length,styleTags:metrics.styles.length,bodyMode:metrics.bodyMode,slider:metrics.slider},
   html:{headersAtMs:html?.headersAtMs,endMs:html?.endMs,bytes:html?.bytes,
    cacheControl:html?.responseHeaders?.['cache-control']||html?.responseHeaders?.['Cache-Control']||null},
   concurrency:{css:concurrency(css),js:concurrency(js),combined:concurrency(resources)},
   starts:buckets,
   fcp:{CSS:css.filter(x=>x.startMs<=fcp).length,JS:js.filter(x=>x.startMs<=fcp).length,
    CSSFinished:css.filter(x=>x.endMs!=null&&x.endMs<=fcp).length,
    JSFinished:js.filter(x=>x.endMs!=null&&x.endMs<=fcp).length},
   sequentialCandidates:resources.filter(x=>x.startMs>(html?.endMs||0)+400)
    .map(x=>({type:x.type,group:x.group,path:x.path,start:x.startMs,initiator:x.initiator,
     initiatedBy:x.initiatorUrl,head:x.head,defer:x.defer,async:x.async})).slice(0,30),
   resources,errors
  };
  fs.writeFileSync(OUT+'/'+test.name+'.json',JSON.stringify(result,null,2));
  console.log('WATERFALL_SUMMARY '+JSON.stringify({...result,resources:undefined,sequentialCandidates:result.sequentialCandidates.slice(0,18)}).slice(0,11000));
  console.log('WATERFALL_FILES '+JSON.stringify({name:test.name,resources:resources.map(x=>({
   type:x.type,path:x.path,start:x.startMs,end:x.endMs,bytes:x.bytes,
   init:x.initiator,initUrl:x.initiatorUrl,head:x.head,defer:x.defer,async:x.async
  }))}).slice(0,35000));
  return result;
 }finally{await context.close()}
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 try{
  const results=[];
  for(const c of cases)results.push(await check(browser,c));
  const summary={cases:results.length,ok:results.filter(x=>x.status===200&&x.errors.length===0).length,
   summary:results.map(r=>({name:r.name,fcp:r.metrics.fcpMs,ttfb:r.metrics.ttfbMs,
    css:r.concurrency.css,js:r.concurrency.js,combined:r.concurrency.combined,
    body:r.metrics.bodyMode,errors:r.errors.length,starts:r.starts}))};
  console.log('WATERFALL_OVERALL '+JSON.stringify(summary).slice(0,15000));
  if(results.some(x=>x.status!==200))process.exitCode=1;
 }finally{await browser.close()}
})().catch(e=>{console.error('WATERFALL_ERROR '+(e.stack||e));process.exitCode=1});
