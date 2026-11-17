'use strict';
/**
 * Read-only, real-production timeline for whether SR7 requests slides 2/3
 * before the first poster image finishes downloading or painting as LCP.
 *
 * Uses Chrome CDP monotonic network timestamps relative to document request;
 * PerformanceObserver LCP and CSS poster visible state are sampled separately.
 */
const {chromium}=require('playwright');
const fs=require('node:fs');
const device=process.env.TIMELINE_DEVICE||'mobile';
const cycles=Math.max(1,Math.min(3,Number(process.env.TIMELINE_CYCLES||2)));
const watchMs=Math.max(12000,Math.min(60000,Number(process.env.TIMELINE_WATCH_MS||35000)));
const throttle=device==='mobile';
const dir='sr7-first-vs-later-'+device;
fs.mkdirSync(dir,{recursive:true});
function type(url){
 if(/\/ruby-banner(?:[-.\?]|$)/i.test(url))return 'banner1';
 if(/\/banner2\.jpg(?:\?|$)/i.test(url))return 'banner2';
 if(/\/banner3\.jpg(?:\?|$)/i.test(url))return 'banner3';
 if(/\/wp-json\/sliderrevolution\/sliders\/1(?:\?|$)/i.test(url))return 'slide-API';
 if(/\/(?:sr7|tptools)(?:\.min)?\.js/i.test(url))return 'slider-JS';
 return '';
}
async function run(browser,cycle){
 const ctx=await browser.newContext({
  viewport:{width:throttle?412:1440,height:throttle?850:900},
  isMobile:throttle,hasTouch:throttle,deviceScaleFactor:1,
  serviceWorkers:'block',
  ...(throttle?{userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})
 });
 const page=await ctx.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message.slice(0,240)));
 await page.addInitScript(()=>{
  window.__ptscpsTimeline={lcp:[],paints:[],changes:[],shifts:[],ready:[],started:performance.now()};
  try{new PerformanceObserver(list=>{
   for(const e of list.getEntries())window.__ptscpsTimeline.lcp.push({
    t:Math.round(e.startTime),renderTime:Math.round(e.renderTime||0),loadTime:Math.round(e.loadTime||0),
    url:e.url||null,tag:e.element?.localName||null,id:e.element?.id||null,
    bg:e.element?getComputedStyle(e.element).backgroundImage.slice(0,190):null
   });
  }).observe({type:'largest-contentful-paint',buffered:true});}catch{}
  try{new PerformanceObserver(list=>list.getEntries().forEach(e=>
   window.__ptscpsTimeline.paints.push({name:e.name,t:Math.round(e.startTime)})))
   .observe({type:'paint',buffered:true});}catch{}
  try{new PerformanceObserver(list=>list.getEntries().forEach(e=>{
   if(!e.hadRecentInput)window.__ptscpsTimeline.shifts.push({t:Math.round(e.startTime),value:e.value});
  })).observe({type:'layout-shift',buffered:true});}catch{}
  document.addEventListener('DOMContentLoaded',()=>{
   const read=()=>{
    const m=document.querySelector('sr7-module#SR7_1_1');
    if(!m)return null;
    const s=getComputedStyle(m);
    const first=m.querySelector('sr7-slide');
    const fs=first?getComputedStyle(first):null;
    const b=m.getBoundingClientRect();
    return {
     module:m.id,poster:!!m.getAttribute('data-ptscps-poster'),
     moduleBg:s.backgroundImage.includes('ruby-banner'),moduleVisible:s.visibility,display:s.display,
     rect:[Math.round(b.width),Math.round(b.height)],
     current:m.getAttribute('data-current'),
     firstId:first?.id||null,firstOpacity:fs?.opacity||null,firstVisibility:fs?.visibility||null,
     slideCount:m.querySelectorAll('sr7-slide').length
    };
   };
   let last='';
   const check=()=>{
    const state=read();
    if(!state)return;
    const k=JSON.stringify(state);
    if(k!==last){
     last=k;
     window.__ptscpsTimeline.changes.push({t:Math.round(performance.now()),state});
    }
   };
   check();
   const interval=setInterval(()=>{
    check();
    if(performance.now()>60000)clearInterval(interval);
   },120);
  },{once:true});
  document.addEventListener('sr.module.ready',e=>{
   window.__ptscpsTimeline.ready.push({t:Math.round(performance.now()),event:'sr.module.ready'});
  },true);
 });
 const cdp=await ctx.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Page.enable');
 await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});
 if(throttle){
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:95*1024});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 }
 const requests=new Map();const lifecycle=[];
 let zero=null;
 cdp.on('Network.requestWillBeSent',e=>{
  if(zero===null&&e.type==='Document')zero=e.timestamp;
  const kind=type(e.request.url);
  if(kind)requests.set(e.requestId,{kind,url:e.request.url,start:e.timestamp,
   priority:e.request.initialPriority||null,initiator:e.initiator?.type||null,redirect:!!e.redirectResponse});
 });
 cdp.on('Network.responseReceived',e=>{
  const r=requests.get(e.requestId);if(r){
   r.response=e.timestamp;r.status=e.response.status;r.fromCache=!!(e.response.fromDiskCache||e.response.fromPrefetchCache);
  }
 });
 cdp.on('Network.loadingFinished',e=>{
  const r=requests.get(e.requestId);if(r){r.end=e.timestamp;r.encodedBytes=e.encodedDataLength}
 });
 cdp.on('Network.loadingFailed',e=>{
  const r=requests.get(e.requestId);if(r){r.error=e.errorText;r.end=e.timestamp}
 });
 cdp.on('Page.lifecycleEvent',e=>{
  if(/firstPaint|firstContentfulPaint|load|DOMContentLoaded/i.test(e.name)){
   lifecycle.push({kind:e.name,time:e.timestamp});
  }
 });
 const result={device,cycle,watchMs,http:null,errors};
 try{
  const response=await page.goto('https://ptscps.com.vn/',{waitUntil:'domcontentloaded',timeout:85000});
  result.http=response.status();
  await page.waitForTimeout(watchMs);
  const snap=await page.evaluate(()=>{
   const t=window.__ptscpsTimeline||{};
   const r=performance.getEntriesByType('resource').filter(e=>/ruby-banner|banner[23]\.jpg|sliderrevolution\/sliders\/1/.test(e.name))
    .map(x=>({url:x.name,start:Math.round(x.startTime),responseEnd:Math.round(x.responseEnd),
     duration:Math.round(x.duration),transferSize:x.transferSize}));
   const n=performance.getEntriesByType('navigation')[0];
   const m=document.querySelector('sr7-module#SR7_1_1');
   return {timeline:t,resources:r,ttfb:Math.round(n?.responseStart||0),
    preload:[...document.querySelectorAll('link[data-ptscps-sr7-first-preload]')]
      .map(x=>({url:x.href,fetchpriority:x.fetchPriority||x.getAttribute('fetchpriority')})),
    poster:m?.getAttribute('data-ptscps-poster')||null};
  });
  const data=[...requests.values()].map(r=>({...r,
   startMs:Math.round((r.start-(zero||r.start))*1000),
   endMs:r.end?Math.round((r.end-(zero||r.start))*1000):null,
   responseMs:r.response?Math.round((r.response-(zero||r.start))*1000):null
  })).sort((a,b)=>a.startMs-b.startMs);
  const by=k=>data.filter(x=>x.kind===k);
  const b1=by('banner1')[0],b2=by('banner2')[0],b3=by('banner3')[0];
  const firstPaint=snap.timeline?.lcp?.filter(x=>(x.url||'').includes('ruby-banner.jpg')||(x.bg||'').includes('ruby-banner.jpg')).at(-1);
  const firstLcpMs=firstPaint?.renderTime||firstPaint?.t||null;
  const posterCssMs=snap.timeline?.changes?.find(x=>x.state.poster&&x.state.moduleBg)?.t||null;
  const banner2Start=b2?.startMs??null,banner3Start=b3?.startMs??null,firstDownloadEnd=b1?.endMs??null;
  const resultSummary={
   device,cycle,http:result.http,ttfb:snap.ttfb,
   firstBanner:{start:b1?.startMs??null,end:firstDownloadEnd,priority:b1?.priority,
    cache:b1?.fromCache||false,bytes:b1?.encodedBytes??null},
   posterCssMs,firstLcpMs,
   laterBanners:[
    {slide:2,start:banner2Start,end:b2?.endMs??null},
    {slide:3,start:banner3Start,end:b3?.endMs??null}
   ],
   laterBeforeFirstNetworkComplete:[banner2Start,banner3Start].map(t=>t!==null&&firstDownloadEnd!==null?t<firstDownloadEnd:null),
   laterBeforeFirstLcp:[banner2Start,banner3Start].map(t=>t!==null&&firstLcpMs!==null?t<firstLcpMs:null),
   slideAPI:by('slide-API').map(x=>({start:x.startMs,end:x.endMs})),
   lcp:snap.timeline?.lcp?.slice(-10),lastModuleState:snap.timeline?.changes?.slice(-6),
   cssChanges:snap.timeline?.changes?.slice(0,7),
   srReady:snap.timeline?.ready,paints:snap.timeline?.paints,errors
  };
  result.summary=resultSummary;
  result.network=data;
  result.browser=snap;
  console.log('SR7_BANNER_TIMELINE '+JSON.stringify(resultSummary).slice(0,16000));
 }catch(e){
  result.error=String(e.stack||e).slice(0,1600);process.exitCode=1;
  console.log('SR7_BANNER_ERROR '+JSON.stringify({device,cycle,error:result.error}).slice(0,1800));
 }
 fs.writeFileSync(dir+'/case-'+cycle+'.json',JSON.stringify(result,null,2));
 await ctx.close();
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 try{for(let i=0;i<cycles;i++)await run(browser,i);}
 finally{await browser.close();}
})().catch(e=>{console.error('SR7_BANNER_FATAL '+String(e.stack||e));process.exitCode=1});
