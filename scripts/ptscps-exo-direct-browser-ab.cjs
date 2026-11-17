'use strict';
const {chromium}=require('playwright');
const ROOT='https://ptscps.com.vn/';
const LINK='<link id="ptscps-exo-direct-test" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo:ital,wght@0,400;0,500;0,700;1,400;1,700&display=swap">';
const replacement=/<script>\s*WebFontConfig\s*=\s*\{[\s\S]*?wf\.src\s*=\s*['"]\/\/ajax\.googleapis\.com\/ajax\/libs\/webfont\/1\/webfont\.js['"];[\s\S]*?\}\)\(\);\s*<\/script>/i;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 const records=[];
 try{
  for(const cfg of [{name:'desktop',width:1440},{name:'mobile',width:412}]){
   for(const mode of ['original','direct']){
    const mobile=cfg.width===412;
    const ctx=await browser.newContext({viewport:{width:cfg.width,height:850},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
    const page=await ctx.newPage(),errors=[],requests=[];
    await page.addInitScript(()=>{window.__shifts=[];try{new PerformanceObserver(list=>list.getEntries().forEach(x=>{if(!x.hadRecentInput)window.__shifts.push(x.value)})).observe({type:'layout-shift',buffered:true})}catch{}});
    let replaced=false;
    page.on('pageerror',e=>errors.push(e.message.slice(0,220)));
    page.on('request',r=>{if(/webfont\.js|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(r.url()))requests.push(r.url().split('?')[0])});
    if(mode==='direct')await page.route(ROOT,async route=>{
      const res=await route.fetch();let html=await res.text();
      replaced=replacement.test(html);
      if(replaced){
       html=html.replace(replacement,'').replace(/<head\b[^>]*>/i,m=>m+LINK);
       html=html.replace(/<html\b([^>]*)>/i,(m,attrs)=>'<html'+attrs+' class="wf-active">');
      }
      await route.fulfill({response:res,body:html,headers:{...res.headers(),'content-length':String(Buffer.byteLength(html))}});
    });
    let result;
    try{
     const r=await page.goto(ROOT,{waitUntil:'domcontentloaded',timeout:65000});
     await page.waitForTimeout(2300);
     const metrics=await page.evaluate(()=>{
      const n=performance.getEntriesByType('navigation')[0];
      const item=selector=>{const e=document.querySelector(selector);if(!e)return null;const box=e.getBoundingClientRect(),c=getComputedStyle(e);return {font:c.fontFamily,width:Math.round(box.width),height:Math.round(box.height)}};
      return {fcp:Math.round(performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint')?.startTime||0),ttfb:Math.round(n.responseStart),cls:window.__shifts.reduce((a,b)=>a+b,0),heading:item('h1,h2'),menu:item('#main-nav .main-menu > ul > li > a'),logo:item('#logo'),fontStatus:document.fonts.status,exo:document.fonts.check('400 16px Exo'),active:document.documentElement.classList.contains('wf-active'),slider:!!document.querySelector('sr7-module,rs-module')};
     });
     result={device:cfg.name,mode,http:r.status(),replaced,metrics,requests,errors};
    }catch(e){result={device:cfg.name,mode,error:String(e).slice(0,250),requests,errors}};
    records.push(result);console.log('EXO_AB '+JSON.stringify(result).slice(0,7000));
    await ctx.close();
   }
  }
 }finally{await browser.close()}
 const compare=['desktop','mobile'].map(device=>{
  const a=records.find(r=>r.device===device&&r.mode==='original'),b=records.find(r=>r.device===device&&r.mode==='direct');
  return {device,found:b.replaced,headFontBefore:a.metrics?.heading?.font,headFontAfter:b.metrics?.heading?.font,
   headingWidthBefore:a.metrics?.heading?.width,headingWidthAfter:b.metrics?.heading?.width,
   fcpBefore:a.metrics?.fcp,fcpAfter:b.metrics?.fcp,clsBefore:a.metrics?.cls,clsAfter:b.metrics?.cls,
   loaderRemoved:!b.requests.some(r=>r.includes('webfont.js')),errors:b.errors};
 });
 console.log('EXO_AB_SUMMARY '+JSON.stringify({compare,success:compare.every(x=>x.found&&x.loaderRemoved&&!x.errors.length)}));
 if(compare.some(x=>!x.found||!x.loaderRemoved||x.errors.length))process.exitCode=1;
})().catch(e=>{console.error('EXO_AB_FATAL '+String(e.stack||e));process.exitCode=1});
