'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs');
const BASE='https://ptscps.com.vn/';
const MODE=process.env.TEST_MODE||'fixed';
const WIDTH=Number(process.env.TEST_WIDTH||412);
const CYCLES=Number(process.env.TEST_CYCLES||7);
const OUT='preload-results';
fs.mkdirSync(OUT,{recursive:true});
function median(xs){if(!xs.length)return null;const s=[...xs].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2}
function cssHref(html){
 const m=html.match(/<link\b[^>]*\bid=["']tie-css-styles-css["'][^>]*>/i);
 return m?.[0]?.match(/\bhref=["']([^"']+)/i)?.[1]?.replaceAll('&amp;','&')||null;
}
async function main(){
 const browser=await chromium.launch({headless:true});
 try{
  const ctx=await browser.newContext();
  const response=await ctx.request.get(BASE,{timeout:60000});
  if(!response.ok())throw Error('Cannot fetch homepage '+response.status());
  const fixed=await response.text(),url=cssHref(fixed);
  if(!url)throw Error('No Jannah CSS original link, cannot test');
  console.log('PRELOAD_TARGET',url);
  await ctx.close();
  const samples=[];
  const variants=['control','preload'];
  for(let cycle=0;cycle<CYCLES;cycle++){
   const order=cycle%2===0?variants:[...variants].reverse();
   for(const variant of order){
    const context=await browser.newContext({viewport:{width:WIDTH,height:WIDTH<700?823:900},isMobile:WIDTH<700,hasTouch:WIDTH<700,deviceScaleFactor:WIDTH<700?1.75:1});
    const page=await context.newPage();
    let inserted=false;const errors=[];
    page.on('pageerror',e=>errors.push(e.message.slice(0,160)));
    await page.route(BASE,async route=>{
     let html=fixed;
     if(MODE==='live'){
       const res=await route.fetch({timeout:65000});html=await res.text();
     }else await new Promise(r=>setTimeout(r,400));
     if(variant==='preload'){
       const href=cssHref(html);
       if(!href)throw Error('Jannah CSS disappeared');
       const tag='<link id="ptscps-preload-experiment" rel="preload" as="style" href="'+href+'">';
       html=html.replace(/<head([^>]*)>/i,'<head$1>'+tag);inserted=true;
     }
     await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
    });
    await page.addInitScript(()=>{
      window.__shifts=[];
      try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__shifts.push(e.value)}).observe({type:'layout-shift',buffered:true})}catch(e){}
    });
    const cdp=await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:205*1024,uploadThroughput:95*1024});
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    let out={cycle,variant,mode:MODE,width:WIDTH,inserted};
    try{
     const res=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:80000});
     await page.waitForTimeout(4200);
     const m=await page.evaluate(()=>{
       const nav=performance.getEntriesByType('navigation')[0];
       const fcp=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
       const css=performance.getEntriesByType('resource').filter(x=>/\/jannah\/assets\/css\/style\.min\.css/.test(x.name));
       const slider=document.querySelector('.elementor-element-77137dd')?.getBoundingClientRect();
       const intro=document.querySelector('.elementor-element-920fc5e')?.getBoundingClientRect();
       const jq=performance.getEntriesByType('resource').filter(x=>/jquery\/jquery\.min\.js/.test(x.name));
       return {fcp:Math.round(fcp?.startTime||0),ttfb:Math.round(nav.responseStart),
        cls:window.__shifts.reduce((a,v)=>a+v,0),
        cssRequests:css.length,cssStart:Math.round(css[0]?.startTime||0),cssFinish:Math.round(css[0]?.responseEnd||0),
        cssTransfer:css.reduce((s,x)=>s+x.transferSize,0),jqueryFinish:Math.round(jq[0]?.responseEnd||0),
        sliderHeight:Math.round(slider?.height||0),introY:Math.round(intro?.y||0),font:document.fonts.status,
        preloadExists:!!document.querySelector('#ptscps-preload-experiment')};
     });
     out={...out,http:res.status(),...m,afterTTFB:m.fcp-m.ttfb,errors};
    }catch(e){out.error=String(e.stack||e).slice(0,900);process.exitCode=1}
    await context.close();
    samples.push(out);console.log('SAMPLE '+JSON.stringify(out));
   }
  }
  const by={};
  for(const v of variants){
   const a=samples.filter(x=>x.variant===v&&x.fcp>0);
   by[v]={n:a.length,fcp:median(a.map(x=>x.fcp)),gap:median(a.map(x=>x.afterTTFB)),
    clsMax:Math.max(0,...a.map(x=>x.cls)),cssRequests:a.map(x=>x.cssRequests),
    cssStart:median(a.map(x=>x.cssStart)),cssFinish:median(a.map(x=>x.cssFinish)),
    jsErrors:a.reduce((s,x)=>s+(x.errors?.length||0),0),
    geometry:a.map(x=>[x.sliderHeight,x.introY])};
  }
  const control=new Map(samples.filter(x=>x.variant==='control').map(x=>[x.cycle,x]));
  const deltas=samples.filter(x=>x.variant==='preload'&&control.has(x.cycle))
      .map(x=>x.afterTTFB-control.get(x.cycle).afterTTFB);
  const summary={mode:MODE,width:WIDTH,cycles:CYCLES,by,pairedGapDeltas:deltas,
    pairedMedian:median(deltas)};
  console.log('STATS '+JSON.stringify(summary));
  fs.writeFileSync(OUT+'/summary-'+MODE+'-'+WIDTH+'.json',JSON.stringify(summary,null,2));
 }finally{await browser.close()}
}
main().catch(e=>{console.error('FATAL',e.stack||e);process.exitCode=1});