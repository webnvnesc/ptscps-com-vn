'use strict';
/**
 * PTSCPS FCP mobile controlled A/B: unchanged SR7 vs native static-first-image.
 * Browser-only response interception; not a WordPress deployment.
 * Dynamic image comes from today's actual first-slide native preload/poster.
 */
const { chromium }=require('playwright');
const { load }=require('cheerio');
const fs=require('node:fs');
const BASE='https://ptscps.com.vn/';
const PAIRS=Number(process.env.FCP_PAIRS||6);
const OUT='ptscps-fcp-mobile-static-ab';
fs.mkdirSync(OUT,{recursive:true});
const round=x=>Number.isFinite(x)?Math.round(x):null;
const med=x=>{const a=x.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?(a[(a.length-1)>>1]+a[a.length>>1])/2:null};
function transform(html, mode){
 const $=load(html);
 const $module=$('sr7-module#SR7_1_1').first().length?
   $('sr7-module#SR7_1_1').first():$('sr7-module[data-id="1"]').first();
 const poster=$module.attr('data-ptscps-poster')||
   $('link[data-ptscps-sr7-first-preload]').first().attr('href')||
   $module.find('sr7-slide').first().find('noscript img').first().attr('src');
 if(!$module.length||!poster)throw Error('SR7 first native poster missing');
 const image=new URL(poster,BASE);
 if(image.origin!==new URL(BASE).origin||!image.pathname.startsWith('/wp-content/uploads/')||
   !/\.(?:jpg|jpeg|png|webp|avif)$/i.test(image.pathname))throw Error('Unexpected banner source');
 const chain=[];let node=$module;
 for(let i=0;i<4;i++){chain.push({tag:node[0]?.tagName||null,cls:node.attr('class'),id:node.attr('id')});
  node=node.parent();if(!node.length)break;}
 let scripts=0,styles=0,inline=0;
 if(mode==='static'){
  const imageHtml='<img id="ptscps-ab-static-hero" src="'+image.href.replaceAll('&','&amp;')+
   '" alt="Banner PTSCPS" fetchpriority="high" loading="eager" decoding="async"'+
   ' style="display:block;width:100%;height:auto;min-height:185px;aspect-ratio:1.95;object-fit:cover;border:0">';
  $module.replaceWith('<div class="ptscps-ab-static-holder" style="width:100%;display:block;overflow:hidden">'+
    imageHtml+'</div>');
  $('script[src]').each((i,el)=>{
   const src=$(el).attr('src')||'';
   if(/\/revslider\/|\/sr7(?:\.|\/)|\/rbtools\.min\.js|\/tptools\.min\.js/i.test(src)){
    scripts++;$(el).remove();
   }
  });
  $('link[rel~="stylesheet"][href]').each((i,el)=>{
   if(/\/revslider\/|\/sr7\.css/i.test($(el).attr('href')||'')){
    styles++;$(el).remove();
   }
  });
  $('script:not([src])').each((i,el)=>{
   const s=$(el).html()||'';
   if(/\bRS_MODULES\b|revslider|SR7_1_1|sr7\.js/i.test(s)){
    inline++;$(el).remove();
   }
  });
  $('head').append('<style data-ptscps-ab="static">'+
   '.ptscps-ab-static-holder{position:relative;width:100%;display:block;overflow:hidden}'+
   '.ptscps-ab-static-holder img{display:block;width:100%;max-width:100%;height:auto;aspect-ratio:1.95;object-fit:cover}'+
   '</style>');
 }
 return {html:$.html(),image:image.href,chain,removed:{scripts,styles,inline}};
}
async function once(browser,mode,cycle){
 const ctx=await browser.newContext({viewport:{width:412,height:850},isMobile:true,hasTouch:true,
  deviceScaleFactor:1,serviceWorkers:'block',
  userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'});
 const page=await ctx.newPage(),cdp=await ctx.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,
  downloadThroughput:210*1024,uploadThroughput:95*1024});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await page.addInitScript(()=>{
  window.__ptscpsAB={lcp:[],cls:[],longtasks:[]};
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>{
   window.__ptscpsAB.lcp.push({t:Math.round(e.startTime),url:e.url||null,
    tag:e.element?.tagName||null,id:e.element?.id||null});
  })).observe({type:'largest-contentful-paint',buffered:true});}catch{}
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>{
   if(!e.hadRecentInput)window.__ptscpsAB.cls.push(e.value);
  })).observe({type:'layout-shift',buffered:true});}catch{}
  try{new PerformanceObserver(l=>l.getEntries().forEach(e=>{
   window.__ptscpsAB.longtasks.push({t:Math.round(e.startTime),duration:Math.round(e.duration)});
  })).observe({type:'longtask',buffered:true});}catch{}
 });
 const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(String(e.message).slice(0,180)));
 cdp.on('Network.responseReceived',e=>{
  const u=e.response.url;
  if(!u.startsWith(BASE))return;
  if(/\/jannah\/assets\/css\/style\.min\.css|\/jquery\/jquery\.min\.js|\/revslider\/|\/ruby-banner\./i.test(u))
   requests.push({asset:u.slice(BASE.length).slice(0,180),
    protocol:e.response.protocol,http:e.response.status,
    headersMs:e.response.timing?.receiveHeadersEnd??null});
 });
 let patch=null;
 await page.route(BASE,async route=>{
  if(!route.request().isNavigationRequest())return route.continue();
  const r=await route.fetch({timeout:45000});
  const body=await r.text();
  patch=transform(body,mode);
  await route.fulfill({response:r,body:patch.html,contentType:'text/html; charset=utf-8'});
 });
 const row={mode,cycle};
 try{
  const response=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:70000});
  await page.waitForTimeout(4800);
  const info=await page.evaluate(mode=>{
   const nav=performance.getEntriesByType('navigation')[0];
   const fcp=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
   const el=document.querySelector(mode==='static'?'#ptscps-ab-static-hero':'sr7-module#SR7_1_1');
   const rect=el?.getBoundingClientRect();
   const img=mode==='static'?el:null;
   const resources=performance.getEntriesByType('resource');
   return {ttfb:round(nav?.responseStart||0),fcp:round(fcp?.startTime||0),
    lcp:window.__ptscpsAB.lcp.at(-1)||null,
    cls:window.__ptscpsAB.cls.reduce((a,b)=>a+b,0),
    longTaskBlockingProxy:window.__ptscpsAB.longtasks.reduce((a,b)=>a+Math.max(0,b.duration-50),0),
    hero:rect?{width:Math.round(rect.width),height:Math.round(rect.height),
       top:Math.round(rect.top),naturalWidth:img?.naturalWidth||null,
       complete:img?.complete||null,display:getComputedStyle(el).display}:null,
    styleCount:resources.filter(r=>/\.css(\?|$)/.test(r.name)).length,
    scriptCount:resources.filter(r=>/\.js(\?|$)/.test(r.name)).length,
    resourceCount:resources.length};
  },mode);
  Object.assign(row,{http:response.status(),...info,errors,requests});
  row.patch={image:patch?.image,removed:patch?.removed,chain:cycle===0?patch?.chain:undefined};
  row.valid=row.http===200&&row.fcp>0&&row.hero?.width>360&&row.hero?.height>165&&
    (!row.hero?.complete||row.hero.naturalWidth>100)&&row.cls<0.065;
 }catch(e){row.valid=false;row.error=String(e.message||e).slice(0,450);row.errors=errors;}
 fs.writeFileSync(OUT+'/'+cycle+'-'+mode+'.json',JSON.stringify(row,null,2));
 console.log('FCP_STATIC_AB_CASE '+JSON.stringify({cycle,mode,valid:row.valid,http:row.http,
  ttfb:row.ttfb,fcp:row.fcp,lcp:row.lcp,cls:row.cls,proxy:row.longTaskBlockingProxy,
  hero:row.hero,resources:row.resourceCount,scripts:row.scriptCount,
  styles:row.styleCount,removed:row.patch?.removed,errors:row.errors,
  error:row.error}).slice(0,3000));
 await ctx.close();
 return row;
}
async function main(){
 const b=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const rows=[];
 try{
  for(let i=0;i<PAIRS;i++){
   const order=i%2?['static','slider']:['slider','static'];
   for(const mode of order)rows.push(await once(b,mode,i));
  }
 }finally{await b.close();}
 const paired=Array.from({length:PAIRS},(_,i)=>{
  const slider=rows.find(x=>x.cycle===i&&x.mode==='slider');
  const stat=rows.find(x=>x.cycle===i&&x.mode==='static');
  return {cycle:i,valid:slider.valid&&stat.valid,
   fcpDelta:stat.fcp-slider.fcp,ttfbDelta:stat.ttfb-slider.ttfb,
   fcpPostTtfbDelta:(stat.fcp-stat.ttfb)-(slider.fcp-slider.ttfb),
   lcpDelta:(stat.lcp?.t||0)-(slider.lcp?.t||0),
   clsDelta:stat.cls-slider.cls,
   blockingProxyDelta:stat.longTaskBlockingProxy-slider.longTaskBlockingProxy};
 });
 const valid=paired.filter(x=>x.valid);
 const result={pairs:PAIRS,validPairs:valid.length,
  medFcpStaticMinusSlider:med(valid.map(x=>x.fcpDelta)),
  medFcpMinusTtfbStaticMinusSlider:med(valid.map(x=>x.fcpPostTtfbDelta)),
  medLcpStaticMinusSlider:med(valid.map(x=>x.lcpDelta)),
  medClsDelta:med(valid.map(x=>x.clsDelta)),
  medLongtaskProxyDelta:med(valid.map(x=>x.blockingProxyDelta)),
  countStaticFasterFCP:valid.filter(x=>x.fcpDelta<-100).length,
  countStaticSlowerFCP:valid.filter(x=>x.fcpDelta>100).length,
  paired,invalid:rows.filter(x=>!x.valid).map(x=>({mode:x.mode,cycle:x.cycle,
   error:x.error,hero:x.hero,errors:x.errors})),assetChanges:rows.find(x=>x.mode==='static')?.patch?.removed};
 fs.writeFileSync(OUT+'/summary.json',JSON.stringify(result,null,2));
 console.log('FCP_STATIC_AB_RESULT '+JSON.stringify(result).slice(0,14000));
 if(valid.length<Math.ceil(PAIRS*.65))process.exitCode=1;
}
main().catch(e=>{console.error('FCP_STATIC_AB_FATAL '+String(e.stack||e));process.exitCode=1});
