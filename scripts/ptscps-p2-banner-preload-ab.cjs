'use strict';
/** Read-only SR7 first-slide preload paired A/B; no WordPress or server writes. */
const { chromium } = require('playwright');
const fs=require('node:fs');
const WIDTH=Number(process.env.TEST_WIDTH||412);
const CYCLES=Number(process.env.TEST_CYCLES||7);
const mobile=WIDTH<700;
const URL='https://ptscps.com.vn/';
const DIR='p2-banner-'+WIDTH;
fs.mkdirSync(DIR,{recursive:true});
const modes=['baseline','preload','preload_high'];
const med=a=>{const s=a.filter(Number.isFinite).sort((x,y)=>x-y);return s.length?(s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2:null};
const bitmap='ruby-banner.jpg';
async function run(browser,variant,cycle){
 const context=await browser.newContext({
  viewport:{width:WIDTH,height:mobile?823:900},deviceScaleFactor:mobile?2:1,
  isMobile:mobile,hasTouch:mobile,
  ...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})
 });
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,180)));
 const responseStarts=[];const requests=[];
 await page.addInitScript(()=>{
  window.__lcp=[];window.__layout=[];
  try{new PerformanceObserver(l=>l.getEntries().forEach(x=>{const e=x.element;window.__lcp.push({t:Math.round(x.startTime),size:x.size,tag:e?.tagName||'',text:e?.textContent?.slice(0,70)||''})})).observe({type:'largest-contentful-paint',buffered:true})}catch(e){}
  try{new PerformanceObserver(l=>l.getEntries().forEach(x=>{if(!x.hadRecentInput)window.__layout.push({t:x.startTime,v:x.value})})).observe({type:'layout-shift',buffered:true})}catch(e){}
 });
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:95*1024});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 let baseTime=0,firstStatus=0,modified=false,targetUrl=null;
 cdp.on('Network.requestWillBeSent',e=>{
  if(!baseTime&&e.type==='Document')baseTime=e.timestamp;
  if(/ruby-banner\.jpg|style\.min\.css|exo/i.test(e.request.url))requests.push({url:e.request.url,t:Math.round((e.timestamp-baseTime)*1000),priority:e.request.initialPriority||'',type:e.type});
 });
 await page.route(URL,async route=>{
  const res=await route.fetch({timeout:65000});
  const original=await res.text();firstStatus=res.status();
  // Match only a real first-slide URL from the server HTML. No guessed alternative asset.
  const match=original.match(/(?:https?:)?(?:\/\/)?ptscps\.com\.vn\/wp-content\/uploads\/2019\/10\/ruby-banner\.jpg/i);
  if(!match)throw Error('Ruby URL missing from canonical HTML: cannot safely inject');
  targetUrl='https://ptscps.com.vn/wp-content/uploads/2019/10/ruby-banner.jpg';
  if(variant==='baseline')return route.fulfill({response:res});
  const priority=variant==='preload_high'?' fetchpriority="high"':'';
  const hint='<link rel="preload" as="image" href="'+targetUrl+'"'+priority+' data-ptscps-p2="1">';
  const patched=original.replace(/<head([^>]*)>/i,'<head$1>'+hint);
  if(patched===original)throw Error('no head found');
  modified=true;
  await route.fulfill({response:res,body:patched});
 });
 let out={width:WIDTH,cycle,variant};
 try{
  const response=await page.goto(URL,{waitUntil:'domcontentloaded',timeout:80000});
  await page.waitForTimeout(5000);
  const metrics=await page.evaluate(()=>{
   const nav=performance.getEntriesByType('navigation')[0];
   const fcp=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint')?.startTime||0;
   const resources=performance.getEntriesByType('resource').filter(x=>x.name.includes('ruby-banner.jpg'));
   const module=document.querySelector('sr7-module#SR7_1_1');
   const mr=module?.getBoundingClientRect();
   const intro=[...document.querySelectorAll('p')].find(x=>(x.textContent||'').includes('Công ty Cổ phần Dịch vụ Khai thác Dầu khí PTSC'));
   const ir=intro?.getBoundingClientRect();
   return {ttfb:Math.round(nav?.responseStart||0),fcp:Math.round(fcp),lcp:window.__lcp.at(-1)||null,
    cls:window.__layout.reduce((sum,x)=>sum+x.v,0),
    rubyResources:resources.map(x=>({start:Math.round(x.startTime),finish:Math.round(x.responseEnd),transfer:x.transferSize})),
    sliderRect:mr?[mr.x,mr.y,mr.width,mr.height].map(Math.round):null,
    introRect:ir?[ir.x,ir.y,ir.width,ir.height].map(Math.round):null,
    imageLoaded:resources.some(x=>x.responseEnd>0),
    preloadCount:document.querySelectorAll('link[data-ptscps-p2]').length,
    fonts:document.fonts.status};
  });
  // Screenshots are time samples for visual QA, NOT a validated Lighthouse Speed Index.
  out={...out,http:response.status(),firstStatus,modified,targetUrl,...metrics,
   afterTtfb:metrics.fcp-metrics.ttfb,requests,errors};
  if(response.status()!==200||errors.length)out.warning='response or browser JS errors';
  if(cycle===1)await page.screenshot({path:DIR+'/'+variant+'-'+WIDTH+'.png',fullPage:false});
 }catch(e){out.error=String(e.stack||e).slice(0,900);process.exitCode=1}
 console.log('P2_CASE '+JSON.stringify(out));
 await context.close();
 return out;
}
async function main(){
 const browser=await chromium.launch({headless:true});
 const rows=[];
 try{
  for(let cycle=1;cycle<=CYCLES;cycle++){
   const order=cycle%2?[...modes]:[...modes].reverse();
   for(const variant of order)rows.push(await run(browser,variant,cycle));
  }
  const reference=new Map(rows.filter(x=>x.variant==='baseline').map(x=>[x.cycle,x]));
  for(const variant of modes){
   const good=rows.filter(x=>x.variant===variant&&x.fcp>0);
   const diffs=good.filter(x=>reference.get(x.cycle)?.fcp>0).map(x=>({
    cycle:x.cycle,
    fcp:x.fcp-reference.get(x.cycle).fcp,
    afterTtfb:x.afterTtfb-reference.get(x.cycle).afterTtfb,
    lcp:x.lcp?.t-reference.get(x.cycle).lcp?.t,
    rubyFinish:(x.rubyResources[0]?.finish??NaN)-(reference.get(x.cycle).rubyResources[0]?.finish??NaN),
    cls:x.cls-reference.get(x.cycle).cls
   }));
   const summary={width:WIDTH,variant,n:good.length,fcpMs:med(good.map(x=>x.fcp)),
    lcpMs:med(good.map(x=>x.lcp?.t)),
    clsMax:Math.max(0,...good.map(x=>x.cls)),
    rubyFinishMs:med(good.map(x=>x.rubyResources[0]?.finish)),
    pairedFcpMs:med(diffs.map(x=>x.fcp)),pairedGapMs:med(diffs.map(x=>x.afterTtfb)),
    pairedLcpMs:med(diffs.map(x=>x.lcp)),pairedRubyFinishMs:med(diffs.map(x=>x.rubyFinish)),
    deltas:diffs,errors:good.reduce((s,x)=>s+x.errors.length,0)};
   console.log('P2_SUMMARY '+JSON.stringify(summary));
  }
  fs.writeFileSync(DIR+'/results.json',JSON.stringify({rows,note:'No Lighthouse SI or actual image paint time; screenshots and network finish are supporting observations only'},null,2));
 }finally{await browser.close()}
}
main().catch(e=>{console.error('P2_FATAL '+String(e.stack||e));process.exitCode=1});
