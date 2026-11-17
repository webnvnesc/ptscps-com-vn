'use strict';
/** Real production smoke: homepage 10->1 widget CSS and preserved Jannah core6.
 * No mutations; test mobile desktop / and representative other pages. */
const fs=require('node:fs');
const {chromium}=require('playwright');
const URL='https://ptscps.com.vn';
const paths=['/','/e','/lien-he','/dich-vu'];
const devices=[{name:'mobile',width:412,height:850,mobile:true},
 {name:'desktop',width:1440,height:900,mobile:false}];
const handles=[
 'widget-image-css','widget-image-box-css','widget-heading-css',
 'widget-spacer-css','widget-divider-css','widget-posts-css',
 'e-motion-fx-css','swiper-css','e-swiper-css','widget-image-carousel-css'
];
(async()=>{
 const b=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const records=[];
 try{
  for(const device of devices)for(const pathname of paths){
   const context=await b.newContext({viewport:{width:device.width,height:device.height},
     isMobile:device.mobile,hasTouch:device.mobile,deviceScaleFactor:1,serviceWorkers:'block'});
   const page=await context.newPage();
   const problems=[],css=[];
   page.on('pageerror',e=>problems.push(String(e.message||e).slice(0,200)));
   page.on('requestfailed',req=>{
     if(/\.(css|js)(?:\?|$)/i.test(req.url()))problems.push(req.url().slice(0,140)+' '+req.failure()?.errorText);
   });
   page.on('response',res=>{
     if(/ptscps-elementor-home-widgets-20261117-v1\.css/.test(res.url()))
       css.push({status:res.status(),mime:res.headers()['content-type']||'',url:res.url()});
   });
   const output={path:pathname,device:device.name};
   try{
    const response=await page.goto(URL+pathname,{waitUntil:'domcontentloaded',timeout:76000});
    await page.waitForTimeout(pathname==='/'?2500:900);
    const info=await page.evaluate(ids=>{
      const box=sel=>{
       const el=document.querySelector(sel),r=el?.getBoundingClientRect();
       return r?{w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.y)}:null;
      };
      const links=[...document.querySelectorAll('link[rel~="stylesheet"]')];
      const active=links.filter(x=>x.href.includes('ptscps-elementor-home-widgets-20261117-v1.css'));
      return {
       ehw:active.map(x=>({id:x.id,loaded:x.sheet!==null,href:x.href})),
       originals:ids.filter(x=>!!document.getElementById(x)),
       jannahCore6:links.filter(x=>x.id==='ptscps-jannah-core6-css').length,
       mark:document.querySelector('meta[name="ptscps-elementor-home-widgets-trial"]')?.content||null,
       width:document.documentElement.scrollWidth,inner:innerWidth,
       logo:box('#theme-header .tie-logo-img-default'),header:box('#theme-header'),
       hero:box('sr7-module#SR7_1_1'),
       slides:document.querySelectorAll('sr7-module#SR7_1_1 sr7-slide').length,
       customer:document.querySelectorAll('.elementor-element-ed1c7da .swiper-slide').length,
       nav:box('.elementor-element-ed1c7da .elementor-swiper-button-next'),
       bodyText:document.body?.innerText?.length||0
      };
    },handles);
    const home=pathname==='/';
    output.http=response.status();
    output.info=info;output.problems=problems;output.bundleResponses=css;
    output.checks={
     html:output.http===200,
     homeBundle:!home||info.ehw.length===1&&info.ehw[0].loaded&&info.ehw[0].id==='ptscps-elementor-home-widgets-css',
     homeOriginalGone:!home||info.originals.length===0,
     otherUnchanged:home||info.ehw.length===0,
     jannahUntouched:info.jannahCore6===1,
     width:info.width<=info.inner+4,
     logo:info.logo?.w>70&&info.logo.w<400&&info.logo.h>20,
     header:info.header?.h>60,
     hero:!home||info.hero?.h>170&&info.slides>=3,
     customers:!home||info.customer>=2,
     cssHTTP:!home||css.length>0&&css.every(x=>x.status===200&&/text\/css/.test(x.mime)),
     scriptErrors:problems.length===0,
     body:info.bodyText>200
    };
    output.ok=Object.values(output.checks).every(Boolean);
    console.log('EHW_QA_CASE '+JSON.stringify({device:device.name,path:pathname,
      ok:output.ok,checks:output.checks,css,info,problems}).slice(0,3800));
   }catch(e){
    output.ok=false;output.error=String(e.stack||e).slice(0,850);
    console.log('EHW_QA_ERROR '+JSON.stringify({device:device.name,path:pathname,error:output.error}));
   }
   records.push(output);
   await context.close();
  }
 }finally{await b.close()}
 const summary={passed:records.filter(x=>x.ok).length,total:records.length,
  homepageBundled:records.filter(x=>x.path==='/'&&x.ok).length,
  nonHomeUntouched:records.filter(x=>x.path!=='/'&&x.ok).length,
  failures:records.filter(x=>!x.ok).map(x=>({device:x.device,path:x.path,checks:x.checks,error:x.error}))};
 fs.writeFileSync('ptscps-ehw-production-qa.json',JSON.stringify({summary,records},null,2));
 console.log('EHW_QA_SUMMARY '+JSON.stringify(summary));
 if(summary.passed!==summary.total||summary.homepageBundled!==2)process.exitCode=1;
})().catch(e=>{console.error('EHW_QA_FATAL '+String(e.stack||e));process.exitCode=1});
