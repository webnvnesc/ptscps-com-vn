'use strict';
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 const status=[];
 try{
  for(const width of [412,1440]){
   const ctx=await browser.newContext({viewport:{width,height:width===412?823:900},
    isMobile:width===412,hasTouch:width===412,deviceScaleFactor:width===412?2:1});
   const page=await ctx.newPage();
   const errors=[],slideRequests=[];
   page.on('pageerror',e=>errors.push(String(e.message).slice(0,210)));
   page.on('response',r=>{
    if(r.url().includes('/wp-json/sliderrevolution/sliders/')){
      slideRequests.push({status:r.status(),url:r.url().split('?')[0],
       fastpathHeader:r.headers()['x-ptscps-sr7-fastpath']||null,
       slimHeader:r.headers()['x-ptscps-sr7-plugin-profile']||null});
    }
   });
   const resp=await page.goto('https://ptscps.com.vn/',{waitUntil:'domcontentloaded',timeout:75000});
   await page.waitForTimeout(5300);
   const state=await page.evaluate(()=>{
    const r=e=>{if(!e)return null;const x=e.getBoundingClientRect();return [x.x,x.y,x.width,x.height].map(Math.round)};
    return {logo:r(document.querySelector('img.tie-logo-img-default')),
      sliderCount:document.querySelectorAll('sr7-module').length,
      heroImages:document.querySelectorAll('sr7-module img').length,
      hasElementor:document.querySelectorAll('.elementor-widget').length>0,
      searchInput:!!document.querySelector('input[name=s]')};
   });
   const result={width,http:resp.status(),state,slideRequests,errors};
   console.log('SLIM_BROWSER '+JSON.stringify(result).slice(0,9000));
   if(resp.status()!==200||!state.sliderCount||!state.hasElementor||!state.logo||errors.length||
      slideRequests.some(x=>x.status!==200||x.fastpathHeader||x.slimHeader!=='slim')){
    throw new Error('Browser integration regression at '+width);
   }
   status.push(width);
   await ctx.close();
  }
 }finally{await browser.close()}
 console.log('SLIM_BROWSER_SUCCESS '+JSON.stringify({passed:status.length,widths:status}));
})().catch(e=>{console.error('SLIM_BROWSER_ERROR '+(e.stack||e));process.exitCode=1});
