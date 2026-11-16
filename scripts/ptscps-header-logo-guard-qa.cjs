'use strict';
const {chromium}=require('playwright');
const ROOT='https://ptscps.com.vn/';
async function main(){
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 let failures=0;
 try{
  for(const width of [412,1440]){
   for(const block of [false,true]){
    const ctx=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,isMobile:width===412,hasTouch:width===412,serviceWorkers:'block'});
    const page=await ctx.newPage(),failedCSS=[];
    if(block){
     await page.route('**/*',async route=>{
      const u=route.request().url();
      if(/\/themes\/jannah\/assets\/css\//.test(u)){failedCSS.push(u.split('?')[0]);return route.abort('failed');}
      return route.continue();
     });
    }
    try{
     const r=await page.goto(ROOT+'?logo_guard_check=1',{waitUntil:'domcontentloaded',timeout:80000});
     await page.waitForTimeout(900);
     const values=await page.evaluate(()=>{
      const img=document.querySelector('#theme-header img.tie-logo-img-default');
      const b=img?.getBoundingClientRect();
      const css=document.getElementById('ptscps-header-logo-safety-css');
      const nav=document.querySelector('#main-nav, #main-nav-wrap, .main-nav');
      const slider=document.querySelector('sr7-module,rs-module');
      return {guard:!!css,logo:b?[Math.round(b.width),Math.round(b.height)]:null,
       nav:!!nav,slider:!!slider,
       css:css?.textContent?.slice(0,340)||null};
     });
     const max=width===412?[160,54]:[295,99];
     const passed=r.status()===200&&values.guard&&values.logo&&
      values.logo[0]>0&&values.logo[0]<=max[0]+2&&
      values.logo[1]>0&&values.logo[1]<=max[1]+2&&
      values.slider&&(!block||failedCSS.length>0);
     console.log('LOGO_GUARD_QA '+JSON.stringify({width,block,http:r.status(),failedCSS:failedCSS.length,values,passed}));
     if(!passed)failures++;
    }catch(e){failures++;console.log('LOGO_GUARD_QA_ERROR '+JSON.stringify({width,block,error:String(e).slice(0,300)}));}
    await ctx.close();
   }
  }
 }finally{await browser.close();}
 console.log('LOGO_GUARD_SUMMARY '+JSON.stringify({cases:4,passed:4-failures,failed:failures}));
 if(failures)process.exitCode=1;
}
main().catch(e=>{console.error('LOGO_GUARD_FATAL '+String(e.stack||e));process.exitCode=1;});
