'use strict';
const {chromium}=require('playwright');
const BASE='https://ptscps.com.vn';
const PATHS=['/','/c/co-dong','/lien-he'];
const CASES=[
 {name:'desktop-1x',width:1440,dpr:1,mobile:false},
 {name:'desktop-retina',width:1440,dpr:2,mobile:false},
 {name:'mobile-retina',width:412,dpr:2,mobile:true}
];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 const results=[];
 try{
  for(const device of CASES){
   for(const path of PATHS){
    const ctx=await browser.newContext({
     viewport:{width:device.width,height:900},deviceScaleFactor:device.dpr,
     isMobile:device.mobile,hasTouch:device.mobile,serviceWorkers:'block',
     userAgent:device.mobile?
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
    });
    const page=await ctx.newPage(),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message.slice(0,180)));
    page.on('response',r=>{
     if(/\/2024\/08\/logo-2024(?:-|\.jpg)/.test(r.url()))
      requests.push({image:r.url().split('/').pop(),status:r.status()});
    });
    let record={name:device.name,path};
    try{
     const resp=await page.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:70000});
     await page.locator('img.tie-logo-img-default').first().evaluate(img=>img.decode().catch(()=>{}));
     const state=await page.evaluate(()=>{
      const logo=document.querySelector('img.tie-logo-img-default');
      const r=logo?.getBoundingClientRect();
      return {
       picture:logo?.parentElement?.tagName,
       sourceSrcset:logo?.parentElement?.querySelector('source.tie-logo-source-default')?.getAttribute('srcset'),
       sourceSizes:logo?.parentElement?.querySelector('source.tie-logo-source-default')?.getAttribute('sizes'),
       html:logo?.outerHTML.slice(0,1250),
       src:logo?.getAttribute('src'),
       srcset:logo?.getAttribute('srcset'),
       sizes:logo?.getAttribute('sizes'),
       currentSrc:logo?.currentSrc,
       naturalWidth:logo?.naturalWidth,
       naturalHeight:logo?.naturalHeight,
       rendered:r?[Math.round(r.width),Math.round(r.height)]:null,
       header:!!document.querySelector('#theme-header'),
       guard:!!document.querySelector('#ptscps-header-logo-safety-css'),
       mode:document.body.classList.contains('is-mobile')?'mobile':document.body.classList.contains('is-desktop')?'desktop':'unknown',
       slider:document.querySelectorAll('sr7-module,rs-module').length
      };
     });
     const logoExpected=device.mobile?[160,54]:[295,99];
     const chosen=(state.currentSrc||'').split('/').pop();
     const usedExpected=['logo-2024-320x107-ptscps.jpg','logo-2024-640x214-ptscps.jpg','logo-2024-1024x343.jpg'].includes(chosen);
     const srcsetAll=state.srcset?.includes('320w')&&state.srcset.includes('640w')&&state.srcset.includes('1024w');
     const safeOriginal=!requests.some(x=>x.image==='logo-2024.jpg');
     const sourceResponsive=state.sourceSrcset?.includes('320w')&&state.sourceSrcset?.includes('640w')&&state.sourceSrcset?.includes('1024w')&&state.sourceSizes==='(max-width: 767px) 160px, 295px';
     const passed=resp.status()===200&&state.guard&&state.header&&state.picture==='PICTURE'&&
       state.sizes==='(max-width: 767px) 160px, 295px'&&srcsetAll&&sourceResponsive&&usedExpected&&
       state.naturalWidth>0&&
       state.rendered[0]>0&&state.rendered[0]<=logoExpected[0]+2&&
       state.rendered[1]>0&&state.rendered[1]<=logoExpected[1]+2&&
       state.mode===(device.mobile?'mobile':'desktop')&&safeOriginal&&!errors.length&&
       requests.every(x=>x.status===200);
     record={...record,http:resp.status(),state:{...state,html:undefined},requests,errors,passed};
    }catch(e){
     record={...record,error:String(e.message||e).slice(0,350),errors,requests,passed:false};
    }
    results.push(record);
    console.log('RESPONSIVE_LOGO_QA '+JSON.stringify(record));
    await ctx.close();
   }
  }
 }finally{await browser.close();}
 console.log('RESPONSIVE_LOGO_SUMMARY '+JSON.stringify({
   cases:results.length,passed:results.filter(x=>x.passed).length,
   failed:results.filter(x=>!x.passed).map(x=>({device:x.name,path:x.path,error:x.error,requests:x.requests,state:x.state}))
 }).slice(0,12000));
 if(results.some(x=>!x.passed))process.exitCode=1;
})().catch(e=>{console.error('RESPONSIVE_LOGO_FATAL '+String(e.stack||e));process.exitCode=1});
