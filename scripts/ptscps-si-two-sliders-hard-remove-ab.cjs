'use strict';
/**
 * Controlled, production read-only four-way Lighthouse Speed Index A/B.
 * Use Chrome's default BrowserContext.route() to override only the top-level
 * document response in an isolated local Chrome. A fresh Chrome per measurement.
 * No extension (headless disabled extensions), no FTP, no WordPress modifications.
 * All external CSS/JS/images retain real URLs and network responses.
 *
 * visual exclusion ONLY: JS and asset downloads remain deliberately enabled.
 */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const {load}=require('cheerio');
const lighthouse=require.resolve('lighthouse/cli/index.js');
const device=process.env.PTSCPS_AB_DEVICE==='desktop'?'desktop':'mobile';
const cycles=Math.max(3,Math.min(7,Number(process.env.PTSCPS_HARD_CYCLES||5)));
const BASE='https://ptscps.com.vn/';
const dir='ptscps-hard-slider-ab-'+device;
const modes=['control','hardhero','hardcustomer','hardboth'];
fs.mkdirSync(dir,{recursive:true});
const median=arr=>{
 const a=arr.filter(Number.isFinite).sort((x,y)=>x-y);
 return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;
};
const stats=(rows,key)=>{
 const xs=rows.map(x=>x[key]).filter(Number.isFinite);
 return {n:xs.length,median:median(xs),min:xs.length?Math.min(...xs):null,max:xs.length?Math.max(...xs):null};
};
function patch(html,mode){
 const $=load(html);
 const hero=$('sr7-module#SR7_1_1').first();
 const customer=$('.elementor-element-1be3f74').first();
 const widgets=customer.find('img.swiper-slide-image').length;
 if(!hero.length||!customer.length||widgets<15)
   throw Error('Expected live hero and 15+ customer logo images, got '+JSON.stringify({
     hero:hero.length,customer:customer.length,logos:widgets
   }));
 const removeHero=mode==='hardhero'||mode==='hardboth';
 const removeCustomer=mode==='hardcustomer'||mode==='hardboth';
 const audit={mode,removeHero,removeCustomer,logosInitially:widgets,externalScripts:[],inlineScripts:[],
   stylesheets:[],preloads:[],heroTarget:null,customerTarget:null,remainingWidgets:0};
 if(removeHero){
   // Remove only the Elementor widget, rather than changing theme/whole page.
   let target=hero.closest('.elementor-widget');
   if(!target.length)target=hero.closest('sr7-module-wrap');
   if(!target.length)target=hero;
   audit.heroTarget={tag:target[0]?.tagName,class:String(target.attr('class')||'').slice(0,160),
     id:target.attr('id')||''};
   if(target.is('body,html,main,#content'))throw Error('Hero selection too broad');
   target.remove();
   $('link[data-ptscps-sr7-first-preload]').each((i,e)=>{
     audit.preloads.push($(e).attr('href')||'');$(e).remove();
   });
   $('script[src]').each((i,e)=>{
     const u=$(e).attr('src')||'';
     if(/\/revslider\/|\/sr7(?:\.|\/)|\/(?:rbtools|tptools)(?:\.min)?\.js/i.test(u)){
       audit.externalScripts.push(u.slice(0,180));$(e).remove();
     }
   });
   $('script:not([src])').each((i,e)=>{
     const v=$(e).html()||'';
     // SR7 inline module registry/init; never strip jQuery or generic Elementor.
     if(/\bRS_MODULES\b|\bSR7_1_1\b|\bRevSlider\b|\brevslider\b|\bsr7\.(?:js|init)|\btp\.jQuery\b/i.test(v)){
       audit.inlineScripts.push(v.slice(0,160));$(e).remove();
     }
   });
   $('link[rel~="stylesheet"][href]').each((i,e)=>{
     const u=$(e).attr('href')||'';
     if(/\/revslider\/|\/sr7(?:\.|\/)|\/revicons(?:\.|\/)/i.test(u)){
       audit.stylesheets.push(u.slice(0,180));$(e).remove();
     }
   });
   $('style[id]').each((i,e)=>{
     const id=$(e).attr('id')||'';
     // Remove only clearly slider-owned inline CSS tags (not Elementor page CSS).
     if(/^sr7-|^revslider-|^rs-plugin-/i.test(id)){
       audit.stylesheets.push('#'+id);$(e).remove();
     }
   });
 }
 if(removeCustomer){
   audit.customerTarget={tag:customer[0]?.tagName,
     class:String(customer.attr('class')||'').slice(0,160)};
   if(customer.is('body,html,main,#content'))throw Error('Customer selection too broad');
   customer.remove();
   $('link[rel~="stylesheet"][href]').each((i,e)=>{
     const u=$(e).attr('href')||'';
     if(/widget-image-carousel(?:\.min)?\.css/i.test(u)){
       audit.stylesheets.push(u.slice(0,180));$(e).remove();
     }
   });
 }
 // Control is subjected to same parse/serialize cost as every tested variant.
 $('head').prepend('<meta name="ptscps-hard-ab" content="'+mode+'">');
 audit.remainingWidgets=$('sr7-module#SR7_1_1').length+
   $('.elementor-element-1be3f74').length;
 const foundHero=$('sr7-module#SR7_1_1').length;
 const foundCustomer=$('.elementor-element-1be3f74').length;
 if(foundHero!==(removeHero?0:1)||foundCustomer!==(removeCustomer?0:1))
   throw Error('Incomplete widget removal '+JSON.stringify(audit));
 if(removeHero&&(audit.externalScripts.length<1||audit.inlineScripts.length<1||
   audit.preloads.length<1))
   throw Error('SR7 scripts/inline/preload removal incomplete '+JSON.stringify(audit));
 return {html:$.html(),audit};
}
async function run(mode,cycle,baseHtml){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ptscps-lh-'));
 const port=10000+((process.pid+cycle*19+modes.indexOf(mode)*23)%35000);
 let ctx=null,sessionBrowser=null,chromeProcess=null;
 const row={device,mode,cycle,port,fulfilled:0,network:[],errors:[]};
 const changed=patch(baseHtml,mode);
 row.patch=changed.audit;
 try{
  chromeProcess=spawn(chromium.executablePath(),[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check',
    '--user-data-dir='+profile,'--remote-debugging-port='+port,'about:blank'
  ],{stdio:'ignore'});
  let connected=false;
  for(let attempt=0;attempt<30;attempt++){
    if(chromeProcess.exitCode!==null)throw Error('Chrome exited before debugger ready '+chromeProcess.exitCode);
    try {
      const r=await fetch('http://127.0.0.1:'+port+'/json/version',
        {signal:AbortSignal.timeout(1200)});
      if(r.ok){connected=true;break;}
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,350));
  }
  if(!connected)throw Error('Chrome remote debugger port unavailable '+port);
  sessionBrowser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
  ctx=sessionBrowser.contexts()[0];
  if(!ctx)throw Error('CDP default BrowserContext unavailable');
  console.log('SLIDERS_AB_CDP_READY '+JSON.stringify({device,mode,cycle,port}));
  await ctx.route('https://ptscps.com.vn/**',async route=>{
    const req=route.request();
    const url=new URL(req.url());
    if(req.isNavigationRequest()&&req.resourceType()==='document'&&url.pathname==='/'){
      row.fulfilled++;
      await route.fulfill({status:200,headers:{
        'content-type':'text/html; charset=utf-8','cache-control':'no-store'},
        body:changed.html});
    }else await route.continue();
  });
  // Verify CSS treatment on a real Chrome page before running Lighthouse.
  const smoke=await ctx.newPage();
  const res=await smoke.goto(BASE,{waitUntil:'domcontentloaded',timeout:85000});
  const actual=await smoke.evaluate(()=>{
   const hero=document.querySelector('sr7-module#SR7_1_1');
   const cus=document.querySelector('.elementor-element-1be3f74');
   const root=document.querySelector('main, #main-content, #content');
   return {hero:!!hero,customer:!!cus,
    logoCount:cus?.querySelectorAll('img.swiper-slide-image').length||0,
    marker:document.querySelector('meta[name="ptscps-hard-ab"]')?.content||null,
    hasHeader:!!document.querySelector('header'),hasBody:!!document.body,
    content:!!root,docWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  await smoke.close();
  const expectH=mode==='hardhero'||mode==='hardboth';
  const expectC=mode==='hardcustomer'||mode==='hardboth';
  row.smoke={http:res.status(),actual};
  if(res.status()!==200||actual.marker!==mode||
    actual.hero===expectH||actual.customer===expectC||
    !actual.hasHeader||!actual.hasBody||actual.docWidth>actual.viewport+3){
    throw Error('Hard-removal HTML preflight failed: '+JSON.stringify(row.smoke));
  }
  console.log('SLIDERS_AB_SMOKE '+JSON.stringify({device,mode,cycle,http:res.status(),actual}));
  const output=path.join(dir,'lighthouse-'+cycle+'-'+mode+'.json');
  const flags=[
   lighthouse,BASE,'--port='+port,'--only-categories=performance',
   '--output=json','--output-path='+output,'--quiet',
   '--max-wait-for-load=60000',
   '--disable-storage-reset'
  ];
  if(device==='desktop')flags.push('--preset=desktop');
  // IMPORTANT: never use execFileSync here. The Playwright route handler
  // needs Node's event loop to fulfill Lighthouse's document navigation.
  const cli=spawn(process.execPath,flags,{
    env:{...process.env,CHROME_PATH:chromium.executablePath()},
    stdio:['ignore','pipe','pipe']
  });
  let stderr='',stdout='',startError=null,timedOut=false;
  const status=await new Promise(resolve=>{
    const timeout=setTimeout(()=>{timedOut=true;cli.kill('SIGKILL')},160000);
    cli.stdout.on('data',b=>{stdout=(stdout+String(b)).slice(-4500)});
    cli.stderr.on('data',b=>{stderr=(stderr+String(b)).slice(-4500)});
    cli.on('error',e=>{startError=String(e)});
    cli.on('close',(code,signal)=>{clearTimeout(timeout);resolve({code,signal})});
  });
  if(timedOut||status.code!==0||startError)throw Error(
    'Lighthouse child failed '+JSON.stringify({status,timedOut,startError,stderr:stderr.slice(-2400),stdout:stdout.slice(-500)})
  );
  const j=JSON.parse(fs.readFileSync(output,'utf8'));
  const get=id=>j.audits?.[id]?.numericValue??null;
  const requests=j.audits?.['network-requests']?.details?.items||[];
  const originAsset=(re)=>requests.filter(x=>re.test(x.url||''));
  row.network={
    allRequests:requests.length,
    transferBytes:Math.round(requests.reduce((total,x)=>total+(x.transferSize||0),0)),
    sr7Scripts:originAsset(/\/(?:revslider\/|sr7\.js|rbtools\.min\.js|tptools\.min\.js).*(?:\.js|\.mjs)/i)
      .map(x=>(x.url||'').split('?')[0]).slice(0,8),
    sr7Css:originAsset(/\/revslider\/.*\.css(?:\?|$)/i)
      .map(x=>(x.url||'').split('?')[0]).slice(0,8),
    bannerImages:originAsset(/\/(?:ruby-banner|banner2|banner3)\.(?:jpe?g|png|webp)/i)
      .map(x=>(x.url||'').split('?')[0]).slice(0,8),
    customerImages:originAsset(/\/(?:pps-doi-tac-|logo_(?:NSRP|Hoang|Rosneft|Knoc)|harbour-logo)/i).length
  };
  // Hard hero must also stop native SR7 JS and banner-1 preload transfers.
  if((mode==='hardhero'||mode==='hardboth')&&
      (row.network.sr7Scripts.length||row.network.bannerImages.length)){
    throw Error('Unexpected SR7 resource remained in hard-removed arm: '+JSON.stringify(row.network));
  }
  Object.assign(row,{
   ok:Number.isFinite(get('speed-index')),
   score:Math.round((j.categories?.performance?.score??0)*100),
   si:Math.round(get('speed-index')||0),fcp:Math.round(get('first-contentful-paint')||0),
   lcp:Math.round(get('largest-contentful-paint')||0),
   tbt:Math.round(get('total-blocking-time')||0),cls:get('cumulative-layout-shift'),
   ttfb:get('server-response-time'),version:j.lighthouseVersion,
   finalUrl:j.finalUrl,warning:j.runWarnings?.slice(0,3)||[]
  });
  // Critical: ensure Lighthouse actually navigated through interception,
  // not merely smoke preflight. Otherwise reject unmodified baseline scores.
  if(row.fulfilled<2||!row.ok||!row.si||row.finalUrl?.replace(/\/$/,'')!==BASE.replace(/\/$/,'')){
    throw Error('Lighthouse did not use patched HTML or result invalid: '+JSON.stringify(row));
  }
  console.log('SLIDERS_AB_LH_CASE '+JSON.stringify({device,mode,cycle,si:row.si,score:row.score,fcp:row.fcp,lcp:row.lcp,tbt:row.tbt,cls:row.cls,network:row.network,patch:row.patch,fulfilled:row.fulfilled}).slice(0,3500));
 }catch(e){
  row.ok=false;row.error=String(e.stderr||e.stack||e).slice(-1900);
  console.log('SLIDERS_AB_LH_ERROR '+JSON.stringify(row).slice(0,3200));
 }finally{
  try{await sessionBrowser?.close()}catch{}
  if(chromeProcess&&!chromeProcess.killed)chromeProcess.kill('SIGTERM');
  await new Promise(resolve=>setTimeout(resolve,180));
  fs.rmSync(profile,{recursive:true,force:true});
 }
 return row;
}
(async()=>{
 const prep=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 let html;
 try{
  const req=await prep.newContext();
  try{
   const r=await req.request.get(BASE,{timeout:55000});
   if(r.status()!==200)throw Error('Origin HTML '+r.status());
   html=await r.text();
  }finally{await req.close()}
 }finally{await prep.close()}
 for(const mode of modes)patch(html,mode);
 const rows=[];
 const rotated=[
  ['control','hardhero','hardcustomer','hardboth'],
  ['hardboth','hardcustomer','hardhero','control'],
  ['hardcustomer','control','hardboth','hardhero'],
  ['hardhero','hardboth','control','hardcustomer'],
  ['control','hardcustomer','hardhero','hardboth'],
  ['hardboth','hardhero','hardcustomer','control'],
  ['hardcustomer','hardboth','control','hardhero']
 ];
 for(let i=0;i<cycles;i++){
  for(const mode of rotated[i]){
   let row=null;
   for(let attempt=1;attempt<=3;attempt++){
     row=await run(mode,i+1,html);
     row.attempt=attempt;
     if(row.ok)break;
     // A transient NO_FCP or browser startup failure is a measurement
     // failure, never evidence of site performance. Retry same paired arm.
     console.log('SLIDERS_HARD_AB_RETRY '+JSON.stringify({device,cycle:i+1,mode,attempt,error:row.error?.slice(0,280)}));
     if(attempt<3)await new Promise(resolve=>setTimeout(resolve,1200));
   }
   rows.push(row);
   fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(rows,null,2));
   if(!row.ok)throw Error('Three invalid measurements for '+mode+': '+(row.error||''));
  }
 }
 const valid=rows.filter(x=>x.ok);
 const paired=[];
 for(let i=1;i<=cycles;i++){
  const base=valid.find(x=>x.cycle===i&&x.mode==='control');
  for(const mode of modes.filter(x=>x!=='control')){
   const other=valid.find(x=>x.cycle===i&&x.mode===mode);
   if(base&&other)paired.push({cycle:i,mode,
    deltaSI:other.si-base.si,deltaScore:other.score-base.score,
    deltaFCP:other.fcp-base.fcp,deltaLCP:other.lcp-base.lcp,
    deltaCLS:other.cls-base.cls,deltaTBT:other.tbt-base.tbt});
  }
 }
 const modesSummary=modes.map(mode=>{
  const own=valid.filter(x=>x.mode===mode);
  const pairs=paired.filter(x=>x.mode===mode);
  return {mode,samples:own.length,si:stats(own,'si'),
   score:stats(own,'score'),fcp:stats(own,'fcp'),lcp:stats(own,'lcp'),
   tbt:stats(own,'tbt'),cls:stats(own,'cls'),
   pairedSI:stats(pairs,'deltaSI'),pairedScore:stats(pairs,'deltaScore'),
   pairedFCP:stats(pairs,'deltaFCP'),pairedLCP:stats(pairs,'deltaLCP'),
   siLower250:pairs.filter(x=>x.deltaSI<=-250).length,
   networkSamples:own.map(x=>x.network)};
 });
 const summary={device,cycles,success:valid.length,expected:cycles*4,
  modes:modesSummary,pairs:paired,
  caveat:'Lighthouse uses a browser-local intercepted HTML copy of same live homepage. Native SR7 HTML, script URLs, initializer, preload and exclusive CSS are removed in hardhero/hardboth; customer widget markup and carousel-specific CSS are removed in hardcustomer/hardboth. Elementor/Swiper shared assets, theme, plugins and WordPress data remain. HTML TTFB is equalized via route.fulfill, not real production TTFB. Lighthouse SI can have large variance; compare paired deltas rather than treating these absolute times as PSI production.'};
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));
 console.log('SLIDERS_AB_SUMMARY '+JSON.stringify(summary).slice(0,24000));
 if(valid.length!==cycles*4)process.exitCode=1;
})().catch(e=>{console.error('SLIDERS_AB_FATAL '+String(e.stack||e));process.exitCode=1;});
