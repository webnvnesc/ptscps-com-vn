'use strict';
/**
 * Read-only diagnostic for repeated ruby-banner.jpg network transfer:
 * original document preload vs SR7 tptools.js loader.
 * Different independent Chromium contexts: cache active vs CDP cache disabled.
 */
const {chromium}=require('playwright');
const fs=require('node:fs');
const URL='https://ptscps.com.vn/';
const OUTPUT='ptscps-first-banner-double-fetch-audit';
fs.mkdirSync(OUTPUT,{recursive:true});
const pairs=Number(process.env.BANNER_FETCH_PAIRS||3);
const avg=(xs)=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
async function run(browser,variant,cycle){
 const isMobile=variant.startsWith('mobile');
 const disableCache=variant.endsWith('cacheOff');
 const ctx=await browser.newContext({viewport:isMobile?{width:412,height:850}:{width:1440,height:900},
  isMobile,hasTouch:isMobile,deviceScaleFactor:1,serviceWorkers:'block'});
 const page=await ctx.newPage();
 const cdp=await ctx.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:disableCache});
 const reqs=new Map(),errors=[];
 const target=s=>/\/wp-content\/uploads\/2019\/10\/ruby-banner\.jpg(?:\?|$)/.test(s||'');
 function get(id){if(!reqs.has(id))reqs.set(id,{id});return reqs.get(id)}
 page.on('pageerror',e=>errors.push(String(e.message).slice(0,180)));
 cdp.on('Network.requestWillBeSent',e=>{
  if(!target(e.request.url))return;
  const r=get(e.requestId);
  Object.assign(r,{
   url:e.request.url,initiatorType:e.initiator?.type??null,
   initiatorUrl:e.initiator?.url??e.initiator?.stack?.callFrames?.[0]?.url??null,
   initiatorLine:e.initiator?.lineNumber??null,
   callframes:e.initiator?.stack?.callFrames?.slice(0,4).map(f=>({
    url:(f.url||'').split('?')[0].split('/').at(-1),line:f.lineNumber,function:f.functionName})),
   type:e.type,order:Date.now(),timestamp:e.timestamp
  });
 });
 cdp.on('Network.requestWillBeSentExtraInfo',e=>{
  const r=reqs.get(e.requestId);if(!r)return;
  const h=e.headers||{};
  r.requestHeaders=Object.fromEntries(Object.entries(h)
    .filter(([k])=>/^(accept|origin|referer|sec-fetch-|cache-control|pragma|range|if-none-match|if-modified-since)$/i.test(k)));
 });
 cdp.on('Network.responseReceived',e=>{
  if(!target(e.response.url))return;
  const r=get(e.requestId);
  Object.assign(r,{status:e.response.status,protocol:e.response.protocol,
   mime:e.response.mimeType,fromDiskCache:e.response.fromDiskCache,
   fromPrefetchCache:e.response.fromPrefetchCache,fromServiceWorker:e.response.fromServiceWorker,
   responseHeaders:Object.fromEntries(Object.entries(e.response.headers||{})
    .filter(([k])=>/^(cache-control|content-type|content-length|vary|etag|age|last-modified|x-cache|cf-cache-status)$/i.test(k)))});
 });
 cdp.on('Network.responseReceivedExtraInfo',e=>{
  const r=reqs.get(e.requestId);if(!r)return;
  r.extraStatus=e.statusCode;
 });
 cdp.on('Network.loadingFinished',e=>{
  const r=reqs.get(e.requestId);if(!r)return;
  r.encodedDataLength=e.encodedDataLength;
  r.finishedAt=e.timestamp;
 });
 cdp.on('Network.loadingFailed',e=>{
  const r=reqs.get(e.requestId);if(!r)return;
  r.failed=e.errorText;
 });
 const out={variant,cycle,disableCache};
 try{
  const response=await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(6500);
  const info=await page.evaluate(()=>{
   const preload=[...document.querySelectorAll('link[rel="preload"][as="image"]')]
     .filter(x=>/ruby-banner/.test(x.href))
     .map(x=>({href:x.href,crossorigin:x.getAttribute('crossorigin'),
       fetchpriority:x.getAttribute('fetchpriority'),as:x.as}));
   const entries=performance.getEntriesByType('resource').filter(x=>/ruby-banner\.jpg/.test(x.name))
     .map(x=>({name:x.name,initiatorType:x.initiatorType,
       startTime:Math.round(x.startTime),duration:Math.round(x.duration),
       transferSize:x.transferSize,encodedBodySize:x.encodedBodySize,decodedBodySize:x.decodedBodySize,
       responseStatus:x.responseStatus}));
   const m=document.querySelector('#SR7_1_1');
   const fcp=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
   return {preloads:preload,resourceEntries:entries,firstPoster:m?.getAttribute('data-ptscps-poster'),
    canvas:m?.querySelectorAll('canvas[data-use-for="BGContentImage"]').length||0,
    slides:m?.querySelectorAll('sr7-slide').length||0,
    imageDomCount:document.querySelectorAll('img[src*="ruby-banner"]').length,
    fcp:Math.round(fcp?.startTime||0),
    current:m?.getAttribute('data-current')||null};
  });
  Object.assign(out,info,{pageStatus:response.status()});
  out.requests=[...reqs.values()].sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));
  out.networkTransfers=out.requests.filter(r=>r.status===200&&r.encodedDataLength>40000).length;
  out.transferBytes=out.requests.reduce((s,r)=>s+(r.encodedDataLength||0),0);
  out.ok=out.pageStatus===200&&out.preloads.length===1&&out.canvas>=2&&!errors.length;
 }catch(e){out.ok=false;out.error=String(e.message||e).slice(0,500);}
 out.errors=errors;
 fs.writeFileSync(OUTPUT+'/'+variant+'-'+cycle+'.json',JSON.stringify(out,null,2));
 console.log('BANNER_FETCH_CASE '+JSON.stringify(out).slice(0,18000));
 await ctx.close();
 return out;
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const rows=[];
 try{
  for(let i=0;i<pairs;i++){
   for(const variant of (i%2?
    ['mobile-cacheOff','mobile-cacheOn','desktop-cacheOff','desktop-cacheOn']:
    ['mobile-cacheOn','mobile-cacheOff','desktop-cacheOn','desktop-cacheOff'])){
    rows.push(await run(browser,variant,i));
   }
  }
 }finally{await browser.close();}
 const stats={pairs,ok:rows.filter(r=>r.ok).length,total:rows.length,
  cases:rows.map(r=>({variant:r.variant,cycle:r.cycle,ok:r.ok,
    requests:r.requests?.length,networkTransfers:r.networkTransfers,
    totalBytes:r.transferBytes,fcp:r.fcp,errors:r.errors,error:r.error})),
  groups:Object.fromEntries([...new Set(rows.map(r=>r.variant))].map(v=>{
    const group=rows.filter(r=>r.variant===v);
    return [v,{ok:group.filter(r=>r.ok).length,
      meanRequests:avg(group.map(r=>r.requests?.length).filter(Number.isFinite)),
      meanNetworkTransfers:avg(group.map(r=>r.networkTransfers).filter(Number.isFinite)),
      meanBytes:avg(group.map(r=>r.transferBytes).filter(Number.isFinite))}];
  }))};
 fs.writeFileSync(OUTPUT+'/summary.json',JSON.stringify(stats,null,2));
 console.log('BANNER_FETCH_SUMMARY '+JSON.stringify(stats).slice(0,14500));
 if(stats.ok<rows.length*.7)process.exitCode=1;
})().catch(e=>{console.error('BANNER_FETCH_FATAL '+String(e.stack||e));process.exitCode=1});
