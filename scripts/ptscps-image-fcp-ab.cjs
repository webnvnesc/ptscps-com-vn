'use strict';
// Read-only, paired A/B: reproduce pre-optimization HTML entirely inside the browser.
// Production WordPress/Elementor/SR7 and caches are not modified.
const {chromium}=require('playwright');
const fs=require('node:fs');
const width=Number(process.env.TEST_WIDTH||412);
const mobile=width<700;
const cycles=Number(process.env.TEST_CYCLES||5);
const pageName=process.env.TEST_PAGE||'home';
const base='https://ptscps.com.vn';
const pathName=pageName==='home'?'/':'/c/hoat-dong-cua-cong-ty';
const save='fcp-images-ab-'+pageName+'-'+width;
fs.mkdirSync(save,{recursive:true});
const modes=pageName==='home'?['old_eager_full','lazy_only_full','current_lazy_responsive']:['old_eager_full','current_lazy_responsive'];
const originalBySmall={
 '2222221z5245174915163_4145568119040ed86e3b35d70f0b52ca-768x289.jpg':'2222221z5245174915163_4145568119040ed86e3b35d70f0b52ca-scaled.jpg',
 '333333z5245174082713_4252facd17ae73b1c1d1864970e283b0-1024x354.jpg':'333333z5245174082713_4252facd17ae73b1c1d1864970e283b0-scaled.jpg'
};
const med=a=>{
 const b=a.filter(Number.isFinite).sort((x,y)=>x-y);
 return b.length?(b[Math.floor((b.length-1)/2)]+b[Math.floor(b.length/2)])/2:null;
};
function oldHtml(html,mode){
 let logos=0,thumbs=0,revertedSrc=0;
 const updated=html.replace(/<img\b[^>]*>/gi,tag=>{
  if(pageName==='home'){
   if(!/\bclass=(["'])[^"']*\bswiper-slide-image\b/.test(tag))return tag;
   logos++;
   if(mode==='current_lazy_responsive')return tag;
   let t=tag.replace(/\sloading=(["'])lazy\1/gi,'');
   if(mode==='lazy_only_full')t=t.replace(/\s*\/?>$/,' loading="lazy" />');
   const src=t.match(/\bsrc=(["'])(.*?)\1/i);
   if(src){
    const path=new URL(src[2],base).pathname;
    const last=path.split('/').pop();
    if(originalBySmall[last]){
     revertedSrc++;
     t=t.replace(src[0],'src="'+src[2].replace(last,originalBySmall[last])+'"');
    }
   }
   t=t.replace(/\s(?:srcset|sizes)=(["']).*?\1/gi,'');
   return t;
  }
  if(!/\bwp-post-image\b/.test(tag)||!/\bjannah-image-large\b/.test(tag))return tag;
  thumbs++;
  return mode==='old_eager_full'?tag.replace(/\sloading=(["'])lazy\1/gi,''):tag;
 });
 return {html:updated,logos,thumbs,revertedSrc};
}
async function trial(browser,mode,cycle){
 const context=await browser.newContext({
  viewport:{width,height:mobile?823:900},deviceScaleFactor:mobile?2:1,
  isMobile:mobile,hasTouch:mobile,
  ...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})
 });
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,140)));
 await page.addInitScript(()=>{
  window.__shifts=[];window.__lcp=[];
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__shifts.push(e.value)})).observe({type:'layout-shift',buffered:true})}catch(e){}
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lcp.push(e.startTime))).observe({type:'largest-contentful-paint',buffered:true})}catch(e){}
 });
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Network.emulateNetworkConditions',{
  offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:95*1024
 });
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 const requestTimes=new Map();
 let firstDocTime=null;
 cdp.on('Network.requestWillBeSent',e=>{
  if(e.type==='Document'&&firstDocTime===null)firstDocTime=e.timestamp;
  if(e.type==='Image'||/\.(?:jpe?g|png|webp|gif|avif)(?:\?|$)/i.test(e.request.url)){
   requestTimes.set(e.requestId,{url:e.request.url,t:e.timestamp,bytes:0});
  }
 });
 cdp.on('Network.loadingFinished',e=>{
  const r=requestTimes.get(e.requestId);if(r)r.bytes=e.encodedDataLength||0;
 });
 let modifications=null;
 await page.route('**/*',async route=>{
  const req=route.request();
  if(!req.isNavigationRequest()||new URL(req.url()).pathname!==pathName)return route.continue();
  const response=await route.fetch();
  const html=await response.text();
  modifications=oldHtml(html,mode);
  return route.fulfill({response,body:modifications.html});
 });
 const row={page:pageName,width,mode,cycle};
 try{
  const resp=await page.goto(base+pathName,{waitUntil:'domcontentloaded',timeout:75000});
  await page.waitForFunction(()=>performance.getEntriesByType('paint').some(e=>e.name==='first-contentful-paint'),{timeout:16000});
  await page.waitForTimeout(1300);
  const stats=await page.evaluate((which)=>{
   const nav=performance.getEntriesByType('navigation')[0];
   const fcp=Math.round(performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint')?.startTime||0);
   const imgs=[...document.querySelectorAll(which==='home'?'img.swiper-slide-image':'img.wp-post-image')];
   return {
    ttfb:Math.round(nav.responseStart),fcp,
    lcp:Math.round(window.__lcp.at(-1)||0),
    cls:window.__shifts.reduce((a,b)=>a+b,0),
    imgCount:imgs.length,
    imgLazy:imgs.filter(x=>x.loading==='lazy').length,
    responsive:imgs.filter(x=>!!x.getAttribute('srcset')).length,
    media:performance.getEntriesByType('resource')
      .filter(x=>x.initiatorType==='img'||/\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(x.name))
      .map(x=>({url:x.name,start:Math.round(x.startTime),end:Math.round(x.responseEnd),
        bytes:x.transferSize||0})),
    docWidth:document.documentElement.scrollWidth,
    sliderHeight:document.querySelector('sr7-module#SR7_1_1')?.getBoundingClientRect()?.height||null
   };
  },pageName);
  const network=[...requestTimes.values()];
  const before=network.filter(x=>firstDocTime!==null&&(x.t-firstDocTime)*1000<stats.fcp);
  Object.assign(row,{http:resp.status(),...stats,
   gap:stats.fcp-stats.ttfb,
   imageRequestsBeforeFcp:before.length,
   imageBytesBeforeFcp:before.reduce((sum,x)=>sum+x.bytes,0),
   allImageBytes:network.reduce((sum,x)=>sum+x.bytes,0),
   modifications:{logos:modifications.logos,thumbs:modifications.thumbs,revertedSrc:modifications.revertedSrc},
   errors});
  if(resp.status()!==200||errors.length||stats.docWidth>width+5)throw Error('Invalid response, script error or horizontal overflow');
  if(pageName==='home'&&modifications.logos<15)throw Error('Expected carousel markup missing');
  if(pageName==='archive'&&modifications.thumbs<10)throw Error('Expected archive markup missing');
  if(cycle===0&&mode!=='lazy_only_full'){
   await page.screenshot({path:save+'/'+mode+'-'+width+'.png',animations:'disabled',timeout:20000});
  }
 }catch(e){
  row.error=String(e.stack||e).slice(0,450);process.exitCode=1;
 }
 fs.writeFileSync(save+'/'+mode+'-'+cycle+'.json',JSON.stringify(row,null,2));
 console.log('CASE '+JSON.stringify({page:pageName,width,mode,cycle,http:row.http,ttfb:row.ttfb,
  fcp:row.fcp,gap:row.gap,lcp:row.lcp,cls:row.cls,imgCount:row.imgCount,imgLazy:row.imgLazy,
  responsive:row.responsive,imageRequestsBeforeFcp:row.imageRequestsBeforeFcp,
  imageBytesBeforeFcp:row.imageBytesBeforeFcp,allImageBytes:row.allImageBytes,
  modifications:row.modifications,errors:row.errors,error:row.error}));
 await context.close();
 return row;
}
async function main(){
 const browser=await chromium.launch({headless:true});
 const all=[];
 try{
  for(let cycle=0;cycle<cycles;cycle++){
   const order=cycle%2?[...modes].reverse():modes;
   for(const mode of order)all.push(await trial(browser,mode,cycle));
  }
 }finally{await browser.close()}
 for(const mode of modes.filter(m=>m!=='old_eager_full')){
  const pairs=[];
  for(let cycle=0;cycle<cycles;cycle++){
   const old=all.find(x=>x.mode==='old_eager_full'&&x.cycle===cycle);
   const current=all.find(x=>x.mode===mode&&x.cycle===cycle);
   if(!old?.fcp||!current?.fcp)continue;
   pairs.push({cycle,deltaFcp:current.fcp-old.fcp,deltaGap:current.gap-old.gap,
    deltaLcp:current.lcp-old.lcp,deltaCls:current.cls-old.cls,
    deltaImageBytes:current.allImageBytes-old.allImageBytes,
    deltaBeforeFcp:current.imageRequestsBeforeFcp-old.imageRequestsBeforeFcp});
  }
  const summary={page:pageName,width,mode,pairs,
   medianDeltaFcp:med(pairs.map(p=>p.deltaFcp)),
   medianDeltaGap:med(pairs.map(p=>p.deltaGap)),
   medianDeltaLcp:med(pairs.map(p=>p.deltaLcp)),
   medianDeltaBytes:med(pairs.map(p=>p.deltaImageBytes)),
   medianDeltaBeforeFcp:med(pairs.map(p=>p.deltaBeforeFcp))};
  console.log('SUMMARY '+JSON.stringify(summary));
  fs.writeFileSync(save+'/summary-'+mode+'.json',JSON.stringify(summary,null,2));
  if(pairs.length!==cycles)process.exitCode=1;
 }
}
main().catch(e=>{console.error('FATAL',e.stack||String(e));process.exitCode=1});
