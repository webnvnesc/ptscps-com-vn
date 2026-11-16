'use strict';
const {chromium}=require('playwright');
const base='https://ptscps.com.vn';
const paths=['/','/tin-tuc','/lien-he','/dich-vu'];
const widths=[412,1440];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 const results=[];
 try{
  for(const width of widths)for(const path of paths){
   const ctx=await browser.newContext({
    viewport:{width,height:width===412?823:900},deviceScaleFactor:width===412?2:1,
    hasTouch:width===412,isMobile:width===412,serviceWorkers:'block'
   });
   const page=await ctx.newPage();
   const errors=[],requests=[],api=[];
   page.on('pageerror',e=>errors.push(String(e.message).slice(0,230)));
   page.on('response',r=>{
    const u=r.url();
    if(/\/revslider\/public\/js\/(?:sr7\.js|libs\/tptools\.js)/.test(u))requests.push({path:new URL(u).pathname,http:r.status()});
    if(/\/wp-json\/sliderrevolution\/sliders\//.test(u))api.push({http:r.status(),profile:r.headers()['x-ptscps-sr7-plugin-profile']||null});
   });
   let o={width,path};
   try{
    const response=await page.goto(base+path+'?ptscps_sr7_live_qa=1',{waitUntil:'domcontentloaded',timeout:75000});
    await page.waitForTimeout(3100);
    const state=await page.evaluate(()=>{
     const rect=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();
      return [b.x,b.y,b.width,b.height].map(Math.round)};
     const scripts=[...document.querySelectorAll('script[src]')]
       .filter(s=>/\/revslider\/public\/js\/(?:sr7\.js|libs\/tptools\.js)/.test(s.src))
       .map(s=>new URL(s.src).pathname);
     return {scriptTags:scripts,slides:document.querySelectorAll('sr7-module,rs-module').length,
      logo:rect('img.tie-logo-img-default'),header:rect('#theme-header'),
      elementorWidgets:document.querySelectorAll('.elementor-widget').length,
      jquery:typeof window.jQuery,searchInput:!!document.querySelector('input[name=s]'),
      forms:document.forms.length};
    });
    const expectedScripts=path==='/'?2:0;
    const expectedSlides=path==='/'?1:0;
    o={...o,http:response.status(),profile:response.headers()['x-ptscps-sr7-js-gate']||null,
      requests,api,state,errors,passed:
       response.status()===200&&requests.length===expectedScripts&&
       state.scriptTags.length===expectedScripts&&state.slides===expectedSlides&&
       state.logo!==null&&state.header!==null&&state.elementorWidgets>0&&
       state.jquery==='function'&&state.searchInput&&!errors.length&&
       api.every(r=>r.http===200)};
   }catch(e){o.error=String(e.message||e).slice(0,330);o.passed=false}
   results.push(o);
   console.log('SR7_LIVE_QA '+JSON.stringify(o).slice(0,11500));
   await ctx.close();
  }
 }finally{await browser.close()}
 console.log('SR7_LIVE_SUMMARY '+JSON.stringify({pages:results.length,
  passed:results.filter(x=>x.passed).length,
  failed:results.filter(x=>!x.passed).map(x=>({path:x.path,width:x.width,error:x.error,profile:x.profile,requests:x.requests?.length}))}));
 if(results.some(x=>!x.passed))process.exitCode=1;
})().catch(e=>{console.error('SR7_LIVE_QA_FATAL '+String(e.stack||e));process.exitCode=1});
