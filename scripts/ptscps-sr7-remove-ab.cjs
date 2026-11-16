'use strict';
/**
 * Cold browser A/B for removing the FIRST HOME SR7 HERO ONLY.
 * Production WordPress and builder never change; rewrite homepage HTML in browser route.
 * Variant A current page; B remove Elementor slider widget markup; C B + remove linked
 * RevSlider SR7 CSS/JS when present (simulates WordPress not enqueueing those).
 * TBT here is a proxy (long-task blocking time 0-8s after FCP), not Lighthouse TBT.
 * Speed Index isn't inferred from FCP, request counts or JS blocking.
 */
const {chromium}=require('playwright');
const fs=require('node:fs');
const WIDTH=Number(process.env.TEST_WIDTH||412);
const CYCLES=Number(process.env.TEST_CYCLES||7);
const IS_MOBILE=WIDTH<700;
const HOME='https://ptscps.com.vn/';
const OUT='sr7-removed-ab-'+WIDTH;
const MODES=['baseline','no_widget','no_widget_no_sr7_assets'];
fs.mkdirSync(OUT,{recursive:true});
const med=(a)=>{const s=a.filter(Number.isFinite).sort((x,y)=>x-y);return s.length?(s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2:null};
function removeWidget(original) {
 const candidates=[...original.matchAll(/<(?:div|section)\b[^>]*\bclass=(["'])[^"']*\belementor-element-77137dd\b[^"']*\1[^>]*>/gi)];
 const match=candidates.find(m=>original.slice(m.index,m.index+60000).includes('SR7_1_1')||original.slice(m.index,m.index+60000).includes('sr7-module'));
 if(!match)throw Error('Expected Elementor SR7 widget .elementor-element-77137dd not found in HTML');
 const re=/<\/?(?:div|section)\b[^>]*>/gi;
 re.lastIndex=match.index;
 let depth=0,end=-1;let found;
 while((found=re.exec(original))){
  const closing=/^<\//.test(found[0]);
  depth+=closing?-1:1;
  if(depth===0){end=re.lastIndex;break}
 }
 if(end<0)throw Error('Unbalanced Elementor widget HTML: refusing to rewrite');
 const chunk=original.slice(match.index,end);
 if(!(/SR7_1_1|sr7-module|revslider/i.test(chunk)))throw Error('Selected wrapper does not contain SR7');
 if(chunk.length>180000)throw Error('Selected wrapper unexpectedly large: '+chunk.length);
 return {html:original.slice(0,match.index)+original.slice(end),bytesRemoved:Buffer.byteLength(chunk),tagCount:(chunk.match(/<[^>]+>/g)||[]).length};
}
function removeAssets(html){
 let scriptsRemoved=0,linksRemoved=0,inlineRemoved=0;
 const rScript=/<script\b[^>]*\bsrc=(["'])[^"']+\1[^>]*>\s*<\/script>/gi;
 html=html.replace(rScript,tag=>{
  if(!/\/(?:plugins\/revslider|revslider\/public|sr7\/)|(?:tptools|sr7)\.js/i.test(tag))return tag;
  scriptsRemoved++;return '';
 });
 const rLink=/<link\b[^>]*>/gi;
 html=html.replace(rLink,tag=>{
  if(!/(?:\/revslider\/|\/sr7\/|sr7\.css)/i.test(tag))return tag;
  linksRemoved++;return '';
 });
 html=html.replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi,tag=>{
  if(!(/SR7_1_1/.test(tag)&&/SR7|revslider|slider/i.test(tag)))return tag;
  inlineRemoved++;return '';
 });
 return {html,scriptsRemoved,linksRemoved,inlineRemoved};
}
function patch(html,mode){
 if(mode==='baseline')return {html,metadata:{mode,changed:false}};
 const r=removeWidget(html);
 let assetInfo={scriptsRemoved:0,linksRemoved:0,inlineRemoved:0};
 let updated=r.html;
 if(mode==='no_widget_no_sr7_assets'){
  const a=removeAssets(updated);updated=a.html;assetInfo=a;
 }
 return {html:updated,metadata:{mode,changed:true,...r,...assetInfo,htmlBytesBefore:Buffer.byteLength(html),htmlBytesAfter:Buffer.byteLength(updated)}};
}
function settings(){
 return {viewport:{width:WIDTH,height:IS_MOBILE?823:900},
  deviceScaleFactor:IS_MOBILE?2:1,isMobile:IS_MOBILE,hasTouch:IS_MOBILE,
  ...(IS_MOBILE?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})};
}
async function trial(browser,mode,cycle) {
 const ctx=await browser.newContext(settings());
 const page=await ctx.newPage();
 const errors=[],requests=new Map(),failed=[];
 page.on('pageerror',e=>errors.push(String(e.message).slice(0,180)));
 await page.addInitScript(()=>{
  window.__ptscpsAB={lcp:[],shifts:[],longtasks:[]};
  try{new PerformanceObserver(l=>l.getEntries().forEach(x=>window.__ptscpsAB.lcp.push({
   t:Math.round(x.startTime),size:x.size,
   tag:x.element?.tagName||'',src:x.url||x.element?.currentSrc||null,
   text:x.element?.textContent?.trim().slice(0,100)||null
  }))).observe({type:'largest-contentful-paint',buffered:true})}catch(e){}
  try{new PerformanceObserver(l=>l.getEntries().forEach(x=>{
   if(!x.hadRecentInput)window.__ptscpsAB.shifts.push({t:x.startTime,v:x.value});
  })).observe({type:'layout-shift',buffered:true})}catch(e){}
  try{new PerformanceObserver(l=>l.getEntries().forEach(x=>{
   window.__ptscpsAB.longtasks.push({start:x.startTime,duration:x.duration})
  })).observe({type:'longtask',buffered:true})}catch(e){}
 });
 const cdp=await ctx.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:95*1024});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 let startTime=0;let metadata=null;
 cdp.on('Network.requestWillBeSent',e=>{
  if(!startTime&&e.type==='Document')startTime=e.timestamp;
  requests.set(e.requestId,{url:e.request.url,type:e.type,start:Math.round((e.timestamp-startTime)*1000),
   priority:e.request.initialPriority||null,bytes:0});
 });
 cdp.on('Network.loadingFinished',e=>{
  const r=requests.get(e.requestId);if(r)r.bytes=e.encodedDataLength||0;
 });
 cdp.on('Network.loadingFailed',e=>{
  const r=requests.get(e.requestId);if(r){r.failed=e.errorText;failed.push({url:r.url,error:e.errorText})}
 });
 await page.route(HOME,async route=>{
  const resp=await route.fetch({timeout:65000});
  const original=await resp.text();
  if(resp.status()!==200)throw Error('HTML status '+resp.status());
  const p=patch(original,mode);metadata=p.metadata;
  await route.fulfill({response:resp,body:p.html});
 });
 let result={mode,cycle,width:WIDTH};
 try{
  const resp=await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:80000});
  await page.waitForTimeout(8000);
  const metrics=await page.evaluate(()=>{
   const perf=window.__ptscpsAB;
   const nav=performance.getEntriesByType('navigation')[0];
   const first=performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint');
   const fcp=Math.round(first?.startTime||0);
   const lcp=perf.lcp.at(-1)||null;
   const cls=perf.shifts.reduce((a,e)=>a+e.v,0);
   // Not Lighthouse TBT (Lighthouse stops at TTI). Only controlled 8s long-task proxy.
   const blockingTime=perf.longtasks.filter(x=>x.start>=fcp&&x.start<fcp+5000).reduce((a,e)=>a+Math.max(0,e.duration-50),0);
   const slider=document.querySelector('sr7-module#SR7_1_1');
   const intro=[...document.querySelectorAll('p')].find(e=>(e.textContent||'').includes('Công ty Cổ phần Dịch vụ Khai thác Dầu khí PTSC'));
   const logo=document.querySelector('img.tie-logo-img-default');
   const rect=(el)=>{const r=el?.getBoundingClientRect();return r?[r.x,r.y,r.width,r.height].map(Math.round):null};
   return {ttfb:Math.round(nav?.responseStart||0),fcp,lcp,cls,
    tbtProxy:Math.round(blockingTime),longTasks:perf.longtasks.length,
    lcpCandidateCount:perf.lcp.length,
    sliderPresent:!!slider,
    widgetPresent:!!document.querySelector('.elementor-element-77137dd'),
    sliderRect:rect(slider),introRect:rect(intro),logoRect:rect(logo),
    resources:performance.getEntriesByType('resource').length,
    navBytes:nav?.transferSize||0};
  });
  const list=[...requests.values()];
  const scripts=list.filter(x=>x.type==='Script');
  const fonts=list.filter(x=>x.type==='Font');
  const sr7=list.filter(x=>/(?:\/revslider\/|\/sr7\/|ruby-banner|\/banner[23]\.jpg)/i.test(x.url));
  const detail={
   totalRequests:list.length,scriptRequests:scripts.length,
   totalWireBytes:list.reduce((a,x)=>a+x.bytes,0),
   scriptWireBytes:scripts.reduce((a,x)=>a+x.bytes,0),
   fontRequests:fonts.length,sr7Requests:sr7.map(x=>({url:x.url,start:x.start,bytes:x.bytes,type:x.type})),
   sr7WireBytes:sr7.reduce((a,x)=>a+x.bytes,0)
  };
  result={...result,http:resp.status(),metadata,metrics,detail,errors,failed:failed.slice(0,8)};
  if(cycle===1)await page.screenshot({path:OUT+'/'+mode+'-'+WIDTH+'.png',animations:'disabled',fullPage:false,timeout:25000});
 }catch(e){result.error=String(e.stack||e).slice(0,800)}
 console.log('SR7_CASE '+JSON.stringify(result).slice(0,13500));
 await ctx.close();
 return result;
}
async function main(){
 const browser=await chromium.launch({headless:true});
 const out=[];
 try{
  for(let cycle=1;cycle<=CYCLES;cycle++){
   const order=cycle%2?MODES:[...MODES].reverse();
   for(const mode of order)out.push(await trial(browser,mode,cycle));
  }
 }finally{await browser.close()}
 const base=new Map(out.filter(x=>x.mode==='baseline'&&x.metrics?.fcp).map(x=>[x.cycle,x]));
 for(const mode of MODES){
  const valid=out.filter(x=>x.mode===mode&&x.metrics?.fcp);
  const pairs=valid.map(x=>[x,base.get(x.cycle)]).filter(([x,b])=>b);
  const changes=pairs.map(([x,b])=>({
   cycle:x.cycle,
   fcp:x.metrics.fcp-b.metrics.fcp,
   fcpAfterTtfb:(x.metrics.fcp-x.metrics.ttfb)-(b.metrics.fcp-b.metrics.ttfb),
   lcp:(x.metrics.lcp?.t||0)-(b.metrics.lcp?.t||0),
   tbtProxy:x.metrics.tbtProxy-b.metrics.tbtProxy,
   cls:x.metrics.cls-b.metrics.cls,
   sr7KB:(x.detail.sr7WireBytes-b.detail.sr7WireBytes)/1024,
   totalKB:(x.detail.totalWireBytes-b.detail.totalWireBytes)/1024
  }));
  const m=(key)=>med(valid.map(x=>x.metrics[key]));
  console.log('SR7_SUMMARY '+JSON.stringify({
   width:WIDTH,mode,valid:valid.length,pairs:pairs.length,
   fcpMs:m('fcp'),ttfbMs:m('ttfb'),lcpMs:med(valid.map(x=>x.metrics.lcp?.t)),
   tbtProxyMs:m('tbtProxy'),clsMax:Math.max(0,...valid.map(x=>x.metrics.cls)),
   sr7KB:med(valid.map(x=>x.detail.sr7WireBytes/1024)),
   totalKB:med(valid.map(x=>x.detail.totalWireBytes/1024)),
   medianPairedFcpMs:med(changes.map(x=>x.fcp)),
   medianPairedFcpAfterTtfbMs:med(changes.map(x=>x.fcpAfterTtfb)),
   medianPairedLcpMs:med(changes.map(x=>x.lcp)),
   medianPairedTbtProxyMs:med(changes.map(x=>x.tbtProxy)),
   medianPairedCLS:med(changes.map(x=>x.cls)),
   medianPairedTotalKB:med(changes.map(x=>x.totalKB)),
   lcpTags:valid.map(x=>x.metrics.lcp?.tag||null),
   changed:valid.map(x=>x.metadata?.changed),
   errors:valid.reduce((a,x)=>a+x.errors.length,0),
   failedSamples:out.filter(x=>x.mode===mode&&x.error).map(x=>x.error),
   changes
  }));
 }
 fs.writeFileSync(OUT+'/results.json',JSON.stringify({width:WIDTH,out,disclaimer:'No official Lighthouse Speed Index or TBT. Long-task proxy is 5s after FCP; the removal model may retain some enqueued assets.'},null,2));
 if(out.some(x=>x.error))process.exitCode=1;
}
main().catch(e=>{console.error('SR7_FATAL '+String(e.stack||e));process.exitCode=1});
