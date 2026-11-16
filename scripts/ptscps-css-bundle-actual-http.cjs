'use strict';
const {chromium}=require('playwright');
const {gzipSync}=require('node:zlib');
const fs=require('node:fs');
const SITE='https://ptscps.com.vn/';
const BUNDLE_URL=SITE+'wp-content/themes/jannah-child/ptscps-css-bundle-audit-20261116.css';
const WIDTH=Number(process.env.TEST_WIDTH||412);
const CYCLES=Number(process.env.TEST_CYCLES||5);
const MODE=process.env.TEST_MODE||'fixed';

const HANDLES=['tie-css-base','tie-css-styles','tie-css-widgets','tie-css-helpers','tie-fontawesome5','tie-css-ilightbox','tie-css-single'];
const GROUPS={control:[],bundle6:HANDLES.slice(0,6)};
const outDir='bundle-repeat-results';
fs.mkdirSync(outDir,{recursive:true});
const attr=(tag,name)=>{
  const regex=new RegExp('\\b'+name+'\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))','i');
  const m=regex.exec(tag);return m?(m[1]||m[2]||m[3]):'';
};
function links(html){
  return [...html.matchAll(/<link\b[^>]*>/gi)].filter(m=>/stylesheet/i.test(attr(m[0],'rel')))
    .map(m=>({id:attr(m[0],'id'),href:attr(m[0],'href').replaceAll('&amp;','&'),
      media:attr(m[0],'media'),start:m.index,end:m.index+m[0].length,
      handle:HANDLES.find(h=>attr(m[0],'id')===h+'-css')||null}));
}
function canBundle(html,list,group){
  const found=group.map(h=>list.find(l=>l.handle===h));
  if(found.some(x=>!x))return {ok:false,why:'One or more missing WordPress style handles'};
  const indexes=found.map(l=>list.indexOf(l));
  if(indexes.some((x,i)=>i>0&&x!==indexes[i-1]+1))return {ok:false,why:'CSS not consecutive'};
  if(found.some(x=>x.media && x.media!=='all'))return {ok:false,why:'Different stylesheet media'};
  for(let i=1;i<found.length;i++){
    if(/<link\b|<style\b/i.test(html.slice(found[i-1].end,found[i].start)))return {ok:false,why:'Intervening stylesheet or inline rules'};
  }
  return {ok:true,found};
}
function rebaseCss(css,url){
  return css.replace(/url\(\s*(?:(["'])(.*?)\1|([^)]*))\s*\)/gi,(s,q,qvalue,plain)=>{
    const value=(qvalue===undefined?plain:qvalue||'').trim();
    if(!value||/^(?:data:|https?:|\/\/|#|blob:|about:)/i.test(value))return s;
    try{return 'url("'+new URL(value,url).href+'")'}catch{return s}
  });
}
function stats(array){
  const a=[...array].sort((x,y)=>x-y);
  if(!a.length)return null;
  const mid=Math.floor(a.length/2);
  return {n:a.length,median:a.length%2?a[mid]:(a[mid-1]+a[mid])/2,
    mean:Math.round(a.reduce((x,y)=>x+y,0)/a.length),
    min:a[0],max:a[a.length-1],values:a};
}
function permutation(seed){
  const a=Object.keys(GROUPS);
  let s=(seed+3)*65537+WIDTH*13;
  for(let i=a.length-1;i>0;i--){s=(1664525*s+1013904223)>>>0;const j=s%(i+1);
    [a[i],a[j]]=[a[j],a[i]];}
  return a;
}
async function run(browser,html,styleLinks,bundles,cycle,groupName,index){
  const group=GROUPS[groupName],bundle=bundles[groupName];
  const label=MODE+'-'+WIDTH+'-c'+cycle+'-'+groupName;
  const ctx=await browser.newContext({viewport:{width:WIDTH,height:WIDTH<768?823:900},
    isMobile:WIDTH<768,hasTouch:WIDTH<768,deviceScaleFactor:WIDTH<768?1.75:1,locale:'vi-VN'});
  const page=await ctx.newPage();const pageErrors=[],netErrors=[];let modified=false,cssServed=false;
  page.on('pageerror',e=>pageErrors.push(String(e.message).slice(0,180)));
  page.on('console',m=>{if(m.type()==='error')netErrors.push(m.text().slice(0,150))});
  await ctx.route('**/__ptscps_test_bundle_*.css',async route=>{
    cssServed=true;
    const delayMs=150+Math.ceil(bundle.gzipBytes/(205*1024)*1000);
    await new Promise(ok=>setTimeout(ok,delayMs));
    await route.fulfill({status:200,contentType:'text/css; charset=utf-8',
      body:bundle.css,headers:{'cache-control':'no-store'}});
  });
  await page.route(SITE,async route=>{
    let body;
    let headers={};
    if(MODE==='fixed'){
      body=html;
      await new Promise(ok=>setTimeout(ok,500)); // stabilized HTML TTFB; public snapshot
    }else{
      const res=await route.fetch({timeout:65000});
      body=await res.text();
      headers=res.headers();
    }
    if(group.length){
      const current=links(body),check=canBundle(body,current,group);
      if(!check.ok){throw Error('Failed page-specific bundle guard: '+check.why)}
      let inserted=false,actualCount=0;
      body=body.replace(/<link\b[^>]*>/gi,tag=>{
        const key=HANDLES.find(h=>attr(tag,'id')===h+'-css');
        if(!group.includes(key))return tag;
        actualCount++;
        if(!inserted){
          inserted=true;
          return '<link rel="stylesheet" id="ptscps-test-bundle-css" href="'+BUNDLE_URL+'">';
        }
        return '<!-- substituted in local browser bundle -->';
      });
      modified=actualCount===group.length;
    }
    await route.fulfill({status:200,headers:{'content-type':'text/html; charset=utf-8',...headers},body});
  });
  await page.addInitScript(()=>{
    window.__cls=[];
    try{new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput)window.__cls.push({start:e.startTime,value:e.value})}}).observe({type:'layout-shift',buffered:true})}catch(e){}
  });
  const cdp=await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:205*1024,uploadThroughput:100*1024});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  let result={label,MODE,WIDTH,cycle,groupName,index};
  try{
    const res=await page.goto(SITE,{waitUntil:'domcontentloaded',timeout:80000});
    await page.waitForTimeout(3800);
    const perf=await page.evaluate(()=>{
      const n=performance.getEntriesByType('navigation')[0],
      fcp=performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint');
      const geometry={};
      for(const sel of ['#main-nav','.logo','.elementor-element-77137dd','.elementor-element-920fc5e',
             '.elementor-widget-image-carousel','.elementor-element-a34b2bb','footer']){
        const el=document.querySelector(sel);
        if(!el){geometry[sel]=null;continue}
        const r=el.getBoundingClientRect(),s=getComputedStyle(el);
        geometry[sel]={x:Math.round(r.x),y:Math.round(r.y),h:Math.round(r.height),
          w:Math.round(r.width),font:s.fontFamily,display:s.display};
      }
      return {ttfb:Math.round(n.responseStart),fcp:Math.round(fcp?.startTime||0),
        cls:window.__cls.reduce((s,e)=>s+e.value,0),geometry,
        sliderReady:!!document.querySelector('sr7-module#SR7_1_1'),
        actualBundleLoaded:performance.getEntriesByType('resource').some(x=>x.name.includes('ptscps-css-bundle-audit-20261116.css')),
        bodyClass:document.body.className,
        assets:[...document.querySelectorAll('link[rel=stylesheet]')].filter(e=>/tie-css-|tie-fontawesome|ptscps-test-bundle/.test(e.id)).map(e=>e.id)};
    });
    result={...result,http:res.status(),...perf,
      fcpLessTTFB:perf.fcp-perf.ttfb,modified,cssServed:perf.actualBundleLoaded,pageErrors:pageErrors.slice(0,5),
      netErrors:netErrors.slice(0,5)};
    if(cycle===0){
      await page.screenshot({path:outDir+'/'+label+'-top.png',animations:'disabled'});
    }
    if(cycle===0 && ['control','bundle4','bundle7'].includes(groupName)){
      // Capture below-the-fold layout for manual inspection; do not navigate away.
      await page.evaluate(()=>window.scrollTo(0,1000));
      await page.waitForTimeout(250);
      await page.screenshot({path:outDir+'/'+label+'-below.png',animations:'disabled'});
    }
  }catch(e){result.error=String(e.stack||e).slice(0,600);process.exitCode=1}
  await ctx.close();
  fs.writeFileSync(outDir+'/'+label+'.json',JSON.stringify(result,null,2));
  console.log('SAMPLE '+JSON.stringify({
    label,cycle,variant:groupName,mode:MODE,width:WIDTH,ttfb:result.ttfb,fcp:result.fcp,
    gap:result.fcpLessTTFB,cls:result.cls,modified,cssServed,
    sliderH:result.geometry?.['.elementor-element-77137dd']?.h,
    introY:result.geometry?.['.elementor-element-920fc5e']?.y,
    pageErrors:result.pageErrors,netErrors:result.netErrors,error:result.error
  }));
  return result;
}
async function main(){
  const browser=await chromium.launch({headless:true});
  try{
    const setup=await browser.newContext();
    const pageRes=await setup.request.get(SITE,{timeout:60000});
    if(!pageRes.ok())throw Error('Unable to retrieve public homepage');
    const html=await pageRes.text(),list=links(html);
    console.log('STYLE_ORDER '+JSON.stringify(list.filter(l=>l.handle).map(l=>({handle:l.handle,id:l.id,href:l.href,media:l.media}))));
    const textByHandle={};
    for(const entry of list.filter(l=>l.handle)){
      const r=await setup.request.get(new URL(entry.href,SITE).href,{timeout:45000});
      if(!r.ok())throw Error('CSS fetch failed '+entry.handle+' '+r.status());
      textByHandle[entry.handle]=await r.text();
    }
    const bundles={};
    for(const [name,group] of Object.entries(GROUPS)){
      if(!group.length)continue;
      const check=canBundle(html,list,group);
      if(!check.ok){console.log('REJECT '+JSON.stringify({name,reason:check.why}));continue}
      const css=check.found.map(x=>'/* '+x.handle+' */\n'+rebaseCss(textByHandle[x.handle],new URL(x.href,SITE).href)).join('\n');
      if(/@import\s/i.test(css)){console.log('REJECT '+JSON.stringify({name,reason:'@import needs handling'}));continue}
      bundles[name]={css,gzipBytes:gzipSync(css).length,originalBytes:Buffer.byteLength(css)};
      console.log('BUNDLE '+JSON.stringify({name,count:group.length,
        gzip:bundles[name].gzipBytes,raw:bundles[name].originalBytes,
        requestsSaved:group.length-1}));
    }
    await setup.close();
    // A missing advanced bundle is an explicit safe stop; never bundle across a print-media link.
    if(!bundles.bundle4)throw Error('Cannot safely bundle four primary Jannah styles');
    const names=['control',...Object.keys(bundles)];
    const results=[];
    for(let c=0;c<CYCLES;c++){
      const turn=permutation(c).filter(x=>names.includes(x));
      console.log('CYCLE '+JSON.stringify({cycle:c,order:turn}));
      for(let i=0;i<turn.length;i++)results.push(await run(browser,html,list,bundles,c,turn[i],i));
    }
    const baseline=results.filter(r=>r.groupName==='control'&&r.fcp&&r.ttfb);
    const output={width:WIDTH,mode:MODE,cycles:CYCLES,bundles:{},baseline:stats(baseline.map(r=>r.fcpLessTTFB))};
    for(const name of names){
      const group=results.filter(r=>r.groupName===name);
      const successes=group.filter(x=>x.fcp>0&&x.ttfb>0&&(!GROUPS[name].length||(x.modified&&x.cssServed)));
      const med=stats(successes.map(x=>x.fcpLessTTFB));
      const controlByCycle=new Map(baseline.map(x=>[x.cycle,x]));
      const paired=successes.filter(x=>controlByCycle.has(x.cycle)).map(x=>x.fcpLessTTFB-controlByCycle.get(x.cycle).fcpLessTTFB);
      const clsPeak=Math.max(...successes.map(x=>x.cls||0),0);
      output.bundles[name]={
        n:successes.length,missing:group.length-successes.length,fcp:stats(successes.map(x=>x.fcp)),
        afterTTFB:med,pairedDelta:stats(paired),clsPeak,
        errors:successes.reduce((a,x)=>a+(x.pageErrors?.length||0),0),
        fontOrGeometryMismatch:successes.filter(x=>
          x.geometry?.['.elementor-element-77137dd']?.h!==baseline[0]?.geometry?.['.elementor-element-77137dd']?.h ||
          x.geometry?.['.elementor-element-920fc5e']?.y!==baseline[0]?.geometry?.['.elementor-element-920fc5e']?.y
        ).length};
    }
    console.log('STATS '+JSON.stringify(output));
    fs.writeFileSync(outDir+'/summary-'+MODE+'-'+WIDTH+'.json',JSON.stringify(output,null,2));
  }finally{await browser.close()}
}
main().catch(e=>{console.error('FATAL',e.stack||e);process.exitCode=1});