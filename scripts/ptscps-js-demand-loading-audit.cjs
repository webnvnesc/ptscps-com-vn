'use strict';
/** Read-only JS asset inventory for PTSCPS. Does not block, dequeue, defer,
 * write, submit forms or alter WordPress. Chrome no extensions, cold cache.
 */
const {chromium}=require('playwright');
const fs=require('node:fs');
const URL='https://ptscps.com.vn';
const paths=['/','/tin-tuc','/lien-he','/dich-vu'];
const widths=[412,1440];
const tasks=paths.flatMap(path=>widths.map(width=>({path,width})));
const group=url=>{
 if(/jquery-ui|jquery(?:\.min)?\.js|jquery-migrate/i.test(url))return 'jquery';
 if(/\/wp-includes\//.test(url))return 'wp-core';
 if(/\/plugins\/elementor-pro\//.test(url))return 'elementor-pro';
 if(/\/plugins\/elementor\//.test(url))return 'elementor';
 if(/\/plugins\/revslider\/|\/sr7|\/rbtools\//.test(url))return 'slider-revolution';
 if(/\/themes\/jannah-child\//.test(url))return 'jannah-child';
 if(/\/themes\/jannah\//.test(url))return 'jannah';
 if(/ajax-search-pro|search-pro/i.test(url))return 'ajax-search-pro';
 if(/\/plugins\/wordfence\//.test(url))return 'wordfence';
 if(/googleapis\.com|gstatic\.com/.test(url))return 'google';
 if(/\/wp-content\/plugins\//.test(url))return 'other-plugin';
 if(/\/wp-content\/themes\//.test(url))return 'other-theme';
 if(/https?:\/\/[^/]+/.test(url)&&!url.startsWith(URL))return 'third-party';
 return 'other';
};
async function sample(browser,task){
 const ctx=await browser.newContext({viewport:{width:task.width,height:task.width<700?823:900},
   isMobile:task.width<700,hasTouch:task.width<700,deviceScaleFactor:task.width<700?2:1,
   serviceWorkers:'block'});
 const page=await ctx.newPage();
 const cdp=await ctx.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 const pending=new Map(),scripts=new Map(),errors=[];
 let time0=0,finishedInitial=0;
 page.on('pageerror',e=>errors.push(String(e.message).slice(0,220)));
 cdp.on('Network.requestWillBeSent',e=>{
  if(!time0)time0=e.timestamp;
  const url=e.request.url;
  if(e.type!=='Script'&&!/\.m?js(?:[?#]|$)/i.test(url))return;
  pending.set(e.requestId,{url,short:url.replace(URL,''),group:group(url),
    startedMs:Math.round((e.timestamp-time0)*1000),
    initiator:e.initiator?.type||'',priority:e.request.initialPriority||null,
    status:null,bytes:0});
 });
 cdp.on('Network.responseReceived',e=>{
  const s=pending.get(e.requestId);if(!s)return;
  s.status=e.response.status;
  s.transferSizeHeader=Number(e.response.headers?.['Content-Length']||e.response.headers?.['content-length']||0)||null;
  s.fromDiskCache=!!e.response.fromDiskCache;
  s.contentType=e.response.mimeType;
 });
 cdp.on('Network.loadingFinished',e=>{
  const s=pending.get(e.requestId);if(!s)return;
  s.bytes=Math.round(e.encodedDataLength||0);
  s.finishMs=Math.round((e.timestamp-time0)*1000);
 });
 let http=0,error=null;
 try{
  const resp=await page.goto(URL+task.path,{waitUntil:'domcontentloaded',timeout:70000});
  http=resp.status();
  await page.waitForTimeout(3500);
  finishedInitial=Date.now();
  const initialScripts=[...pending.values()].map(s=>s.url);
  await page.evaluate(()=>scrollTo(0,Math.max(0,document.body.scrollHeight-innerHeight))).catch(()=>{});
  await page.waitForTimeout(1200);
  await page.evaluate(()=>scrollTo(0,0)).catch(()=>{});
  const evaluated=await page.evaluate(()=>{
   const p=performance.getEntriesByType('paint');
   const jsdom=[...document.querySelectorAll('script[src]')].map(e=>({
    url:e.src,async:e.async,defer:e.defer,type:e.type||'classic',
    inHead:!!e.closest('head')}));
   return {fcpMs:Math.round(p.find(e=>e.name==='first-contentful-paint')?.startTime||0),
    jsdom,inlineScripts:document.querySelectorAll('script:not([src])').length,
    slider:!!document.querySelector('sr7-module'),elementor:!!document.querySelector('.elementor-widget'),
    search:!!document.querySelector('input[name=s]'),
    formCount:document.forms.length,
    widgetTypes:[...new Set([...document.querySelectorAll('[class*="elementor-widget-"]')]
      .flatMap(e=>[...e.classList].filter(c=>c.startsWith('elementor-widget-'))))].slice(0,55)};
  });
  const records=[...pending.values()].map(x=>({
   ...x,
   loadedAfterScroll:!initialScripts.includes(x.url),
   domTag:evaluated.jsdom.find(y=>y.url===x.url)||null
  })).sort((a,b)=>a.startedMs-b.startedMs);
  const grouped={};
  for(const s of records){
   const e=grouped[s.group]||{count:0,bytes:0,afterScroll:0,headers:0};
   e.count++;e.bytes+=s.bytes;e.afterScroll+=Number(s.loadedAfterScroll);
   e.headers+=Number(!!s.domTag?.inHead);
   grouped[s.group]=e;
  }
  const summary={path:task.path,width:task.width,http,error:null,fcpMs:evaluated.fcpMs,
    totalScripts:records.length,networkTransferBytes:records.reduce((a,s)=>a+s.bytes,0),
    scriptTags:evaluated.jsdom.length,inlineScripts:evaluated.inlineScripts,
    afterScroll:records.filter(s=>s.loadedAfterScroll).length,
    groups:grouped,slider:evaluated.slider,elementor:evaluated.elementor,
    search:evaluated.search,formCount:evaluated.formCount,
    widgetTypes:evaluated.widgetTypes,errors};
  console.log('JS_AUDIT_PAGE '+JSON.stringify(summary));
  console.log('JS_AUDIT_FILES '+JSON.stringify({path:task.path,width:task.width,files:records.map(s=>({
    path:s.short.split('?')[0],group:s.group,bytes:s.bytes,status:s.status,
    start:s.startedMs,finish:s.finishMs,
    early:s.startedMs<=evaluated.fcpMs,afterScroll:s.loadedAfterScroll,
    defer:s.domTag?.defer??null,async:s.domTag?.async??null,inHead:s.domTag?.inHead??null,
    type:s.domTag?.type??null}))}).slice(0,27000));
  return {summary,files:records};
 }catch(e){
  error=String(e.message||e).slice(0,300);
  console.log('JS_AUDIT_ERROR '+JSON.stringify({path:task.path,width:task.width,http,error}));
  return {summary:{path:task.path,width:task.width,http,error},files:[]};
 }finally{await ctx.close()}
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 const results=[];let cursor=0;
 try{
  async function worker(){
   while(cursor<tasks.length){
    const task=tasks[cursor++];
    results.push(await sample(browser,task));
   }
  }
  await Promise.all([worker(),worker()]);
 }finally{await browser.close()}
 fs.writeFileSync('ptscps-js-audit.json',JSON.stringify(results,null,2));
 console.log('JS_AUDIT_SUMMARY '+JSON.stringify({
  pages:results.length,success:results.filter(x=>x.summary.http===200).length,
  metrics:results.map(x=>({path:x.summary.path,width:x.summary.width,
   count:x.summary.totalScripts,bytes:x.summary.networkTransferBytes,
   groups:x.summary.groups})),
  failed:results.filter(x=>x.summary.http!==200).map(x=>x.summary)
 }));
 if(results.some(x=>x.summary.http!==200))process.exitCode=1;
})().catch(e=>{console.error('JS_AUDIT_FATAL '+(e.stack||e));process.exitCode=1});
