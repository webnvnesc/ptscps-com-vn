'use strict';
/** Verify production WebP negotiation within real Chromium (no site writes). */
const {chromium}=require('playwright');
const fs=require('node:fs');
const URL='https://ptscps.com.vn/';
const OUT='ptscps-webp-banner-live-qa';
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
 const b=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 try{
  for(const size of [{name:'mobile',w:412,h:850},{name:'desktop',w:1440,h:900}]){
   const c=await b.newContext({viewport:{width:size.w,height:size.h},
    isMobile:size.w<768,hasTouch:size.w<768,serviceWorkers:'block'});
   const p=await c.newPage(),errors=[],imageResponses=[];
   p.on('pageerror',e=>errors.push(String(e.message).slice(0,130)));
   p.on('response',r=>{
    const x=r.url().split('?')[0];
    if(/\/2019\/10\/(?:ruby-banner|banner2|banner3)\.jpg$/.test(x)){
      imageResponses.push({file:x.split('/').at(-1),status:r.status(),
       contentType:r.headers()['content-type']||null,
       vary:r.headers().vary||null});
    }
   });
   await p.addInitScript(()=>{
    window.__shifts=[];
    try{new PerformanceObserver(l=>l.getEntries().forEach(e=>{
      if(!e.hadRecentInput)window.__shifts.push(e.value);
    })).observe({type:'layout-shift',buffered:true});}catch{}
   });
   const res=await p.goto(URL,{waitUntil:'domcontentloaded',timeout:70000});
   await p.waitForTimeout(3400);
   const state=await p.evaluate(()=>{
    const m=document.querySelector('sr7-module#SR7_1_1');
    const r=m?.getBoundingClientRect();
    return {
      nativeFirstPoster:m?.getAttribute('data-ptscps-poster')||null,
      computedBg:m?getComputedStyle(m).backgroundImage:null,
      width:r?.width||0,height:r?.height||0,
      firstSlideCount:m?.querySelectorAll('sr7-slide').length||0,
      canvasCount:m?.querySelectorAll('canvas[data-use-for="BGContentImage"]').length||0,
      preload:[...document.querySelectorAll('link[data-ptscps-sr7-first-preload]')].map(x=>x.href),
      scrollWidth:document.documentElement.scrollWidth,
      cls:window.__shifts.reduce((sum,x)=>sum+x,0),
      imageDimCount:[...document.querySelectorAll('.elementor-element-1be3f74 img.swiper-slide-image')].filter(x=>x.getAttribute('width')&&x.getAttribute('height')).length,
      imageTotal:document.querySelectorAll('.elementor-element-1be3f74 img.swiper-slide-image').length};
   });
   await p.screenshot({path:OUT+'/'+size.name+'.png',fullPage:false,animations:'disabled'});
   const found=imageResponses.filter(x=>x.file==='ruby-banner.jpg');
   const first=found[0];
   const result={device:size.name,http:res.status(),first,allBannerResponses:imageResponses,
     firstPoster:state.nativeFirstPoster?new URL(state.nativeFirstPoster).pathname:null,
     preload:state.preload.map(x=>new URL(x).pathname),
     heroSize:[Math.round(state.width),Math.round(state.height)],
     slides:state.firstSlideCount,canvas:state.canvasCount,
     cls:state.cls,errors,carouselDimensions:state.imageDimCount+'/'+state.imageTotal,
     scrollWidth:state.scrollWidth};
   console.log('WEBP_BROWSER_QA '+JSON.stringify(result).slice(0,10000));
   fs.writeFileSync(OUT+'/'+size.name+'.json',JSON.stringify(result,null,2));
   if(res.status()!==200||!first||first.status!==200||!/^image\/webp/.test(first.contentType||'')||
      !state.nativeFirstPoster?.endsWith('/ruby-banner.jpg') ||
      !state.preload.some(x=>x.endsWith('/ruby-banner.jpg'))||
      state.firstSlideCount<3||state.width<360||state.height<180||
      state.scrollWidth>size.w+3||state.cls>0.04||state.imageDimCount<18||errors.length){
     throw Error('Regression or image MIME mismatch on '+size.name);
   }
   await c.close();
  }
  console.log('WEBP_BROWSER_QA_SUCCESS');
 }finally{await b.close()}
})().catch(e=>{console.error('WEBP_BROWSER_QA_FAILED '+String(e.stack||e));process.exitCode=1});
