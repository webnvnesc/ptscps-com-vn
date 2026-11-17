'use strict';
/** Strict production QA for Jannah core 6 CSS trial. No site mutation. */
const {chromium}=require('playwright');
const fs=require('node:fs');
const base='https://ptscps.com.vn';
const urls=['/','/lien-he','/dich-vu','/thu-ngo.htm','/e'];
const devices=[
 {label:'mobile',width:412,height:850,mobile:true},
 {label:'desktop',width:1440,height:900,mobile:false}
];
const handles=[
 'tie-css-base-css','tie-css-styles-css','tie-css-widgets-css',
 'tie-css-helpers-css','tie-fontawesome5-css','tie-css-ilightbox-css'
];
(async()=>{
 const b=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const outcomes=[];
 try{
  for(const device of devices)for(const path of urls){
   const ctx=await b.newContext({
    viewport:{width:device.width,height:device.height},
    isMobile:device.mobile,hasTouch:device.mobile,
    deviceScaleFactor:1,serviceWorkers:'block'
   });
   const page=await ctx.newPage();
   const errors=[],failed=[],bundleResponses=[],unstyled=[];
   page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,250)));
   page.on('requestfailed',r=>failed.push({url:r.url().slice(0,160),error:r.failure()?.errorText}));
   page.on('response',r=>{
    if(r.url().includes('/ptscps-jannah-core6-20261117-v1.css')){
     bundleResponses.push({status:r.status(),mime:r.headers()['content-type']||'',size:r.headers()['content-length']||null});
    }
   });
   const out={device:device.label,path};
   try{
    const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:70000});
    await page.waitForTimeout(path==='/'?2500:950);
    const obj=await page.evaluate(handles=>{
     const bounds=sel=>{
      const el=document.querySelector(sel);
      const r=el?.getBoundingClientRect();
      return r?{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}:null;
     };
     const links=[...document.querySelectorAll('link[rel~="stylesheet"]')];
     const css=links.filter(el=>el.href.includes('ptscps-jannah-core6-20261117-v1.css'))
       .map(el=>({id:el.id,href:el.href,media:el.media,loaded:el.sheet!==null}));
     const logo=document.querySelector('#theme-header .tie-logo-img-default');
     const search=document.querySelector('#theme-header form.searchform')||
       document.querySelector('#theme-header input[name="s"]');
     const hero=document.querySelector('sr7-module#SR7_1_1');
     const logoComputed=logo?getComputedStyle(logo):null;
     const icon=document.querySelector('.elementor-element-ed1c7da .elementor-swiper-button i.eicon-chevron-right');
     const iconComputed=icon?getComputedStyle(icon,'::before'):null;
     return {
      presentIds:handles.filter(x=>!!document.getElementById(x)),
      core6:css,marker:document.querySelector('meta[name="ptscps-core6-trial"]')?.content||null,
      docWidth:document.documentElement.scrollWidth,innerWidth:innerWidth,
      header:bounds('#theme-header'),logo:bounds('#theme-header .tie-logo-img-default'),
      logoMaxHeight:logoComputed?.maxHeight,search:search?bounds('#theme-header form.searchform')||bounds('#theme-header input[name="s"]'):null,
      hero:bounds('sr7-module#SR7_1_1'),heroSlides:hero?.querySelectorAll('sr7-slide').length||0,
      customerSlides:document.querySelectorAll('.elementor-element-ed1c7da .swiper-slide').length,
      svgMask:iconComputed?.webkitMaskImage||iconComputed?.maskImage||null,
      styleSheets:document.styleSheets.length,
      font:getComputedStyle(document.body).fontFamily
     };
    },handles);
    out.http=response.status();
    out.dom=obj;
    out.errors=errors;
    out.failed=failed.filter(x=>/\.css|\.js|ruby-banner|exo/i.test(x.url)).slice(0,12);
    out.bundleResponses=bundleResponses;
    const home=path==='/';
    const hasBundle=obj.core6.length===1&&obj.core6[0].loaded&&
      obj.core6[0].id==='ptscps-jannah-core6-css'&&obj.core6[0].href.includes('?v=');
    const removedAll=obj.presentIds.length===0;
    const allOriginal=obj.presentIds.length===6;
    const mode=(hasBundle&&removedAll)?'bundle':(!hasBundle&&allOriginal?'fallback':'invalid');
    out.mode=mode;
    out.checks={
     html200:response.status()===200,
     cssMode:mode!=='invalid',
     noJSerrors:errors.length===0,
     noCSSJSFailed:out.failed.length===0,
     noHorizontalOverflow:obj.docWidth<=device.width+4,
     headerPresent:!!obj.header&&obj.header.h>60,
     logoNormal:!!obj.logo&&obj.logo.w>70&&obj.logo.w<400&&obj.logo.h>20&&obj.logo.h<135,
     sliderPreserved:!home||!!obj.hero&&obj.hero.h>170&&obj.heroSlides>=3,
     customerPreserved:!home||obj.customerSlides>=2,
     arrowPreserved:!home||!!obj.svgMask?.includes('data:image/svg+xml'),
     cssDelivered:!hasBundle||(bundleResponses.length>=1&&bundleResponses.every(x=>x.status===200&&/text\/css/.test(x.mime)))
    };
    out.pass=Object.values(out.checks).every(Boolean);
    console.log('CORE6_QA_CASE '+JSON.stringify({device:device.label,path,http:out.http,mode,checks:out.checks,
      logo:obj.logo,hero:obj.hero,bundleResponses:out.bundleResponses,errors:out.errors,failed:out.failed}).slice(0,3400));
   }catch(e){
    out.pass=false;out.error=String(e.stack||e).slice(0,850);
    console.log('CORE6_QA_ERROR '+JSON.stringify({device:device.label,path,error:out.error}));
   }
   outcomes.push(out);
   await ctx.close();
  }
 }finally{await b.close()}
 const home=outcomes.filter(x=>x.path==='/');
 const summary={
   passed:outcomes.filter(x=>x.pass).length,
   total:outcomes.length,
   homepageBundle:home.filter(x=>x.mode==='bundle').length,
   bundleCases:outcomes.filter(x=>x.mode==='bundle').length,
   fallbackCases:outcomes.filter(x=>x.mode==='fallback').length,
   errors:outcomes.filter(x=>!x.pass).map(x=>({
     path:x.path,device:x.device,error:x.error,checks:x.checks,mode:x.mode
   }))
 };
 fs.writeFileSync('ptscps-core6-live-qa.json',JSON.stringify({summary,outcomes},null,2));
 console.log('CORE6_QA_SUMMARY '+JSON.stringify(summary));
 if(summary.passed!==summary.total||summary.homepageBundle!==2)process.exitCode=1;
})().catch(e=>{console.error('CORE6_QA_FATAL '+String(e.stack||e));process.exitCode=1});
