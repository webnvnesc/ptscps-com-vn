'use strict';
/** Live checks for Elementor icon+frontend two->one, and established bundles. */
const {chromium}=require('playwright');
const fs=require('node:fs');
const host='https://ptscps.com.vn';
const pages=['/','/e','/lien-he','/dich-vu','/thu-ngo.htm','/tin-tuc'];
const modes=[{name:'mobile',width:412,height:850,isMobile:true},{name:'desktop',width:1440,height:900,isMobile:false}];
(async()=>{
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
const rows=[];
try{
 for(const mode of modes)for(const route of pages){
  const ctx=await browser.newContext({viewport:{width:mode.width,height:mode.height},isMobile:mode.isMobile,hasTouch:mode.isMobile,deviceScaleFactor:1,serviceWorkers:'block'});
  const page=await ctx.newPage(),errs=[],responses=[];
  page.on('pageerror',e=>errs.push(String(e.message).slice(0,180)));
  page.on('requestfailed',req=>{if(/\.(css|js|woff2?)(?:\?|$)/i.test(req.url()))errs.push(req.url().slice(0,120)+' '+req.failure()?.errorText)});
  page.on('response',res=>{if(res.url().includes('ptscps-elementor-icons-frontend-20261118-v1.css'))
   responses.push({url:res.url(),status:res.status(),mime:res.headers()['content-type']||''})});
  const row={device:mode.name,route,errors:errs};
  try{
   const response=await page.goto(host+route,{waitUntil:'domcontentloaded',timeout:85000});
   await page.waitForTimeout(route==='/'?2800:900);
   const data=await page.evaluate(()=>{
    const link=document.querySelector('#ptscps-elementor-icons-frontend-css');
    const qs=s=>document.querySelector(s);
    const rect=s=>{const r=qs(s)?.getBoundingClientRect();return r?{w:Math.round(r.width),h:Math.round(r.height)}:null};
    const icon=qs('[class*="eicon-"],.elementor-icon i');
    const pseudo=icon?getComputedStyle(icon,'::before'):null;
    return {
     bundled:!!link,loaded:link?.sheet!==null,href:link?.href||null,
     originalIcons:!!qs('#elementor-icons-css'),originalFrontend:!!qs('#elementor-frontend-css'),
     bundleHome:!!qs('#ptscps-elementor-home-widgets-css'),
     jannah:!!qs('#ptscps-jannah-core6-css'),
     header:rect('#theme-header'),logo:rect('#theme-header .tie-logo-img-default'),
     hero:rect('#SR7_1_1'),customer:document.querySelectorAll('.elementor-element-ed1c7da .swiper-slide').length,
     icon:icon?{className:String(icon.className).slice(0,100),content:pseudo?.content,font:pseudo?.fontFamily}:null,
     docWidth:document.documentElement.scrollWidth,width:innerWidth
    };
   });
   const wantsBundle=route!='/tin-tuc';
   row.http=response.status();row.data=data;row.cssResponses=responses;
   row.checks={
     document200:row.http===200,
     cssApplied:wantsBundle?data.bundled&&data.loaded&&responses.length===1&&responses[0].status===200:!data.bundled,
     noOriginal:wantsBundle?!data.originalIcons&&!data.originalFrontend:true,
     jannahRetained:data.jannah,
     existingHomeBundle:route!=='/'||data.bundleHome,
     header:data.header?.h>60,logo:data.logo?.w>70&&data.logo.w<400&&data.logo.h>20,
     hero:route!=='/'||data.hero?.h>170,
     carousel:route!=='/'||data.customer>=2,
     noOverflow:data.docWidth<=data.width+4,
     noErrors:errs.length===0
   };
   row.passed=Object.values(row.checks).every(Boolean);
   console.log('EIF_QA_CASE '+JSON.stringify({device:row.device,route,passed:row.passed,checks:row.checks,info:data,errs}).slice(0,2800));
  }catch(e){row.passed=false;row.error=String(e.stack||e).slice(0,900);
   console.log('EIF_QA_ERROR '+JSON.stringify({device:row.device,route,error:row.error}));}
  rows.push(row);
  await ctx.close();
 }
}finally{await browser.close()}
const summary={passed:rows.filter(x=>x.passed).length,total:rows.length,errors:rows.filter(x=>!x.passed).map(x=>({route:x.route,device:x.device,checks:x.checks,error:x.error}))};
fs.writeFileSync('ptscps-eif-production-qa.json',JSON.stringify({summary,rows},null,2));
console.log('EIF_QA_SUMMARY '+JSON.stringify(summary));
if(summary.passed!==summary.total)process.exitCode=1;
})().catch(e=>{console.error('EIF_QA_FATAL '+String(e.stack||e));process.exitCode=1});
