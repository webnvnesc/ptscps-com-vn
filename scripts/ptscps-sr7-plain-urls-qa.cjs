'use strict';
// Plain URL cache/HTML verification, read-only, first-visit anonymous.
const {chromium}=require('playwright');
const paths=['/','/tin-tuc','/lien-he','/dich-vu'];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 let passed=0,failed=[];
 try{
  for(const width of [412,1440])for(const path of paths){
   const ctx=await browser.newContext({viewport:{width,height:width===412?823:900},
    deviceScaleFactor:width===412?2:1,isMobile:width===412,hasTouch:width===412,serviceWorkers:'block'});
   const page=await ctx.newPage(),sr7=[],errors=[];
   page.on('response',r=>{if(/\/revslider\/public\/js\/(?:sr7\.js|libs\/tptools\.js)/.test(r.url()))sr7.push(r.status());});
   page.on('pageerror',e=>errors.push(String(e.message).slice(0,160)));
   let row={width,path};
   try{
    const res=await page.goto('https://ptscps.com.vn'+path,{waitUntil:'domcontentloaded',timeout:75000});
    await page.waitForTimeout(1800);
    const dom=await page.evaluate(()=>({
     scripts:[...document.querySelectorAll('script[src]')].filter(x=>
      /\/revslider\/public\/js\/(?:sr7\.js|libs\/tptools\.js)/.test(x.src)).length,
     slides:document.querySelectorAll('sr7-module,rs-module').length,
     elementor:document.querySelectorAll('.elementor-widget').length,
     logo:!!document.querySelector('img.tie-logo-img-default')
    }));
    const expected=path==='/'?2:0;
    row={...row,http:res.status(),scriptRequests:sr7.length,dom,errors,
      passed:res.status()===200&&sr7.length===expected&&dom.scripts===expected&&
       (path==='/'?dom.slides>=1:dom.slides===0)&&dom.elementor>0&&dom.logo&&!errors.length};
   }catch(e){row.error=String(e.message||e).slice(0,260);row.passed=false}
   console.log('SR7_PLAIN '+JSON.stringify(row));
   if(row.passed)passed++;else failed.push(row);
   await ctx.close();
  }
 }finally{await browser.close()}
 console.log('SR7_PLAIN_SUMMARY '+JSON.stringify({passed,total:8,failures:failed}));
 if(failed.length)process.exitCode=1;
})().catch(e=>{console.error('SR7_PLAIN_FATAL '+String(e.stack||e));process.exitCode=1});
