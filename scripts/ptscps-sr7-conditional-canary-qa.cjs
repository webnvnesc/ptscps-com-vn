'use strict';
const {chromium}=require('playwright');
const ORIGIN='https://ptscps.com.vn';
const paths=['/','/tin-tuc','/lien-he','/dich-vu'];
const widths=[412,1440];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 const outcomes=[];
 try{
  for(const width of widths)for(const path of paths)for(const mode of ['normal','canary']){
   const context=await browser.newContext({viewport:{width,height:width===412?823:900},
     deviceScaleFactor:width===412?2:1,isMobile:width===412,hasTouch:width===412,
     serviceWorkers:'block'});
   const page=await context.newPage();const errors=[],failed=[],sr7requests=[];
   page.on('pageerror',e=>errors.push(String(e.message).slice(0,220)));
   page.on('requestfailed',r=>failed.push({url:r.url().split('?')[0],error:r.failure()?.errorText}));
   page.on('response',r=>{
    if(/\/revslider\/public\/js\/(?:sr7\.js|libs\/tptools\.js)/.test(r.url()))
      sr7requests.push({path:new URL(r.url()).pathname,status:r.status()});
   });
   const url=ORIGIN+path+(mode==='canary'?'?ptscps_sr7_js_probe=1':'');
   let row={width,path,mode};
   try{
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:85000});
    await page.waitForTimeout(3100);
    const state=await page.evaluate(()=>{
     const rect=s=>{const e=document.querySelector(s);if(!e)return null;
      const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round)};
     return {
      slideCount:document.querySelectorAll('sr7-module,rs-module').length,
      jquery:typeof window.jQuery,
      header:rect('#theme-header'),logo:rect('img.tie-logo-img-default'),
      elementor:document.querySelectorAll('.elementor-widget').length,
      search:!!document.querySelector('input[name=s]'),
      form:document.querySelectorAll('form').length,
      scriptTags:[...document.querySelectorAll('script[src]')]
        .filter(x=>/\/revslider\/public\/js\/(?:sr7\.js|libs\/tptools\.js)/.test(x.src))
        .map(x=>new URL(x.src).pathname)
     };
    });
    row={...row,http:response.status(),header:response.headers()['x-ptscps-sr7-js-gate']||null,
      state,sr7requests,errors,otherFailures:failed.slice(0,7)};
   }catch(e){row.error=String(e.message||e).slice(0,450)}
   outcomes.push(row);console.log('SR7_GATE_CHECK '+JSON.stringify(row).slice(0,11000));
   await context.close();
  }
 }finally{await browser.close()}
 for(const width of widths)for(const path of paths){
  const original=outcomes.find(x=>x.width===width&&x.path===path&&x.mode==='normal');
  const test=outcomes.find(x=>x.width===width&&x.path===path&&x.mode==='canary');
  const expected=path==='/'?'preserved':'removed';
  const ok=!original.error&&!test.error&&original.http===200&&test.http===200&&
   test.header===expected&&!test.errors.length&&
   test.state.jquery==='function'&&test.state.elementor>0&&
   test.state.slideCount===original.state.slideCount&&
   (path==='/'?(test.sr7requests.length===2):(test.sr7requests.length===0))&&
   JSON.stringify(test.state.header)===JSON.stringify(original.state.header)&&
   JSON.stringify(test.state.logo)===JSON.stringify(original.state.logo);
  console.log('SR7_GATE_PAIR '+JSON.stringify({width,path,expected,observed:test.header,
   baselineScripts:original.sr7requests.length,canaryScripts:test.sr7requests.length,
   baselineSlideCount:original.state.slideCount,canarySlideCount:test.state.slideCount,
   errorCount:test.errors.length,layoutSame:JSON.stringify(test.state.header)===JSON.stringify(original.state.header),
   passed:ok}));
  if(!ok)process.exitCode=1;
 }
})().catch(e=>{console.error('SR7_GATE_FATAL '+String(e.stack||e));process.exitCode=1});
