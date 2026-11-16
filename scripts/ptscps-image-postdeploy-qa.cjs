'use strict';
const {chromium}=require('playwright'),fs=require('fs');
const width=Number(process.env.TEST_WIDTH||412),mobile=width<700;
const out='image-postdeploy-'+width;
fs.mkdirSync(out,{recursive:true});
async function test(browser,pageName,url){
 const context=await browser.newContext({viewport:{width,height:mobile?823:900},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,
 ...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.message).slice(0,300)));
 await page.addInitScript(()=>{
  window.__shifts=[];
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__shifts.push(e.value)}).observe({type:'layout-shift',buffered:true})}catch(e){}
 });
 const res=await page.goto(url,{waitUntil:'domcontentloaded',timeout:85000});
 await page.waitForTimeout(2200);
 const before=await page.evaluate(pageName=>{
  const nav=performance.getEntriesByType('navigation')[0],paint=performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint');
  const select=pageName==='home'?'img.swiper-slide-image':'img.wp-post-image';
  const imgs=[...document.querySelectorAll(select)];
  return {page:pageName,
   fcp:Math.round(paint?.startTime||0),ttfb:Math.round(nav?.responseStart||0),
   cls:window.__shifts.reduce((a,b)=>a+b,0),
   imgs:imgs.map(x=>({url:x.currentSrc||x.src,loading:x.loading,
    complete:x.complete,naturalWidth:x.naturalWidth,top:Math.round(x.getBoundingClientRect().top),
    width:Math.round(x.getBoundingClientRect().width),srcset:x.getAttribute('srcset')||''})),
   swiperClass:document.querySelector('.elementor-image-carousel')?.className||null,
   slider:document.querySelector('sr7-module#SR7_1_1')?.getBoundingClientRect().toJSON()||null,
   docWidth:document.documentElement.scrollWidth,viewport:innerWidth
  };
 },pageName);
 const lazy=before.imgs.filter(x=>x.loading==='lazy').length;
 const record={page:pageName,width,status:res.status(),initial:{fcp:before.fcp,ttfb:before.ttfb,cls:before.cls,
  images:before.imgs.length,lazy,srcset:before.imgs.filter(x=>x.srcset).length,
  farLoaded:before.imgs.filter(x=>x.top> (mobile?823:900)+900 && x.naturalWidth>0).length,
  slider:before.slider,swiperClass:before.swiperClass,docWidth:before.docWidth}};
 await page.screenshot({path:out+'/'+pageName+'-initial.png',animations:'disabled'});
 if(pageName==='home'){
  await page.locator('.elementor-image-carousel').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  record.scrolled=await page.evaluate(()=>{
   const imgs=[...document.querySelectorAll('.elementor-image-carousel img')];
   return {visible:imgs.filter(x=>{
     const r=x.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0;
   }).length,loaded:imgs.filter(x=>x.naturalWidth>0).length,total:imgs.length,
   swiperClass:document.querySelector('.elementor-image-carousel')?.className||'',
   currentSrc:imgs.find(x=>x.naturalWidth>0)?.currentSrc||''};
  });
  await page.screenshot({path:out+'/home-scrolled.png',animations:'disabled'});
  if(before.imgs.length<15||lazy!==before.imgs.length||before.imgs.filter(x=>x.srcset).length<2||record.scrolled.loaded===0){
   throw Error('homepage carousel lazy/responsive/scroll failed: '+JSON.stringify(record));
  }
 }else{
  const target=page.locator('img.wp-post-image').last();
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1700);
  record.scrolled=await target.evaluate(x=>({loaded:x.complete&&x.naturalWidth>0,width:x.naturalWidth,loading:x.loading}));
  if(before.imgs.length<10||lazy<3||before.imgs.slice(0,6).some(x=>x.loading==='lazy')||!record.scrolled.loaded){
   throw Error('archive lazy/scroll failed: '+JSON.stringify(record));
  }
 }
 if(errors.length||before.docWidth>width+3)throw Error('layout/JS failures: '+JSON.stringify({errors,record}));
 console.log('PASS '+JSON.stringify(record));
 fs.writeFileSync(out+'/'+pageName+'.json',JSON.stringify({record,images:before.imgs,errors},null,2));
 await context.close();
}
async function main(){
 const browser=await chromium.launch({headless:true});
 try{
  await test(browser,'home','https://ptscps.com.vn/');
  await test(browser,'archive','https://ptscps.com.vn/c/hoat-dong-cua-cong-ty');
 }finally{await browser.close()}
}
main().catch(e=>{console.error('FAILED '+String(e.stack||e));process.exitCode=1});
