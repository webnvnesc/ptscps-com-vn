'use strict';
const {chromium}=require('playwright');
const fs=require('fs');
const root='https://ptscps.com.vn';
const paths=['/','/thu-ngo.htm','/dich-vu','/lien-he','/e'];
const modes=[{name:'desktop',width:1440,mobile:false},{name:'mobile',width:412,mobile:true}];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions','--no-sandbox']});
 const out=[];
 try{
  for(const device of modes){
   const ctx=await browser.newContext({viewport:{width:device.width,height:device.mobile?850:900},
    deviceScaleFactor:device.mobile?2:1,isMobile:device.mobile,hasTouch:device.mobile,serviceWorkers:'block',
    userAgent:device.mobile?'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'});
   for(const path of paths){
    const page=await ctx.newPage(),loaded=[],errors=[];
    page.on('request',r=>{if(/webfont\.js|ptscps-exo-fonts|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(r.url()))loaded.push(r.url())});
    page.on('pageerror',e=>errors.push(e.message.slice(0,210)));
    const record={device:device.name,path};
    try{
     const resp=await page.goto(root+path,{waitUntil:'domcontentloaded',timeout:70000});
     await page.waitForTimeout(1500);
     await page.evaluate(()=>document.fonts.ready);
     const metrics=await page.evaluate(()=>{
      const samples=sel=>{const e=document.querySelector(sel);if(!e)return null;const s=getComputedStyle(e),r=e.getBoundingClientRect();return {family:s.fontFamily,width:Math.round(r.width),height:Math.round(r.height)}};
      return {htmlClasses:document.documentElement.className,active:document.documentElement.classList.contains('wf-active'),
       docFont:document.fonts.check('400 16px Exo'),
       body:samples('body'),heading:samples('h1,h2'),menu:samples('#main-nav .main-menu > ul > li > a'),
       logo:samples('#logo'),
       slider:document.querySelector('sr7-module,rs-module')!==null,
       fontStyle:[...document.querySelectorAll('link[rel=stylesheet]')].filter(el=>el.href.includes('ptscps-exo-fonts')).map(el=>el.href),
       allScripts:[...document.scripts].filter(el=>el.src.includes('webfont.js')).length,
       fcp:Math.round(performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint')?.startTime||0)
      };
     });
     const good=resp.status()===200&&metrics.active&&metrics.fontStyle.length===1&&
      metrics.heading?.family.includes('Exo')&&metrics.body?.family.includes('Exo')&&
      !metrics.allScripts&&!loaded.some(u=>/webfont\.js|fonts\.googleapis\.com/.test(u))&&
      loaded.some(u=>u.endsWith('exo-direct-v1.css'))&&
      loaded.some(u=>/\.woff2/.test(u))&&
      metrics.logo?.height>0&&metrics.logo?.height<=100&&
      (path!=='/'||metrics.slider)&&!errors.length;
     Object.assign(record,{http:resp.status(),metrics,requests:loaded.map(u=>u.replace(root,'')),errors,pass:good});
    }catch(e){Object.assign(record,{pass:false,error:String(e).slice(0,300),requests:loaded,errors})}
    out.push(record);
    console.log('EXO_PROD_QA '+JSON.stringify(record).slice(0,6500));
    await page.close();
   }
   await ctx.close();
  }
 }finally{await browser.close()}
 const summary={total:out.length,passed:out.filter(x=>x.pass).length,
  failed:out.filter(x=>!x.pass).map(x=>({device:x.device,path:x.path,error:x.error,metrics:x.metrics,requests:x.requests,errors:x.errors}))};
 fs.writeFileSync('exo-production-qa.json',JSON.stringify(out,null,2));
 console.log('EXO_PROD_SUMMARY '+JSON.stringify(summary).slice(0,13000));
 if(summary.passed!==summary.total)process.exitCode=1;
})().catch(e=>{console.error('EXO_PROD_FATAL '+String(e.stack||e));process.exitCode=1});
