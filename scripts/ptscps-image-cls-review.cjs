'use strict';
const {chromium}=require('playwright'),fs=require('fs');
const root='https://ptscps.com.vn/c/hoat-dong-cua-cong-ty';
const out='image-cls-review';fs.mkdirSync(out,{recursive:true});
async function sample(browser,variant,cycle){
 const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.message).slice(0,200)));
 await page.route('**/*',async route=>{
  const req=route.request();
  if(!req.isNavigationRequest()||new URL(req.url()).pathname!=='/c/hoat-dong-cua-cong-ty')return route.continue();
  const res=await route.fetch();let html=await res.text();
  if(variant==='baseline_eager'){
   let i=0;
   html=html.replace(/<img\b[^>]*>/gi,tag=>{
    if(!tag.includes('wp-post-image')||!tag.includes('jannah-image-large'))return tag;
    i++;
    return tag.replace(/\sloading="lazy"/gi,'');
   });
   console.log('BASELINE_TAGS '+i);
  }
  return route.fulfill({response:res,body:html});
 });
 await page.addInitScript(()=>{
  window.__shifts=[];
  try{new PerformanceObserver(l=>{
   for(const e of l.getEntries())if(!e.hadRecentInput)
    window.__shifts.push({t:Math.round(e.startTime),v:e.value,
     sources:(e.sources||[]).map(s=>({previous:s.previousRect,current:s.currentRect,
       tag:s.node?.tagName,id:s.node?.id,classes:String(s.node?.className||'').slice(0,120)}))});
  }).observe({type:'layout-shift',buffered:true})}catch(e){}
 });
 const resp=await page.goto(root,{waitUntil:'domcontentloaded',timeout:75000});
 await page.waitForTimeout(2600);
 const data=await page.evaluate(()=>{
  const nav=performance.getEntriesByType('navigation')[0],paint=performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint');
  return {fcp:Math.round(paint?.startTime||0),ttfb:Math.round(nav?.responseStart||0),
   cls:window.__shifts.reduce((a,b)=>a+b.v,0),shifts:window.__shifts,
   img:[...document.querySelectorAll('img.wp-post-image')].map(x=>({
    t:Math.round(x.getBoundingClientRect().top),height:Math.round(x.getBoundingClientRect().height),
    loading:x.loading,complete:x.complete,naturalWidth:x.naturalWidth
   }))};
 });
 await page.screenshot({path:out+'/'+variant+'-'+cycle+'.png',animations:'disabled'});
 const result={variant,cycle,status:resp.status(),...data,errors};
 console.log('RUN '+JSON.stringify({variant,cycle,status:resp.status(),fcp:data.fcp,ttfb:data.ttfb,cls:data.cls,
  lazy:data.img.filter(x=>x.loading==='lazy').length,shifts:data.shifts.slice(0,6),errors}));
 fs.writeFileSync(out+'/'+variant+'-'+cycle+'.json',JSON.stringify(result,null,2));
 await ctx.close();
}
async function main(){
 const b=await chromium.launch({headless:true});
 try{
  for(let cycle=0;cycle<3;cycle++){
   for(const v of cycle%2?['optimized','baseline_eager']:['baseline_eager','optimized'])await sample(b,v,cycle);
  }
 }finally{await b.close()}
}
main().catch(e=>{console.error('FATAL '+String(e.stack||e));process.exitCode=1});
