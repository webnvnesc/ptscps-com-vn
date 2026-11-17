'use strict';
/**
 * SR7 LCP critical path on actual PTSCPS production, no source interception.
 * Correlates first-image responseEnd, stylesheet finish, paint events, LCP,
 * SR7 ready event. One extra no-JS screenshot verifies fallback independent of
 * slider JS. No live website modifications.
 */
const {chromium}=require('playwright');
const fs=require('node:fs');
const {PNG}=require('pngjs');
const DEVICE=process.env.SR7_GATE_DEVICE==='desktop'?'desktop':'mobile';
const mobile=DEVICE==='mobile';
const LOOPS=Math.max(1,Math.min(3,Number(process.env.SR7_GATE_LOOPS||3)));
const ORIGIN='https://ptscps.com.vn/';
const OUTPUT='sr7-lcp-gate-'+DEVICE;
fs.mkdirSync(OUTPUT,{recursive:true});
const round=v=>Number.isFinite(v)?Math.round(v):null;
const med=xs=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[(a.length-1)>>1]+a[a.length>>1])/2:null};
function fraction(buf,clip){
 const png=PNG.sync.read(buf);let total=0,white=0,blue=0;
 const x0=Math.max(0,Math.round(clip?.x||0));
 const x1=Math.min(png.width,x0+Math.round(clip?.width||png.width));
 const y0=Math.max(0,Math.round(clip?.y||0));
 const y1=Math.min(png.height,y0+Math.round(clip?.height||png.height));
 for(let y=y0;y<y1;y+=6)for(let x=x0;x<x1;x+=6){
   const at=4*(y*png.width+x),r=png.data[at],g=png.data[at+1],b=png.data[at+2];
   total++;if(r>235&&g>235&&b>235)white++;if(b>r+20&&b>g+6)blue++;
 }
 return {samples:total,white:total?round(1000*white/total)/10:null,blue:total?round(1000*blue/total)/10:null};
}
async function run(browser,iteration,jsEnabled){
 const context=await browser.newContext({viewport:{width:mobile?412:1440,height:mobile?850:900},
   deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,javaScriptEnabled:jsEnabled,
   serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 const data={device:DEVICE,iteration,jsEnabled,errors};
 page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,200)));
 if(jsEnabled)await page.addInitScript(()=>{
   window.__ptscpsGate={lcp:[],paint:[],ready:[],dom:[],shift:[]};
   try{new PerformanceObserver(list=>list.getEntries().forEach(e=>{
     const el=e.element;
     window.__ptscpsGate.lcp.push({
       start:Math.round(e.startTime),render:Math.round(e.renderTime||0),
       load:Math.round(e.loadTime||0),url:e.url||null,
       el:el?.tagName||null,id:el?.id||null,size:Math.round(e.size||0),
       hasPoster:!!el?.getAttribute?.('data-ptscps-poster')
     });
   })).observe({type:'largest-contentful-paint',buffered:true});}catch{}
   try{new PerformanceObserver(list=>list.getEntries().forEach(e=>
     window.__ptscpsGate.paint.push({name:e.name,time:Math.round(e.startTime)})))
       .observe({type:'paint',buffered:true});}catch{}
   try{new PerformanceObserver(list=>list.getEntries().forEach(e=>{
     if(!e.hadRecentInput)window.__ptscpsGate.shift.push(e.value);
   })).observe({type:'layout-shift',buffered:true});}catch{}
   document.addEventListener('DOMContentLoaded',()=>{
     window.__ptscpsGate.dom.push({event:'domcontentloaded',t:Math.round(performance.now())});
   },{once:true});
   document.addEventListener('sr.module.ready',()=>{
     window.__ptscpsGate.ready.push(Math.round(performance.now()));
   },true);
 });
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Page.enable');
 await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});
 if(mobile){
   await cdp.send('Network.emulateNetworkConditions',{
     offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:95*1024
   });
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 }
 let t0=null;
 const req=new Map(),lifecycle=[];
 cdp.on('Network.requestWillBeSent',e=>{
   if(e.type==='Document'&&t0===null)t0=e.timestamp;
   if(!(/ptscps\.com\.vn/.test(e.request.url)))return;
   req.set(e.requestId,{
     url:e.request.url,type:e.type,priority:e.request.initialPriority,
     start:e.timestamp,initiator:e.initiator?.type||null
   });
 });
 cdp.on('Network.responseReceived',e=>{
   const x=req.get(e.requestId);if(x){
     x.header=e.timestamp;x.status=e.response.status;
     x.mime=e.response.mimeType||null;
   }
 });
 cdp.on('Network.loadingFinished',e=>{
   const x=req.get(e.requestId);if(x){x.end=e.timestamp;x.bytes=e.encodedDataLength}
 });
 cdp.on('Network.loadingFailed',e=>{
   const x=req.get(e.requestId);if(x){x.failed=e.errorText;x.end=e.timestamp}
 });
 cdp.on('Page.lifecycleEvent',e=>{
   if(/firstPaint|firstContentfulPaint|DOMContentLoaded|load/i.test(e.name)){
     lifecycle.push({event:e.name,t:e.timestamp});
   }
 });
 try{
   const response=await page.goto(ORIGIN,{waitUntil:'commit',timeout:90000});
   data.http=response.status();
   await page.waitForTimeout(mobile?10500:7500);
   const browserData=jsEnabled?await page.evaluate(()=>{
     const m=document.querySelector('sr7-module#SR7_1_1');
     const n=performance.getEntriesByType('navigation')[0];
     const target=m?.getAttribute('data-ptscps-poster')||document.querySelector('link[data-ptscps-sr7-first-preload]')?.href||null;
     const css=m?getComputedStyle(m):null;
     return {
       browser:window.__ptscpsGate,
       navigation:{ttfb:Math.round(n?.responseStart||0),dom:Math.round(n?.domContentLoadedEventEnd||0)},
       bannerUrl:target,
       poster:!!m?.getAttribute('data-ptscps-poster'),
       preload:document.querySelector('link[data-ptscps-sr7-first-preload]')?.fetchPriority||null,
       module:{visibility:css?.visibility,opacity:css?.opacity,display:css?.display,bg:css?.backgroundImage.slice(0,160),
         current:m?.getAttribute('data-current')},
       cls:(window.__ptscpsGate.shift||[]).reduce((a,b)=>a+b,0),
       horizontalOverflow:document.documentElement.scrollWidth>innerWidth+3
     };
   }):{};
   data.page=browserData;
   // CDP is recorded even when main JS execution has been disabled.
   const all=[...req.values()].map(x=>({
     ...x,startMs:round((x.start-(t0??x.start))*1000),
     endMs:x.end?round((x.end-(t0??x.start))*1000):null,
     headerMs:x.header?round((x.header-(t0??x.start))*1000):null
   }));
   const relevant=all.filter(x=>/ruby-banner|banner[23]\.jpg|sr7\.js|tptools\.js|\/css\/|\.css\?|\.woff2|\/jquery(?:\.min)?\.js/i.test(x.url));
   data.network=relevant.map(x=>({
     path:x.url.split('?')[0].replace('https://ptscps.com.vn',''),
     type:x.type,status:x.status,priority:x.priority,start:x.startMs,end:x.endMs,
     bytes:x.bytes,failed:x.failed
   }));
   data.lifecycle=lifecycle.map(x=>({event:x.event,t:round((x.t-(t0||x.t))*1000)}));
   const url=browserData.bannerUrl;
   const matchBanner=all.filter(x=>url&&x.url.split('?')[0]===url.split('?')[0]).sort((a,b)=>a.startMs-b.startMs)[0];
   const lcp=browserData.browser?.lcp?.at(-1)||null;
   const css=all.filter(x=>x.type==='Stylesheet').filter(x=>x.endMs!==null).sort((a,b)=>a.endMs-b.endMs);
   const scripts=all.filter(x=>x.type==='Script').filter(x=>x.endMs!==null).sort((a,b)=>a.endMs-b.endMs);
   const firstBanner={start:matchBanner?.startMs??null,end:matchBanner?.endMs??null,bytes:matchBanner?.bytes??null,
      priority:matchBanner?.priority??null,mime:matchBanner?.mime??null};
   data.summary={device:DEVICE,iteration,jsEnabled,http:data.http,
     firstBanner,lcp,lcpCandidateMatchesBanner:!!(url&&lcp?.url&&url.split('?')[0]===lcp.url.split('?')[0]),
     bannerToLcpMs:matchBanner?.endMs!=null&&lcp?.start!=null?round(lcp.start-matchBanner.endMs):null,
     fcp:browserData.browser?.paint?.find(x=>x.name==='first-contentful-paint')?.time??null,
     sr7Ready:browserData.browser?.ready?.[0]??null,
     lastCssBeforeLCP:css.filter(x=>lcp?.start!=null&&x.endMs<=lcp.start).slice(-3).map(x=>({end:x.endMs,path:x.url.split('?')[0].split('/').slice(-2).join('/')})),
     cssAfterLCP:css.filter(x=>lcp?.start!=null&&x.endMs>lcp.start).length,
     jsAfterLCP:scripts.filter(x=>lcp?.start!=null&&x.endMs>lcp.start).length,
     poster:browserData.poster??null,preload:browserData.preload??null,
     horizontalOverflow:browserData.horizontalOverflow??null,cls:browserData.cls??null,
     errors
   };
   if(!jsEnabled){
     // Snapshot with JS disabled: confirm SR7's first image can appear before native init.
     const png=await page.screenshot({type:'png',timeout:15000});
     fs.writeFileSync(OUTPUT+'/no-js-'+iteration+'.png',png);
     let rect=null;
     try{rect=await page.locator('sr7-module#SR7_1_1').boundingBox({timeout:3000});}catch{}
     data.summary.noJsPixels=fraction(png,rect);
     data.summary.noJsHeroRect=rect;
   }
   if(jsEnabled&&!lcp)throw Error('LCP observer returned no entries');
   if(data.http!==200)throw Error('Home document status '+data.http);
   if(jsEnabled&&!browserData.poster)throw Error('First banner CSS poster missing');
   if(jsEnabled&&!browserData.preload)throw Error('First banner preload missing');
   data.ok=true;
   console.log('SR7_LCP_GATE_CASE '+JSON.stringify(data.summary).slice(0,5500));
 }catch(e){
   data.ok=false;data.error=String(e.stack||e).slice(0,1000);
   console.log('SR7_LCP_GATE_ERROR '+JSON.stringify({device:DEVICE,iteration,jsEnabled,error:data.error}));
 }
 fs.writeFileSync(OUTPUT+'/case-'+iteration+'-'+(jsEnabled?'js':'nojs')+'.json',JSON.stringify(data,null,2));
 await context.close();
 return data;
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const data=[];
 try{
   for(let i=0;i<LOOPS;i++)data.push(await run(browser,i,true));
   data.push(await run(browser,0,false));
 }finally{await browser.close();}
 const valid=data.filter(x=>x.ok&&x.jsEnabled);
 const nojs=data.find(x=>!x.jsEnabled);
 const summary={device:DEVICE,jsValid:valid.length,jsExpected:LOOPS,
   noJsValid:!!nojs?.ok,
   medians:{
     ttfb:med(valid.map(x=>x.page?.navigation?.ttfb)),
     lcp:med(valid.map(x=>x.summary.lcp?.start)),
     fcp:med(valid.map(x=>x.summary.fcp)),
     imageEnd:med(valid.map(x=>x.summary.firstBanner?.end)),
     bannerToLcp:med(valid.map(x=>x.summary.bannerToLcpMs)),
     sr7Ready:med(valid.map(x=>x.summary.sr7Ready)),
   },
   bannerIsLcp:valid.filter(x=>x.summary.lcpCandidateMatchesBanner).length,
   details:valid.map(x=>x.summary),
   noJs:{image:x=>(x),pixels:nojs?.summary?.noJsPixels??null,heroRect:nojs?.summary?.noJsHeroRect??null}
 };
 delete summary.noJs.image;
 fs.writeFileSync(OUTPUT+'/summary.json',JSON.stringify(summary,null,2));
 console.log('SR7_LCP_GATE_SUMMARY '+JSON.stringify(summary).slice(0,20000));
 if(valid.length!==LOOPS||!nojs?.ok)process.exitCode=1;
})().catch(e=>{console.error('SR7_LCP_GATE_FATAL '+String(e.stack||e));process.exitCode=1});
