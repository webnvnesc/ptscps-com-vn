'use strict';
/**
 * PTSCPS SR7 first poster A/B.
 * A: original native slider+poster; B: identical slider plus
 * CSS first image overlay until SR7 ready. No production modification.
 * FCP and LCP are Chrome performance timings. The "visual" fields are
 * screenshot pixel occupancy proxies, NOT Lighthouse Speed Index.
 */
const {chromium}=require('playwright');
const {load}=require('cheerio');
const jpeg=require('jpeg-js');
const fs=require('node:fs');
const {performance:clock}=require('node:perf_hooks');
const BASE='https://ptscps.com.vn/';
const PAIRS=Math.max(3,Math.min(6,Number(process.env.CANVAS_PAIRS||4)));
const OUT='ptscps-sr7-canvas-poster-ab';
fs.mkdirSync(OUT,{recursive:true});
const median=arr=>{
 const a=arr.filter(Number.isFinite).sort((x,y)=>x-y);
 return a.length?(a[(a.length-1)>>1]+a[a.length>>1])/2:null;
};
const ms=n=>Number.isFinite(n)?Math.round(n):null;
function prepare(html,variant){
 const $=load(html,{decodeEntities:false});
 const m=$('sr7-module#SR7_1_1').first();
 if(m.length!==1)throw Error('SR7 module missing in homepage HTML');
 const raw=m.attr('data-ptscps-poster') || $('link[data-ptscps-sr7-first-preload]').attr('href');
 const src=new URL(raw,BASE);
 if(src.origin!==new URL(BASE).origin||
   !src.pathname.startsWith('/wp-content/uploads/')||
   !/\.(?:jpg|jpeg|webp|avif|png)$/i.test(src.pathname))throw Error('Invalid native first-slide image');
 const first=m.find('sr7-slide').first().attr('data-key')||'1';
 if(variant==='B'){
  m.addClass('ptscps-ab-first-overlay');
  const css='#SR7_1_1.ptscps-ab-first-overlay:not(.ptscps-ab-done)::before'+
    '{content:"";position:absolute;inset:0;z-index:9998;pointer-events:none;'+
    'display:block;opacity:1;background-image:url("'+src.href+'");'+
    'background-repeat:no-repeat;background-position:center center;background-size:cover}'+
    '#SR7_1_1.ptscps-ab-done::before{content:none!important;display:none!important}';
  $('head').prepend('<style id="ptscps-ab-poster-css">'+css+'</style>');
  const js=[
   '(function(){',
   'var first='+JSON.stringify(first)+',done=false;',
   'function release(reason){',
   'if(done)return;var m=document.getElementById("SR7_1_1");if(!m)return;',
   'done=true;m.classList.add("ptscps-ab-done");',
   'm.setAttribute("data-ptscps-ab-end",reason);',
   'window.__abHandoff={t:Math.round(performance.now()),reason:reason};}',
   'document.addEventListener("sr.module.ready",function(){',
   'requestAnimationFrame(function(){requestAnimationFrame(function(){release("sr.module.ready")})})',
   '},{capture:true,once:true});',
   'document.addEventListener("DOMContentLoaded",function(){',
   'var m=document.getElementById("SR7_1_1");if(!m)return;',
   'new MutationObserver(function(){var now=m.getAttribute("data-current");',
   'if(now&&now!==first)release("slide-changed");',
   '}).observe(m,{attributes:true,attributeFilter:["data-current"]});',
   '},{once:true});',
   'setTimeout(function(){release("timeout-9s")},9000);',
   '})();'
  ].join('');
  $('head').prepend('<script id="ptscps-ab-handoff-js">'+js+'</script>');
 }
 return {html:$.html(),image:src.href,first};
}
function coverage(buf,rect){
 const im=jpeg.decode(buf,{useTArray:true});
 let all=0,allNonwhite=0,hero=0,heroNonwhite=0,heroBlue=0;
 const left=Math.max(0,Math.round(rect?.left||10));
 const top=Math.max(0,Math.round(rect?.top||103));
 const right=Math.min(im.width,left+Math.round(rect?.width||392));
 const bottom=Math.min(im.height,top+Math.round(rect?.height||212));
 for(let y=0;y<im.height;y+=7)for(let x=0;x<im.width;x+=7){
  const i=(y*im.width+x)*4,r=im.data[i],g=im.data[i+1],b=im.data[i+2];
  const n=r<235||g<235||b<235;
  all++;if(n)allNonwhite++;
  if(x>=left&&x<right&&y>=top&&y<bottom){
   hero++;if(n)heroNonwhite++;
   if(b>r+25&&b>g+8)heroBlue++;
  }
 }
 return {all:all?allNonwhite/all:0,hero:hero?heroNonwhite/hero:0,
  heroBlue:hero?heroBlue/hero:0};
}
function visual(frames,rect){
 const data=[];
 for(const f of frames.filter((x,i)=>i%4===0&&x.t>=0&&x.t<=7000)){
  try{data.push({t:f.t,values:coverage(f.data,rect)});}catch{}
 }
 const maxAll=Math.max(0,...data.map(x=>x.values.all));
 const maxHero=Math.max(0,...data.map(x=>x.values.hero));
 const first=(key,maximum)=>{
  const f=data.find(x=>x.values[key]>=maximum*.8);
  return f?ms(f.t):null;
 };
 let area=0,lastT=0,lastFraction=0;
 for(const f of data){
  area+=(f.t-lastT)*Math.max(0,1-lastFraction/(maxAll||1));
  lastT=f.t;lastFraction=f.values.all;
 }
 return {n:data.length,maxViewportNonwhite:+maxAll.toFixed(3),
  maxHeroNonwhite:+maxHero.toFixed(3),
  viewport80Ms:first('all',maxAll),hero80Ms:first('hero',maxHero),
  nonwhiteAreaMs:ms(area)};
}
async function run(browser,html,variant,cycle){
 const ctx=await browser.newContext({viewport:{width:412,height:850},isMobile:true,
  hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',
  userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'});
 const p=await ctx.newPage(),cdp=await ctx.newCDPSession(p);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,
  downloadThroughput:210*1024,uploadThroughput:95*1024});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 const frames=[],errors=[],assets=[];
 let started=0;
 p.on('pageerror',e=>errors.push(String(e.message).slice(0,190)));
 cdp.on('Page.screencastFrame',e=>{
  if(started>0&&frames.length<180)
   frames.push({t:ms(clock.now()-started),data:Buffer.from(e.data,'base64')});
  cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});
 });
 cdp.on('Network.responseReceived',e=>{
  const u=e.response.url;
  if(u.startsWith(BASE)&&/ruby-banner\.jpg|banner2\.jpg|banner3\.jpg/.test(u))
   assets.push({src:u.slice(BASE.length),http:e.response.status,protocol:e.response.protocol});
 });
 await p.addInitScript(()=>{
  window.__sr7Test={lcp:[],cls:[],ready:[],tasks:[]};
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>{
   window.__sr7Test.lcp.push({t:Math.round(e.startTime),render:Math.round(e.renderTime||0),
     url:e.url||null,tag:e.element?.localName||null,id:e.element?.id||null});
  })).observe({type:'largest-contentful-paint',buffered:true});}catch{}
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>{
   if(!e.hadRecentInput)window.__sr7Test.cls.push(e.value)
  })).observe({type:'layout-shift',buffered:true});}catch{}
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>{
   window.__sr7Test.tasks.push(Math.max(0,e.duration-50))
  })).observe({type:'longtask',buffered:true});}catch{}
  document.addEventListener('sr.module.ready',()=>window.__sr7Test.ready.push(Math.round(performance.now())),true);
 });
 const patched=prepare(html,variant);
 await p.route(BASE,route=>route.request().isNavigationRequest()?
   route.fulfill({status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'},body:patched.html}):
   route.continue());
 const row={variant,cycle,image:new URL(patched.image).pathname,errors};
 try{
  await cdp.send('Page.enable');
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:55,maxWidth:412,maxHeight:850,everyNthFrame:1});
  started=clock.now();
  const response=await p.goto(BASE,{waitUntil:'domcontentloaded',timeout:72000});
  row.http=response.status();
  await p.waitForTimeout(cycle===0?11500:7500);
  const info=await p.evaluate(()=>{
   const nav=performance.getEntriesByType('navigation')[0];
   const fcp=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
   const m=document.querySelector('#SR7_1_1');
   const rect=m?.getBoundingClientRect();
   const slides=m?[...m.querySelectorAll('sr7-slide')].slice(0,3).map(s=>({
    key:s.getAttribute('data-key'),display:getComputedStyle(s).display,
    canvas:s.querySelectorAll('canvas[data-use-for="BGContentImage"]').length
   })):[];
   return {ttfb:Math.round(nav?.responseStart||0),fcp:Math.round(fcp?.startTime||0),
    lcp:window.__sr7Test.lcp.at(-1)||null,
    cls:window.__sr7Test.cls.reduce((a,b)=>a+b,0),
    longTaskProxy:Math.round(window.__sr7Test.tasks.reduce((a,b)=>a+b,0)),
    ready:window.__sr7Test.ready,handoff:window.__abHandoff||null,
    dimensions:rect?{left:Math.round(rect.left),top:Math.round(rect.top),
      width:Math.round(rect.width),height:Math.round(rect.height)}:null,
    module:m?{current:m.getAttribute('data-current'),
     pseudoBg:getComputedStyle(m,'::before').backgroundImage.slice(0,170),
     pseudoDisplay:getComputedStyle(m,'::before').display,
     computedBg:getComputedStyle(m).backgroundImage.slice(0,170),slides}:null,
    styleInjected:!!document.querySelector('#ptscps-ab-poster-css'),
    viewportWidth:innerWidth,docWidth:document.documentElement.scrollWidth};
  });
  Object.assign(row,info,{assets,filmFrames:frames.length});
  await cdp.send('Page.stopScreencast');
  row.visual=visual(frames,row.dimensions);
  if(cycle===0){
   const best=[];
   for(const goal of [300,1200,2500,4000,6000,9000]){
    const f=frames.reduce((acc,x)=>Math.abs(x.t-goal)<Math.abs((acc?.t??1e9)-goal)?x:acc,null);
    if(f&&Math.abs(f.t-goal)<550&&!best.includes(f))best.push(f);
   }
   for(let i=0;i<best.length;i++)
    fs.writeFileSync(OUT+'/'+variant+'-frame-'+i+'-'+best[i].t+'.jpg',best[i].data);
  }
  row.valid=row.http===200&&row.fcp>0&&row.dimensions?.width>=360&&
   row.dimensions?.height>=180&&row.dimensions?.height<=420&&
   row.docWidth<=413&&row.cls<0.08&&row.visual.n>=4&&
   (variant==='B'?row.styleInjected:!row.styleInjected);
 }catch(err){
  row.valid=false;row.error=String(err.stack||err).slice(0,480);
  try{await cdp.send('Page.stopScreencast');}catch{}
 }
 await ctx.close();
 fs.writeFileSync(OUT+'/'+cycle+'-'+variant+'.json',JSON.stringify(row,null,2));
 console.log('CANVAS_AB_CASE '+JSON.stringify({
  variant,cycle,valid:row.valid,fcp:row.fcp,ttfb:row.ttfb,
  lcp:row.lcp?.t,cls:row.cls,proxy:row.longTaskProxy,
  visual:row.visual,module:row.module,ready:row.ready,
  handoff:row.handoff,assets:row.assets,errors:row.errors,error:row.error
 }).slice(0,5200));
 return row;
}
async function main(){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const rows=[];
 try{
  const context=await browser.newContext();
  let html;
  try{
   const r=await context.request.get(BASE,{timeout:60000});
   if(r.status()!==200)throw Error('Source homepage HTTP '+r.status());
   html=await r.text();
  }finally{await context.close();}
  const a=prepare(html,'A'),b=prepare(html,'B');
  if(a.image!==b.image)throw Error('A and B first image mismatch');
  console.log('CANVAS_AB_SETUP '+JSON.stringify({firstImage:new URL(a.image).pathname,
   firstSlide:a.first,htmlBytes:Buffer.byteLength(html)}));
  for(let cycle=0;cycle<PAIRS;cycle++){
   for(const variant of (cycle%2?['B','A']:['A','B']))
    rows.push(await run(browser,html,variant,cycle));
  }
 }finally{await browser.close()}
 const pairs=Array.from({length:PAIRS},(_,i)=>{
  const a=rows.find(x=>x.cycle===i&&x.variant==='A');
  const b=rows.find(x=>x.cycle===i&&x.variant==='B');
  return {cycle:i,valid:!!(a?.valid&&b?.valid),
   fcpDelta:b?.fcp-a?.fcp,lcpDelta:(b?.lcp?.t??0)-(a?.lcp?.t??0),
   postTTFBDelta:(b?.fcp-b?.ttfb)-(a?.fcp-a?.ttfb),
   visualAreaDelta:b?.visual?.nonwhiteAreaMs-a?.visual?.nonwhiteAreaMs,
   hero80Delta:b?.visual?.hero80Ms-a?.visual?.hero80Ms,
   clsDelta:b?.cls-a?.cls,bHandoff:b?.handoff||null,
   aFCP:a?.fcp,bFCP:b?.fcp,aLCP:a?.lcp?.t,bLCP:b?.lcp?.t,
   aVisual:a?.visual,bVisual:b?.visual};
 });
 const good=pairs.filter(x=>x.valid);
 const sum={pairs:PAIRS,valid:good.length,
  medianBminusA_FCP:median(good.map(x=>x.fcpDelta)),
  medianBminusA_LCP:median(good.map(x=>x.lcpDelta)),
  medianBminusA_visualAreaProxy:median(good.map(x=>x.visualAreaDelta)),
  medianBminusA_hero80:median(good.map(x=>x.hero80Delta)),
  medianBminusA_CLS:median(good.map(x=>x.clsDelta)),
  bFCPFaster100ms:good.filter(x=>x.fcpDelta<=-100).length,
  bLCPFaster100ms:good.filter(x=>x.lcpDelta<=-100).length,
  bHandoffs:rows.filter(x=>x.variant==='B').map(x=>x.handoff?.reason||null),
  note:'Visual-area is a screenshot nonwhite proxy and NOT a Lighthouse Speed Index. Both arms use the same HTML and real CSS/JS/image over HTTP/2 with mobile throttling.',
  invalid:rows.filter(x=>!x.valid||x.errors.length).map(x=>({
   cycle:x.cycle,variant:x.variant,error:x.error,errors:x.errors,
   cls:x.cls,visual:x.visual})),paired:pairs};
 fs.writeFileSync(OUT+'/summary.json',JSON.stringify(sum,null,2));
 console.log('CANVAS_AB_SUMMARY '+JSON.stringify(sum).slice(0,24000));
 if(good.length<Math.ceil(PAIRS*.75))process.exitCode=1;
}
main().catch(e=>{console.error('CANVAS_AB_FATAL '+String(e.stack||e));process.exitCode=1});
