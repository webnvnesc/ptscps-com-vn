'use strict';
/**
 * Verify production content-visibility pilot on real WP + Elementor markup.
 * Test both viewports and a non-home page; scroll through deferred sections.
 */
const {chromium}=require('playwright'),fs=require('node:fs');
const origin='https://ptscps.com.vn';
const out='ptscps-content-visibility-qa';
fs.mkdirSync(out,{recursive:true});
const selectors={
 news:'.elementor.elementor-5 > section.elementor-element-1c36b17',
 customers:'.elementor.elementor-5 > section.elementor-element-1be3f74',
 hero:'sr7-module#SR7_1_1'
};
async function test(browser,device){
 const mobile=device.width<768;
 const ctx=await browser.newContext({viewport:{width:device.width,height:device.height},
  isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message.slice(0,180)));
 await page.addInitScript(()=>{
  window.__cvShifts=[];
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>{
    if(!e.hadRecentInput)window.__cvShifts.push(e.value)
   })).observe({type:'layout-shift',buffered:true});}catch(e){}
 });
 const response=await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:75000});
 await page.waitForTimeout(1800);
 const html=await response.text();
 const initial=await page.evaluate(selectors=>{
  const data={};
  for(const [key,selector] of Object.entries(selectors)){
   const el=document.querySelector(selector);
   const r=el?.getBoundingClientRect(),s=el&&getComputedStyle(el);
   data[key]=el&&r?{count:document.querySelectorAll(selector).length,
     top:Math.round(r.top+scrollY),height:Math.round(r.height),
     width:Math.round(r.width),contentVisibility:s.contentVisibility,
     intrinsic:s.containIntrinsicSize,display:s.display,
     text:(el.textContent||'').trim().slice(0,100)}:null;
  }
  return {...data,docWidth:document.documentElement.scrollWidth,
   viewport:innerWidth,cls:window.__cvShifts.reduce((a,b)=>a+b,0),
   cssIdCount:document.querySelectorAll('#ptscps-offscreen-content-visibility-v1').length,
   firstSlidePoster:!!document.querySelector('sr7-module[data-ptscps-poster]'),
   heroBg:getComputedStyle(document.querySelector(selectors.hero)).backgroundImage};
 },selectors);
 const check=mobile?
  initial.news?.contentVisibility==='auto'&&initial.customers?.contentVisibility!=='auto':
  initial.news?.contentVisibility!=='auto'&&initial.customers?.contentVisibility!=='auto';
 if(response.status()!==200||!html.includes('ptscps-offscreen-content-visibility-v1')||
    !check||initial.cssIdCount!==1||!initial.hero?.width||!initial.firstSlidePoster||
    initial.docWidth>device.width+3||initial.cls>0.045)
  throw Error('Pilot style, layout or header safety gate failed: '+JSON.stringify({device,initial,http:response.status()}));
 const after={};
 for(const [key,selector] of Object.entries({news:selectors.news,customers:selectors.customers})){
  const target=page.locator(selector);
  await target.scrollIntoViewIfNeeded({timeout:20000});
  await page.waitForTimeout(1000);
  after[key]=await target.evaluate(el=>{
   const r=el.getBoundingClientRect();
   return {top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height),
    contentVisibility:getComputedStyle(el).contentVisibility,
    textLength:(el.innerText||'').trim().length,
    imageCount:el.querySelectorAll('img').length,
    imageLoaded:[...el.querySelectorAll('img')].filter(i=>i.naturalWidth>0).length};
  });
  if(after[key].height<85 || after[key].textLength<10 || after[key].width<300 || (key==='customers' && after[key].imageLoaded===0))
   throw Error('Offscreen section not restored correctly after scrolling: '+JSON.stringify({device,key,after:after[key]}));
 }
 const cls=await page.evaluate(()=>window.__cvShifts.reduce((a,b)=>a+b,0));
 const result={device,http:response.status(),initial,after,cls,errors};
 fs.writeFileSync(out+'/'+(mobile?'mobile':'desktop')+'.json',JSON.stringify(result,null,2));
 console.log('CV_QA '+JSON.stringify(result).slice(0,13000));
 if(errors.length||cls>0.045||initial.docWidth>device.width+3)
  throw Error('JS/CLS/overflow: '+JSON.stringify({errors,cls,width:initial.docWidth}));
 await ctx.close();
}
async function nonhome(browser){
 const page=await browser.newPage();
 const response=await page.goto(origin+'/lien-he',{waitUntil:'domcontentloaded',timeout:55000});
 const marker=await page.locator('#ptscps-offscreen-content-visibility-v1').count();
 console.log('CV_NONHOME '+JSON.stringify({http:response.status(),marker}));
 await page.close();
 if(marker||response.status()!==200)throw Error('Non-home scope isolation failed');
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 try{
  await test(browser,{name:'mobile',width:412,height:850});
  await test(browser,{name:'desktop',width:1440,height:900});
  await nonhome(browser);
  console.log('CV_QA_SUCCESS');
 }finally{await browser.close();}
})().catch(e=>{console.error('CV_QA_FAILED '+String(e.stack||e));process.exitCode=1;});
