'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs');
const base='https://ptscps.com.vn';
const pages=['/tin-tuc','/lien-he','/dich-vu'];
const widths=[412,1440];
const variants=['baseline','block-unneeded-sr7'];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 const outcomes=[];
 try{
  for(const path of pages)for(const width of widths){
   for(const variant of variants){
    const ctx=await browser.newContext({
      viewport:{width,height:width===412?823:900},isMobile:width===412,
      hasTouch:width===412,deviceScaleFactor:width===412?2:1,
      serviceWorkers:'block'
    });
    const page=await ctx.newPage();
    const blocked=[],errors=[],networkErrors=[];
    if(variant==='block-unneeded-sr7'){
     await page.route(/\/wp-content\/plugins\/revslider\/public\/js\/(?:sr7\.js|libs\/tptools\.js)(?:\?|$)/,async route=>{
      blocked.push(route.request().url().split('?')[0]);
      return route.abort('blockedbyclient');
     });
    }
    page.on('pageerror',e=>errors.push(String(e.message).slice(0,230)));
    page.on('requestfailed',req=>{
     if(!/revslider\/public\/js\/(?:sr7\.js|libs\/tptools\.js)/.test(req.url()))
      networkErrors.push({url:req.url().split('?')[0],reason:req.failure()?.errorText});
    });
    await page.addInitScript(()=>{
     window.__shifts=[];
     try{
      new PerformanceObserver(l=>{for(const x of l.getEntries())
       if(!x.hadRecentInput)window.__shifts.push(x.value)}).observe({type:'layout-shift',buffered:true});
     }catch{}
    });
    let result={path,width,variant};
    try{
     const r=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:70000});
     await page.waitForTimeout(3800);
     const info=await page.evaluate(()=>{
      const n=performance.getEntriesByType('navigation')[0];
      const fcp=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint')?.startTime||0;
      const selectors=['sr7-module','.elementor-widget','.tie-logo-img-default','#main-nav','input[name=s]','.elementor-form'];
      const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round)};
      return {ttfb:Math.round(n.responseStart),fcp:Math.round(fcp),cls:window.__shifts.reduce((a,b)=>a+b,0),
       rects:Object.fromEntries(selectors.map(s=>[s,rect(s)])),
       jquery:typeof jQuery,slider:document.querySelectorAll('sr7-module').length,
       elementor:document.querySelectorAll('.elementor-widget').length,
       search:!!document.querySelector('input[name=s]'),
       localScripts:performance.getEntriesByType('resource').filter(x=>
        x.initiatorType==='script'&&x.name.startsWith(location.origin)).length};
     });
     Object.assign(result,info,{http:r.status(),blocked:blocked.length,errors,networkErrors});
    }catch(e){result.error=String(e.message||e).slice(0,400)}
    console.log('SR7_JS_GATE_CASE '+JSON.stringify(result).slice(0,6000));
    outcomes.push(result);
    await ctx.close();
   }
  }
 }finally{await browser.close()}
 for(const path of pages)for(const width of widths){
  const baseline=outcomes.find(r=>r.path===path&&r.width===width&&r.variant==='baseline');
  const blocked=outcomes.find(r=>r.path===path&&r.width===width&&r.variant==='block-unneeded-sr7');
  console.log('SR7_JS_GATE_PAIR '+JSON.stringify({path,width,
   fcpDelta:blocked.fcp-baseline.fcp,ttfbDelta:blocked.ttfb-baseline.ttfb,
   clsDelta:blocked.cls-baseline.cls,blockedScripts:blocked.blocked,
   baselineErrors:baseline.errors,blockedErrors:blocked.errors,
   layoutSame:JSON.stringify(baseline.rects)===JSON.stringify(blocked.rects),
   slider:baseline.slider}));
 }
 fs.writeFileSync('sr7-js-gate-ab.json',JSON.stringify(outcomes,null,2));
 if(outcomes.some(x=>x.error))process.exitCode=1;
})().catch(e=>{console.error('SR7_JS_GATE_FATAL '+String(e.stack||e));process.exitCode=1});
