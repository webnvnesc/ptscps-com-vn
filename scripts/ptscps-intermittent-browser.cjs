'use strict';
/**
 * PTSCPS intermittent render blocking: browser-only, cold-cache diagnostic.
 * Separates actual origin/network phases from simulated Lighthouse download.
 * No HTML edits, no WordPress writes, no webhooks.
 */
const { chromium }=require('playwright');
const fs=require('node:fs');
const width=Number(process.env.TEST_WIDTH||412);
const cycles=Number(process.env.TEST_CYCLES||7);
const modes=['native','throttled'];
const folder='ptscps-intermittent-browser-'+width;
const home='https://ptscps.com.vn/';
fs.mkdirSync(folder,{recursive:true});
const med=(a)=>{const v=a.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?(v[(v.length-1)>>1]+v[v.length>>1])/2:null};
const percentile=(a,p)=>{const v=a.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?v[Math.ceil((v.length-1)*p)]:null};
const group=url=>{
 if(/\/jquery\/jquery\.min\.js/.test(url))return 'jquery-core';
 if(/\/jquery\/jquery-migrate\.min\.js/.test(url))return 'jquery-migrate';
 if(/\/elementor\/assets\/css\/widget-spacer\.min\.css/.test(url))return 'elementor-spacer-css';
 if(/\/elementor\/assets\/css\/widget-image-box\.min\.css/.test(url))return 'elementor-image-box-css';
 if(/\/elementor\/assets\/css\/frontend\.min\.css/.test(url))return 'elementor-frontend-css';
 if(/\/jannah\/assets\/css\/style\.min\.css/.test(url))return 'jannah-style-css';
 if(/\/jannah\/assets\/css\/helpers\.min\.css/.test(url))return 'jannah-helpers-css';
 if(/\/jannah\/assets\/css\/fontawesome/.test(url))return 'fontawesome-css';
 if(/\/jannah\/assets\/css\//.test(url))return 'jannah-other-css';
 if(/\/elementor\/assets\/css\//.test(url))return 'elementor-other-css';
 if(/\/revslider\/|\/sr7\./.test(url))return 'slider';
 if(/\.css(?:\?|$)/.test(url))return 'other-css';
 if(/\.js(?:\?|$)/.test(url))return 'other-js';
 return 'other';
};
async function probe(browser,cycle,mode){
 const mobile=width<700;
 const context=await browser.newContext({viewport:{width,height:mobile?823:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1,
  ...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})});
 const page=await context.newPage();
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 if(mode==='throttled'){
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:95*1024});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 }
 let originTime=null;
 const resources=new Map();
 const errors=[];page.on('pageerror',e=>errors.push(String(e.message).slice(0,180)));
 cdp.on('Network.requestWillBeSent',e=>{
  if(originTime===null&&e.type==='Document')originTime=e.timestamp;
  if(!e.request.url.startsWith(home))return;
  resources.set(e.requestId,{url:e.request.url.replace(home,'/'),type:e.type,
   start:Math.round((e.timestamp-(originTime||e.timestamp))*1000),
   requestTimestamp:e.timestamp,priority:e.request.initialPriority||null,
   fromCache:false});
 });
 cdp.on('Network.resourceChangedPriority',e=>{
  const r=resources.get(e.requestId);if(r)r.priorityFinal=e.newPriority;
 });
 cdp.on('Network.requestServedFromCache',e=>{
  const r=resources.get(e.requestId);if(r)r.fromCache=true;
 });
 cdp.on('Network.responseReceived',e=>{
  const r=resources.get(e.requestId);if(!r)return;
  const t=e.response.timing||null;
  Object.assign(r,{status:e.response.status,received:Math.round((e.timestamp-originTime)*1000),
   protocol:e.response.protocol,connectionId:e.response.connectionId,
   connectionReused:e.response.connectionReused,fromDiskCache:e.response.fromDiskCache,
   encodedLength:e.response.encodedDataLength,contentLength:e.response.headers?.['content-length']||null,
   encoding:e.response.headers?.['content-encoding']||null,
   contentType:e.response.mimeType,timing:t?
   {sendStart:t.sendStart,sendEnd:t.sendEnd,headersStart:t.receiveHeadersStart,headersEnd:t.receiveHeadersEnd,
    connectStart:t.connectStart,connectEnd:t.connectEnd,dnsStart:t.dnsStart,dnsEnd:t.dnsEnd,sslStart:t.sslStart,sslEnd:t.sslEnd,
    requestTime:t.requestTime}:null
  });
 });
 cdp.on('Network.loadingFinished',e=>{
  const r=resources.get(e.requestId);if(r){r.finished=Math.round((e.timestamp-originTime)*1000);r.wireBytes=e.encodedDataLength}
 });
 cdp.on('Network.loadingFailed',e=>{
  const r=resources.get(e.requestId);if(r)r.error=e.errorText;
 });
 await page.addInitScript(()=>{
  window.__perfTrack={lcp:[],shift:[]};
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__perfTrack.lcp.push({t:Math.round(e.startTime),
   tag:e.element?.tagName||null,url:e.url||null}))).observe({type:'largest-contentful-paint',buffered:true})}catch(e){}
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__perfTrack.shift.push(e.value)})).observe({type:'layout-shift',buffered:true})}catch(e){}
 });
 const row={width,cycle,mode};
 try{
  const response=await page.goto(home,{waitUntil:'domcontentloaded',timeout:75000});
  await page.waitForTimeout(1800);
  const metrics=await page.evaluate(()=>{
   const nav=performance.getEntriesByType('navigation')[0];
   const fcp=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint')?.startTime||0;
   return {ttfb:Math.round(nav?.responseStart||0),fcp:Math.round(fcp),
    lcp:window.__perfTrack.lcp.at(-1)||null,
    cls:window.__perfTrack.shift.reduce((a,b)=>a+b,0),resourceCount:performance.getEntriesByType('resource').length};
  });
  const lines=[...resources.values()].filter(r=>r.type==='Document'||r.type==='Stylesheet'||r.type==='Script').map(r=>{
   const t=r.timing;
   const queueDelay=t&&t.sendStart>=0?Math.round((t.requestTime-r.requestTimestamp)*1000+t.sendStart):null;
   const serverWait=t&&t.receiveHeadersStart>=0&&t.sendEnd>=0?Math.round(t.receiveHeadersStart-t.sendEnd):null;
   return {url:r.url,type:r.type,group:group(r.url),start:r.start,
    received:r.received??null,finish:r.finished??null,
    pendingMs:r.received==null?null:r.received-r.start,
    bodyMs:r.finished==null||r.received==null?null:r.finished-r.received,
    queueDelayMs:queueDelay,serverWaitMs:serverWait,
    status:r.status||null,bytes:r.wireBytes||0,
    protocol:r.protocol||null,conn:r.connectionId||null,reused:r.connectionReused,
    priority:r.priorityFinal||r.priority||null,cached:r.fromCache||r.fromDiskCache||false,
    encoding:r.encoding,error:r.error||null};
  }).sort((a,b)=>a.start-b.start);
  Object.assign(row,{status:response.status(),...metrics,
   fcpMinusTtfb:metrics.fcp-metrics.ttfb,resources:lines,
   renderBlockers:lines.filter(x=>x.type==='Stylesheet'||(x.type==='Script'&&/jquery|slider/.test(x.group))),
   errors});
 }catch(e){row.error=String(e.message||e).slice(0,450);process.exitCode=1}
 fs.writeFileSync(folder+'/'+mode+'-'+cycle+'.json',JSON.stringify(row,null,2));
 const selected=(row.renderBlockers||[]).filter(x=>/elementor-spacer|jannah-style|elementor-frontend|jquery-core|jannah-helpers/.test(x.group)).slice(0,12);
 console.log('STALL_CASE '+JSON.stringify({width,cycle,mode,http:row.status,ttfb:row.ttfb,fcp:row.fcp,
  fcpMinusTtfb:row.fcpMinusTtfb,lcp:row.lcp,cls:row.cls,selected,errors:row.errors,error:row.error}));
 await context.close();
 return row;
}
async function main(){
 const browser=await chromium.launch({headless:true});const rows=[];
 try{
  for(let i=1;i<=cycles;i++){
   const order=i%2?modes:[...modes].reverse();
   for(const mode of order)rows.push(await probe(browser,i,mode));
  }
 }finally{await browser.close()}
 for(const mode of modes){
  const subset=rows.filter(x=>x.mode===mode&&x.fcp>0);
  const res=subset.flatMap(x=>x.renderBlockers.map(r=>({...r,cycle:x.cycle,ttfb:x.ttfb,fcp:x.fcp})));
  const summaryGroups=[...new Set(res.map(x=>x.group))].map(g=>{
   const items=res.filter(x=>x.group===g);
   return {name:g,n:items.length,medianPending:med(items.map(x=>x.pendingMs)),
    p90Pending:percentile(items.map(x=>x.pendingMs),.9),
    maxPending:Math.max(...items.map(x=>x.pendingMs||0)),
    medianBody:med(items.map(x=>x.bodyMs)),medianQueue:med(items.map(x=>x.queueDelayMs)),
    medianWait:med(items.map(x=>x.serverWaitMs)),
    transferBytes:med(items.map(x=>x.bytes)),
    firstConnectionIds:[...new Set(items.map(x=>x.conn))].slice(0,6)};
  }).sort((a,b)=>b.p90Pending-a.p90Pending);
  console.log('STALL_SUMMARY '+JSON.stringify({width,mode,n:subset.length,
   medianTTFB:med(subset.map(x=>x.ttfb)),p90TTFB:percentile(subset.map(x=>x.ttfb),.9),
   medianFCP:med(subset.map(x=>x.fcp)),p90FCP:percentile(subset.map(x=>x.fcp),.9),
   medianAfterTTFB:med(subset.map(x=>x.fcpMinusTtfb)),
   medianCLS:med(subset.map(x=>x.cls)),groups:summaryGroups}));
 }
 fs.writeFileSync(folder+'/all.json',JSON.stringify({rows,
  notes:'Browser network pending time includes queuing and network; not proof of server processing time. Slow arm uses artificial 150ms RTT, ~210KiB/s download and 4x CPU.'},null,2));
 if(rows.some(r=>r.error))process.exitCode=1;
}
main().catch(e=>{console.error('STALL_FATAL '+String(e.stack||e));process.exitCode=1});
