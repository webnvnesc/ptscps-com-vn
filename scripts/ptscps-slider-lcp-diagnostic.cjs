'use strict';
/** Non-mutating on-device observation of PTSCPS SR7 hero and browser LCP candidates. */
const {chromium}=require('playwright');
const fs=require('node:fs');
const width=Number(process.env.TEST_WIDTH||412);
const throttled=process.env.TEST_THROTTLE==='1';
const cycles=Number(process.env.TEST_CYCLES||2);
const dir='slider-lcp-audit-'+width+(throttled?'-lab':'-fast');
fs.mkdirSync(dir,{recursive:true});

async function one(browser,cycle){
 const mobile=width<700;
 const context=await browser.newContext({
  viewport:{width,height:mobile?823:900}, deviceScaleFactor:mobile?2:1,
  isMobile:mobile,hasTouch:mobile,
  ...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})
 });
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.message).slice(0,250)));
 await page.addInitScript(()=>{
   window.__ptscpsLCP=[];window.__ptscpsShifts=[];window.__ptscpsTimes={};
   try{
    new PerformanceObserver(list=>{
     for(const e of list.getEntries()){
      let obj={start:Math.round(e.startTime),renderTime:Math.round(e.renderTime||0),loadTime:Math.round(e.loadTime||0),
       size:e.size,url:e.url||null,id:e.id||null};
      try{
       const el=e.element;
       if(el){
        const r=el.getBoundingClientRect(),s=getComputedStyle(el);
        Object.assign(obj,{
          tag:el.localName,selector:(el.id?'#'+el.id:el.localName+'.'+String(el.className?.baseVal||el.className||'').split(/\s+/).slice(0,3).join('.')).slice(0,140),
          html:el.outerHTML.slice(0,800),text:el.textContent?.trim().slice(0,190)||null,
          rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
          background:s.backgroundImage.slice(0,450),opacity:s.opacity,visibility:s.visibility,
          slider:!!el.closest('sr7-module, rs-module, sr7-wrap')
        });
       }
      }catch(e){obj.serializeError=String(e).slice(0,100)}
      window.__ptscpsLCP.push(obj);
     }
    }).observe({type:'largest-contentful-paint',buffered:true});
   }catch(e){window.__ptscpsTimes.observerError=String(e)}
   try{
    new PerformanceObserver(list=>{
     for(const e of list.getEntries())if(!e.hadRecentInput)window.__ptscpsShifts.push({start:Math.round(e.startTime),value:e.value});
    }).observe({type:'layout-shift',buffered:true});
   }catch(e){}
   try{document.addEventListener('DOMContentLoaded',()=>{window.__ptscpsTimes.dom=performance.now()})}catch(e){}
 });
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 if(throttled){
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:95*1024});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 }
 const requests=new Map();
 let t0=null;
 cdp.on('Network.requestWillBeSent',e=>{
  if(t0===null&&e.type==='Document')t0=e.timestamp;
  if(e.type==='Image'||/(?:ruby-banner|banner[23]|sr7|slider)/i.test(e.request.url)){
   requests.set(e.requestId,{url:e.request.url,type:e.type,initiator:e.initiator?.type,
     initialPriority:e.request.initialPriority||null,t:e.timestamp});
  }
 });
 cdp.on('Network.responseReceived',e=>{
  const x=requests.get(e.requestId);if(x){x.status=e.response.status;x.received=e.timestamp;x.cache=!!e.response.fromDiskCache;}
 });
 cdp.on('Network.loadingFinished',e=>{
  const x=requests.get(e.requestId);if(x){x.end=e.timestamp;x.bytes=e.encodedDataLength||0;}
 });
 function pageProbe(){
  return page.evaluate(()=>{
   function node(el){
    if(!el)return null;
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    const d={tag:el.localName,id:el.id||null,class:String(el.className?.baseVal||el.className||'').slice(0,130),
     rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
     bg:s.backgroundImage.slice(0,340),content:s.content.slice(0,100),opacity:s.opacity,display:s.display,
     visibility:s.visibility,
     src:el.getAttribute('src'),dataSrc:el.getAttribute('data-src'),loading:el.getAttribute('loading'),
     fetchpriority:el.getAttribute('fetchpriority'),
     inlineStyle:(el.getAttribute('style')||'').slice(0,340),
     text:el.textContent?.trim().slice(0,100)||null
    };
    return d;
   }
   const main=document.querySelector('sr7-module#SR7_1_1, sr7-module, rs-module');
   const bounds=main?.getBoundingClientRect();
   const sample=bounds&&bounds.width>0&&bounds.height>0?
    document.elementsFromPoint(bounds.x+bounds.width/2,Math.max(1,Math.min(innerHeight-2,bounds.y+bounds.height/2)))
    .slice(0,12).map(node):[];
   const sel='sr7-img, sr7-bg, sr7-slide, sr7-module, sr7-content, rs-bg-elem, .tp-bgimg, img, canvas, video';
   const descendants=main?[...main.querySelectorAll(sel)].slice(0,52).map(node):[];
   const intro=[...document.querySelectorAll('p')].filter(e=>(e.textContent||'').includes('Công ty Cổ phần Dịch vụ Khai thác Dầu khí PTSC')).slice(0,3).map(node);
   const nav=performance.getEntriesByType('navigation')[0];
   const fcp=performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint');
   return {
    elapsed:Math.round(performance.now()),ttfb:Math.round(nav?.responseStart||0),
    fcp:Math.round(fcp?.startTime||0),
    lcp:window.__ptscpsLCP.slice(-12),cls:window.__ptscpsShifts.reduce((s,e)=>s+e.value,0),
    module:node(main),descendants,intro,hitTest:sample,
    scripts:[...document.querySelectorAll('script[src]')].filter(x=>/sr7|revslider|tptools/i.test(x.src)).map(x=>({src:x.src,async:x.async,defer:x.defer})),
    preloads:[...document.querySelectorAll('link[rel=preload]')].filter(x=>x.as==='image').map(x=>({href:x.href,priority:x.fetchPriority})),
    url:location.href
   };
  });
 }
 const result={width,throttled,cycle};
 try{
  const response=await page.goto('https://ptscps.com.vn/',{waitUntil:'domcontentloaded',timeout:80000});
  await page.waitForTimeout(600);
  result.early=await pageProbe();
  await page.waitForTimeout(3300);
  result.mid=await pageProbe();
  await page.waitForTimeout(2100);
  result.late=await pageProbe();
  result.http=response.status();
  result.errors=errors;
  result.requests=[...requests.values()].map(x=>({...x,
   start:Math.round((x.t-(t0||x.t))*1000),
   end:x.end?Math.round((x.end-(t0||x.t))*1000):null,
   received:x.received?Math.round((x.received-(t0||x.t))*1000):null
  })).filter(x=>x.url.includes('ptscps.com.vn')||/ruby-banner|banner/i.test(x.url))
   .sort((a,b)=>a.start-b.start).slice(0,70);
  if(cycle===0){
   await page.screenshot({path:dir+'/hero-'+width+(throttled?'-lab':'-fast')+'.png',timeout:25000,animations:'disabled'});
  }
 }catch(e){result.error=String(e.stack||e).slice(0,650);process.exitCode=1;}
 fs.writeFileSync(dir+'/case-'+cycle+'.json',JSON.stringify(result,null,2));
 function summary(p){
  return p?{fcp:p.fcp,ttfb:p.ttfb,cls:p.cls,
   lcp:p.lcp.map(x=>({time:x.start,size:x.size,tag:x.tag,selector:x.selector,url:x.url,slider:x.slider,html:x.html?.slice(0,240)})),
   slider:p.module && {rect:p.module.rect,bg:p.module.bg},
   intro:p.intro,
   sr7:p.descendants.filter(x=>/sr7-img|rs-bg-elem|tp-bgimg|img/.test(x.tag||'')).slice(0,10).map(x=>({
    tag:x.tag,rect:x.rect,src:x.src,dataSrc:x.dataSrc,bg:x.bg,opacity:x.opacity,display:x.display
   }))}:null;
 }
 const banner=result.requests?.filter(x=>/ruby-banner|\/banner[23]\.jpg/.test(x.url))
  .map(x=>({url:x.url,start:x.start,received:x.received,end:x.end,bytes:x.bytes,priority:x.initialPriority}));
 console.log('CASE '+JSON.stringify({width,throttled,cycle,http:result.http,early:summary(result.early),mid:summary(result.mid),late:summary(result.late),
  banner,errors,error:result.error}).slice(0,24000));
 await context.close();
}
async function main(){
 const b=await chromium.launch({headless:true});
 try{for(let cycle=0;cycle<cycles;cycle++)await one(b,cycle)}
 finally{await b.close()}
}
main().catch(e=>{console.error('FATAL',e.stack||e);process.exitCode=1});
