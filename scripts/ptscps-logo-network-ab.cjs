'use strict';
/**
 * Mobile cold-load paired trial: native homepage vs customer-logo images blocked.
 * Test runs in Chromium interception only; no WordPress or user changes.
 * Real Lighthouse SI is not measured here. FCP/LCP/CLS + network/longtasks only.
 */
const {chromium}=require('playwright');
const {load}=require('cheerio');
const fs=require('node:fs');
const SITE='https://ptscps.com.vn/';
const NUM=Number(process.env.LOGO_AB_PAIRS||5);
const OUT='ptscps-logo-network-ab';
fs.mkdirSync(OUT,{recursive:true});
const median=a=>{const x=a.filter(Number.isFinite).sort((v,w)=>v-w);return x.length?(x[(x.length-1)>>1]+x[x.length>>1])/2:null;};
async function sample(browser,html,logos,mode,i){
 const ctx=await browser.newContext({viewport:{width:412,height:850},isMobile:true,
  hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',
  userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'});
 const page=await ctx.newPage(),cdp=await ctx.newCDPSession(page),failed=[];
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,
   downloadThroughput:210*1024,uploadThroughput:95*1024});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 const errors=[],images=new Set();
 page.on('pageerror',e=>errors.push(String(e.message).slice(0,145)));
 cdp.on('Network.requestWillBeSent',e=>{
  const uri=e.request.url.split('?')[0];
  if(logos.has(uri))images.add(uri);
 });
 cdp.on('Network.loadingFailed',e=>failed.push(e.errorText));
 await page.addInitScript(()=>{
  window.__ptscpsLogoTest={lcp:[],shifts:[],tasks:[]};
  try{new PerformanceObserver(list=>list.getEntries().forEach(e=>{
    window.__ptscpsLogoTest.lcp.push({t:Math.round(e.startTime),tag:e.element?.tagName,
     id:e.element?.id||null,url:e.url||null});
  })).observe({type:'largest-contentful-paint',buffered:true});}catch{}
  try{new PerformanceObserver(list=>list.getEntries().forEach(e=>{
    if(!e.hadRecentInput)window.__ptscpsLogoTest.shifts.push(e.value)
  })).observe({type:'layout-shift',buffered:true});}catch{}
  try{new PerformanceObserver(list=>list.getEntries().forEach(e=>{
    window.__ptscpsLogoTest.tasks.push(Math.max(0,e.duration-50))
  })).observe({type:'longtask',buffered:true});}catch{}
 });
 await page.route(SITE,route=>route.request().isNavigationRequest()?
  route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html,
    headers:{'cache-control':'no-store','content-type':'text/html; charset=utf-8'}}):route.continue());
 if(mode==='blocked'){
  // Fulfill empty image without network request or DNS errors; preserve DOM and
  // carousel JS to isolate traffic costs. Avoid blocking all uploads.
  await page.route('**/wp-content/uploads/**',route=>{
   const uri=route.request().url().split('?')[0];
   if(logos.has(uri))return route.fulfill({status:200,contentType:'image/gif',
    body:Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=','base64')});
   return route.continue();
  });
 }
 const row={mode,cycle:i};
 try{
  const response=await page.goto(SITE,{waitUntil:'domcontentloaded',timeout:65000});
  await page.waitForTimeout(4800);
  const info=await page.evaluate(()=>{
   const n=performance.getEntriesByType('navigation')[0];
   const fcp=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
   const logo=document.querySelector('.elementor-element-1be3f74');
   const images=[...logo?.querySelectorAll('img.swiper-slide-image')||[]];
   return {ttfb:Math.round(n?.responseStart||0),
    fcp:Math.round(fcp?.startTime||0),
    lcp:window.__ptscpsLogoTest.lcp.at(-1)||null,
    cls:window.__ptscpsLogoTest.shifts.reduce((a,b)=>a+b,0),
    longTaskProxy:Math.round(window.__ptscpsLogoTest.tasks.reduce((a,b)=>a+b,0)),
    imageCount:images.length,logoTop:Math.round(logo?.getBoundingClientRect().top||0),
    totalResources:performance.getEntriesByType('resource').length,
    imagesNetwork:performance.getEntriesByType('resource').filter(x=>/\/wp-content\/uploads\//.test(x.name)).length,
    docWidth:document.documentElement.scrollWidth,
    width:innerWidth};
  });
  Object.assign(row,info,{http:response.status(),requestedLogoUrls:images.size,errors,failed});
  row.valid=row.http===200&&row.fcp>0&&row.docWidth<=413&&
   row.imageCount>=18&&row.logoTop>=850&&row.cls<0.08 &&
   errors.length===0;
 }catch(e){row.valid=false;row.error=String(e.message||e).slice(0,280);}
 console.log('LOGO_AB_CASE '+JSON.stringify({cycle:i,mode,valid:row.valid,
  fcp:row.fcp,lcp:row.lcp?.t,ttfb:row.ttfb,cls:row.cls,
  longTaskProxy:row.longTaskProxy,requestedLogoUrls:row.requestedLogoUrls,
  imageCount:row.imageCount,errors:row.errors,error:row.error}).slice(0,3000));
 fs.writeFileSync(OUT+'/'+i+'-'+mode+'.json',JSON.stringify(row,null,2));
 await ctx.close();
 return row;
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const data=[];
 try{
  const context=await browser.newContext();
  let html;
  try{
   const r=await context.request.get(SITE,{timeout:60000});
   if(r.status()!==200)throw Error('Home HTTP '+r.status());
   html=await r.text();
  }finally{await context.close();}
  const $=load(html);
  const imgs=$('.elementor-element-1be3f74 img.swiper-slide-image').toArray().map(e=>$(e).attr('src'))
   .filter(Boolean).map(x=>new URL(x,SITE).href.split('?')[0]);
  const logos=new Set(imgs);
  if(logos.size<15)throw Error('Missing sufficient real logo URLs: '+logos.size);
  console.log('LOGO_AB_SETUP '+JSON.stringify({images:imgs.length,unique:logos.size,
   logoPaths:[...logos].map(x=>new URL(x).pathname.split('/').at(-1)).slice(0,6)}));
  for(let i=0;i<NUM;i++){
   const order=i%2?['blocked','control']:['control','blocked'];
   for(const mode of order)data.push(await sample(browser,html,logos,mode,i));
  }
 }finally{await browser.close();}
 const paired=[];
 for(let i=0;i<NUM;i++){
  const a=data.find(x=>x.cycle===i&&x.mode==='control');
  const b=data.find(x=>x.cycle===i&&x.mode==='blocked');
  paired.push({cycle:i,valid:!!(a?.valid&&b?.valid),
   fcpDelta:(b?.fcp??0)-(a?.fcp??0),
   lcpDelta:(b?.lcp?.t??0)-(a?.lcp?.t??0),
   clsDelta:(b?.cls??0)-(a?.cls??0),
   tasksDelta:(b?.longTaskProxy??0)-(a?.longTaskProxy??0),
   aFcp:a?.fcp,bFcp:b?.fcp,
   aLogoRequests:a?.requestedLogoUrls,bLogoRequests:b?.requestedLogoUrls});
 }
 const good=paired.filter(x=>x.valid);
 const stats={pairs:NUM,validPairs:good.length,medianBlockedMinusControlFcp:median(good.map(x=>x.fcpDelta)),
  medianBlockedMinusControlLcp:median(good.map(x=>x.lcpDelta)),
  medianBlockedMinusControlCls:median(good.map(x=>x.clsDelta)),
  medianBlockedMinusControlLongTasks:median(good.map(x=>x.tasksDelta)),
  pairsData:paired,invalid:data.filter(x=>!x.valid).map(x=>({mode:x.mode,cycle:x.cycle,error:x.error,errors:x.errors})),
  note:'No Lighthouse SI here; first-byte render comparisons from a remote GitHub runner, and blocked images are replaced in-browser only.'};
 console.log('LOGO_AB_SUMMARY '+JSON.stringify(stats).slice(0,18000));
 fs.writeFileSync(OUT+'/summary.json',JSON.stringify(stats,null,2));
 if(good.length<Math.ceil(NUM*.6))process.exitCode=1;
})().catch(e=>{console.error('LOGO_AB_FATAL '+String(e.stack||e));process.exitCode=1});
