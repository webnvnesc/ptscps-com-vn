'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs');
const ORIGIN='https://ptscps.com.vn';
const OUT='ptscps-customer-dims-qa';
fs.mkdirSync(OUT,{recursive:true});
async function check(browser,width,height){
 const ctx=await browser.newContext({viewport:{width,height},
  isMobile:width<768,hasTouch:width<768,serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message.slice(0,170)));
 await page.addInitScript(()=>{
  window.__shifts=[];
  try{new PerformanceObserver(list=>list.getEntries().forEach(e=>{
    if(!e.hadRecentInput)window.__shifts.push(e.value);
  })).observe({type:'layout-shift',buffered:true});}catch{}
 });
 const response=await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded',timeout:65000});
 await page.waitForTimeout(1600);
 const first=await page.evaluate(()=>{
  const section=document.querySelector('.elementor-element-1be3f74');
  const sr7=document.querySelector('sr7-module#SR7_1_1');
  const imgs=[...section.querySelectorAll('img.swiper-slide-image')];
  const r=section.getBoundingClientRect();
  return {imgs:imgs.length,sizes:imgs.map(el=>({src:(el.getAttribute('src')||'').split('/').at(-1),
   width:Number(el.getAttribute('width')||0),height:Number(el.getAttribute('height')||0)})),
   sectionTop:Math.round(r.top),sectionHeight:Math.round(r.height),
   poster:!!sr7?.getAttribute('data-ptscps-poster'),
   docWidth:document.documentElement.scrollWidth};
 });
 const invalid=first.sizes.filter(x=>x.width<1||x.height<1);
 if(response.status()!==200||first.imgs<18||invalid.length>0||!first.poster||first.docWidth>width+3)
  throw Error('Invalid HTML dimensions or layout: '+JSON.stringify({width,first,invalid}));
 await page.locator('.elementor-element-1be3f74').scrollIntoViewIfNeeded();
 await page.waitForTimeout(2300);
 const after=await page.evaluate(()=>{
  const section=document.querySelector('.elementor-element-1be3f74');
  const images=[...section.querySelectorAll('img.swiper-slide-image')];
  const loaded=images.filter(i=>i.naturalWidth>0);
  const mismatched=loaded.filter(i=>{
   const w=Number(i.getAttribute('width')||0),h=Number(i.getAttribute('height')||0);
   return Math.abs(w/h-i.naturalWidth/i.naturalHeight)>0.055;
  });
  return {height:Math.round(section.getBoundingClientRect().height),
   count:images.length,loaded:loaded.length,mismatched:mismatched.length,
   width:document.documentElement.scrollWidth,
   cls:window.__shifts.reduce((a,b)=>a+b,0),
   sourceImages:new Set(images.map(x=>x.getAttribute('src'))).size};
 });
 const result={viewport:{width,height},http:response.status(),before:first,after,errors};
 fs.writeFileSync(OUT+'/'+width+'.json',JSON.stringify(result,null,2));
 console.log('LOGO_DIMS_QA '+JSON.stringify({width,height,http:result.http,imgCount:first.imgs,
  dimensionsSet:first.sizes.filter(x=>x.width>0&&x.height>0).length,
  beforeHeight:first.sectionHeight,afterHeight:after.height,
  loaded:after.loaded,mismatched:after.mismatched,cls:after.cls,
  logoCount:after.count,errors}).slice(0,4500));
 if(after.loaded<15||after.mismatched>0||after.height<170||
   after.width>width+3||after.cls>0.035||errors.length)
  throw Error('Rendering regression: '+JSON.stringify({width,after,errors}));
 await ctx.close();
}
async function nonhome(browser){
 const page=await browser.newPage();
 const r=await page.goto(ORIGIN+'/lien-he',{waitUntil:'domcontentloaded',timeout:55000});
 console.log('LOGO_DIMS_NONHOME '+JSON.stringify({http:r.status()}));
 if(r.status()!==200)throw Error('Non-home failed');
 await page.close();
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 try{await check(browser,412,850);await check(browser,1440,900);await nonhome(browser);
  console.log('LOGO_DIMS_QA_SUCCESS');
 }finally{await browser.close()}
})().catch(err=>{console.error('LOGO_DIMS_QA_FAIL '+String(err.stack||err));process.exitCode=1;});
