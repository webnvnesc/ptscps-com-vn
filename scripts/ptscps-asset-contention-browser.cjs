'use strict';
/**
 * Controlled within-origin CSS/JS resource contention study.
 * Uses Chrome and Playwright-only document interception for two synthetic cases:
 *   solo: one CSS/JS request at a time, in a clean browser context.
 *   bundle: same CSS/JS resources requested concurrently by one HTML parser.
 *   real: unchanged WordPress homepage, all real dependencies.
 *
 * All resources are fetched from the unchanged production server via HTTP/2.
 * No WordPress files, DNS, cache policy, JS or CSS are changed.
 */
const fs=require('node:fs');
const {chromium}=require('playwright');

const ORIGIN='https://ptscps.com.vn/';
const scenario=process.env.CONTENTION_NETWORK==='constrained'?'constrained':'native';
const rounds=scenario==='constrained'?4:6;
const output='ptscps-contention-'+scenario;
fs.mkdirSync(output,{recursive:true});

const wanted=[
 {key:'jannah',type:'css',re:/\/jannah\/assets\/css\/style\.min\.css(?:\?|$)/i,solo:true},
 {key:'spacer',type:'css',re:/\/elementor\/assets\/css\/widget-spacer\.min\.css(?:\?|$)/i,solo:true},
 {key:'jquery',type:'js',re:/\/jquery\/jquery\.min\.js(?:\?|$)/i,solo:true},
 {key:'base',type:'css',re:/\/jannah\/assets\/css\/base\.min\.css(?:\?|$)/i},
 {key:'widgets',type:'css',re:/\/jannah\/assets\/css\/widgets\.min\.css(?:\?|$)/i},
 {key:'helpers',type:'css',re:/\/jannah\/assets\/css\/helpers\.min\.css(?:\?|$)/i},
 {key:'elementor',type:'css',re:/\/elementor\/assets\/css\/frontend\.min\.css(?:\?|$)/i},
 {key:'migrate',type:'js',re:/\/jquery\/jquery-migrate\.min\.js(?:\?|$)/i}
];
function median(values){
 const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
 return a.length ? (a[(a.length-1)>>1]+a[a.length>>1])/2:null;
}
function percentile(values,p=.9){
 const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
 return a.length?a[Math.min(a.length-1,Math.ceil(a.length*p)-1)]:null;
}
function clean(url){
 try{
  const p=new URL(url,ORIGIN);
  if(p.origin!==new URL(ORIGIN).origin || !/^\/(?:wp-includes|wp-content)\//.test(p.pathname))
   return null;
  return p.href;
 }catch{return null;}
}
async function discover(browser){
 const context=await browser.newContext({serviceWorkers:'block'});
 try{
  const resp=await context.request.get(ORIGIN,{timeout:35000});
  if(resp.status()!==200)throw Error('Homepage HTTP '+resp.status());
  const html=await resp.text();
  const tags=html.match(/<(?:link|script)\b[^>]*>/gi)||[];
  const links=tags.map(tag=>{
   const m=/(?:href|src)\s*=\s*(["'])(.*?)\1/i.exec(tag);
   return m?clean(m[2].replaceAll('&amp;','&')):null;
  }).filter(Boolean);
  const items=wanted.map(w=>({...w,url:links.find(url=>w.re.test(url))||null}))
    .filter(x=>x.url);
  const names=new Set(items.map(x=>x.key));
  for(const key of ['jannah','spacer','jquery']){
   if(!names.has(key))throw Error('Missing real homepage asset '+key);
  }
  if(items.length<5)throw Error('Expected at least five real CSS/JS paths, saw '+items.length);
  fs.writeFileSync(output+'/asset-selection.json',JSON.stringify(items.map(({key,type,url})=>({key,type,path:new URL(url).pathname,version:new URL(url).search})),null,2));
  console.log('CONTENTION_ASSETS '+JSON.stringify(items.map(x=>({key:x.key,path:new URL(x.url).pathname}))));
  return items;
 }finally{await context.close();}
}
function syntheticHtml(items){
 const parts=items.filter(x=>x.type==='css')
   .map(x=>'<link rel="stylesheet" href="'+x.url.replaceAll('"','&quot;')+'">');
 // Defer scripts lets preload scanning fetch in parallel, without the parser
 // blocking the network; jquery remains ahead of jquery-migrate in source order.
 for(const item of items.filter(x=>x.type==='js')){
  parts.push('<script defer src="'+item.url.replaceAll('"','&quot;')+'"></script>');
 }
 return '<!doctype html><html><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  parts.join('')+'</head><body><p>PTSCPS static asset network diagnostic</p></body></html>';
}
function recordOf(row,key){
 return row.resources.find(x=>x.key===key)||null;
}
async function trial(browser,items,mode,cycle){
 const width=scenario==='constrained'?412:1440;
 const ctx=await browser.newContext({
  viewport:{width,height:width<700?850:900},
  isMobile:width<700,hasTouch:width<700,deviceScaleFactor:1,
  serviceWorkers:'block',
  ...(width<700?{userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})
 });
 const page=await ctx.newPage(),cdp=await ctx.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 if(scenario==='constrained'){
  await cdp.send('Network.emulateNetworkConditions',{
   offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:95*1024
  });
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 }
 const requests=new Map(),errors=[];
 let totalOriginRequests=0,originFailed=0;
 const assetKey=url=>items.find(x=>x.url===url)?.key || null;
 cdp.on('Network.requestWillBeSent',e=>{
  if(!e.request.url.startsWith(ORIGIN))return;
  totalOriginRequests++;
  const key=assetKey(e.request.url);
  if(!key)return;
  requests.set(e.requestId,{
   key,requestTime:e.timestamp,urlPath:new URL(e.request.url).pathname,
   resourceType:e.type,priority:e.request.initialPriority||null,
   requestedAtMs:Math.round(e.timestamp*1000),
   fromCache:false,finished:false
  });
 });
 cdp.on('Network.responseReceived',e=>{
  const r=requests.get(e.requestId);if(!r)return;
  const t=e.response.timing||null;
  Object.assign(r,{
   status:e.response.status,
   protocol:e.response.protocol||null,
   reused:e.response.connectionReused||false,
   connectionId:e.response.connectionId,
   receivedAtMs:Math.round(e.timestamp*1000),
   headerDelayMs:Math.round((e.timestamp-r.requestTime)*1000),
   serverWaitMs:t && t.receiveHeadersStart>=0 && t.sendEnd>=0?
     Math.round(t.receiveHeadersStart-t.sendEnd):null,
   priority:e.response.requestHeaders? r.priority:r.priority,
   fromCache:e.response.fromDiskCache||false
  });
 });
 cdp.on('Network.requestServedFromCache',e=>{
  const r=requests.get(e.requestId);if(r)r.fromCache=true;
 });
 cdp.on('Network.loadingFinished',e=>{
  const r=requests.get(e.requestId);if(!r)return;
  r.finished=true;
  r.downloadMs=r.receivedAtMs!=null?Math.max(0,Math.round(e.timestamp*1000)-r.receivedAtMs):null;
  r.transferredBytes=e.encodedDataLength;
 });
 cdp.on('Network.loadingFailed',e=>{
  const r=requests.get(e.requestId);if(r)r.error=e.errorText;
  originFailed++;
 });
 page.on('pageerror',e=>errors.push(e.message.slice(0,120)));
 if(mode!=='real'){
  const selected=mode==='group' ?items:[items.find(x=>x.key===mode.slice(5))];
  if(!selected[0])throw Error('Unknown mode '+mode);
  const html=syntheticHtml(selected);
  await page.route(ORIGIN,async route=>{
   await route.fulfill({status:200,contentType:'text/html; charset=utf-8',
     headers:{'cache-control':'no-store'},body:html});
  });
 }
 const row={scenario,mode,cycle,expected:mode==='group'?items.map(x=>x.key):
   mode==='real'?['jannah','spacer','jquery']:[mode.slice(5)]};
 try{
  const response=await page.goto(ORIGIN,{waitUntil:'load',timeout:32000});
  row.http=response?.status()||null;
 }catch(e){
  row.navigationIssue=String(e.message||e).split('\n')[0].slice(0,220);
 }
 // Short cooldown ensures all CDP finish events have been processed.
 await page.waitForTimeout(320);
 row.resources=[...requests.values()].map(r=>{
  // Strip private/internal timestamps from user-visible compact output.
  const {requestTime,requestedAtMs,receivedAtMs,...x}=r;
  return x;
 });
 row.byKey=Object.fromEntries(items.map(x=>[x.key,recordOf(row,x.key)]));
 row.originRequests=totalOriginRequests;
 row.originFailed=originFailed;
 row.pageErrorCount=errors.length;
 row.missing=row.expected.filter(key=>!row.byKey[key] ||
   row.byKey[key].status!==200 || !row.byKey[key].finished);
 row.ok=row.missing.length===0 && row.http===200;
 if(mode==='real') {
  try{
   row.paint=await page.evaluate(()=>({
    ttfb:Math.round(performance.getEntriesByType('navigation')[0]?.responseStart||0),
    fcp:Math.round(performance.getEntriesByType('paint')
     .find(x=>x.name==='first-contentful-paint')?.startTime||0)
   }));
  }catch{}
 }
 console.log('CONTENTION_CASE '+JSON.stringify({
  scenario,cycle,mode,ok:row.ok,http:row.http,originRequests:row.originRequests,
  originFailed:row.originFailed,missing:row.missing,nav:row.navigationIssue,
  selected:row.expected.map(key=>{
   const r=row.byKey[key];
   return {key,headers:r?.headerDelayMs??null,download:r?.downloadMs??null,
    wait:r?.serverWaitMs??null,proto:r?.protocol||null,conn:r?.connectionId||null,
    status:r?.status||null,error:r?.error||null};
  }),paint:row.paint
 }).slice(0,5000));
 fs.writeFileSync(output+'/'+cycle+'-'+mode+'.json',JSON.stringify(row,null,2));
 await ctx.close();
 return row;
}
async function main(){
 const browser=await chromium.launch({headless:true,
  args:['--no-sandbox','--disable-extensions']});
 const data=[];
 try{
  const items=await discover(browser);
  const singles=['solo_jannah','solo_spacer','solo_jquery'];
  for(let i=0;i<rounds;i++){
   // Alternate resource scheduling and group/real page position to limit
   // time drift bias. No parallel browser jobs in this single runner.
   let order=i%2===0?
     [...singles,'group','real']:
     ['real','group',...singles.slice().reverse()];
   if(i%3===2)order=[order.at(-1),...order.slice(0,-1)];
   for(const mode of order){
    const row=await trial(browser,items,mode,i);
    data.push(row);
   }
  }
  const keys=['jannah','spacer','jquery'];
  const summary={scenario,rounds,observations:{},pairDeltas:{},errors:[]};
  for(const key of keys){
   const modes=['solo_'+key,'group','real'];
   const group={};
   for(const mode of modes){
    const rs=data.filter(x=>x.mode===mode).map(x=>({cycle:x.cycle,r:x.byKey?.[key]}));
    const valid=rs.filter(({r})=>r?.status===200&&r?.finished);
    const first=valid.map(({r})=>r.headerDelayMs);
    const waited=valid.map(({r})=>r.serverWaitMs);
    const body=valid.map(({r})=>r.downloadMs);
    const errors=rs.filter(({r})=>!r || r.status!==200 || !r.finished);
    group[mode]={requested:rs.length,valid:valid.length,fail:errors.length,
      medianHeaderMs:median(first),p90HeaderMs:percentile(first),
      maxHeaderMs:first.length?Math.max(...first):null,
      medianServerWaitMs:median(waited),
      medianDownloadMs:median(body),
      outliersOver2000:first.filter(n=>n>=2000).length};
   }
   summary.observations[key]=group;
   summary.pairDeltas[key]={};
   for(const mode of ['group','real']){
    const delta=[];
    for(let i=0;i<rounds;i++){
     const a=data.find(x=>x.cycle===i&&x.mode==='solo_'+key)?.byKey?.[key];
     const b=data.find(x=>x.cycle===i&&x.mode===mode)?.byKey?.[key];
     if(a?.status===200&&a?.finished&&b?.status===200&&b?.finished)
      delta.push(b.headerDelayMs-a.headerDelayMs);
    }
    summary.pairDeltas[key][mode]={
     valid:delta.length,medianMs:median(delta),maxMs:delta.length?Math.max(...delta):null,
     groupSlowerBy500ms:delta.filter(x=>x>=500).length,
     groupFasterBy500ms:delta.filter(x=>x<=-500).length,
     values:delta};
   }
  }
  summary.severeStandaloneEvents=data.filter(x=>x.mode.startsWith('solo_'))
   .flatMap(x=>x.resources.filter(r=>r.headerDelayMs>=2500||r.error)
   .map(r=>({mode:x.mode,cycle:x.cycle,key:r.key,headerDelayMs:r.headerDelayMs,
    error:r.error||null})));
  summary.severeConcurrentEvents=data.filter(x=>x.mode==='group'||x.mode==='real')
   .flatMap(x=>keys.map(key=>({mode:x.mode,cycle:x.cycle,r:x.byKey?.[key]}))
    .filter(x=>x.r?.headerDelayMs>=2500||x.r?.error)
    .map(x=>({mode:x.mode,cycle:x.cycle,key:x.r.key,headerDelayMs:x.r.headerDelayMs,
      error:x.r.error||null})));
  summary.totalCases=data.length;
  summary.failedCases=data.filter(x=>!x.ok)
    .map(x=>({cycle:x.cycle,mode:x.mode,missing:x.missing,nav:x.navigationIssue}));
  fs.writeFileSync(output+'/summary.json',JSON.stringify(summary,null,2));
  console.log('CONTENTION_RESULT '+JSON.stringify(summary).slice(0,19000));
  // Allow packet resets to remain evidence without invalidating the diagnostic.
  if(data.filter(x=>x.ok).length<Math.ceil(data.length*.8))process.exitCode=1;
 }finally{await browser.close();}
}
main().catch(e=>{console.error('CONTENTION_FATAL '+String(e.stack||e));process.exitCode=1;});
