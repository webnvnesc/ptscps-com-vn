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
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const lighthouse=require.resolve('lighthouse/cli/index.js');
const device=process.env.PTSCPS_AB_DEVICE==='desktop'?'desktop':'mobile';
const cycles=Math.max(2,Math.min(4,Number(process.env.PTSCPS_AB_CYCLES||3)));
const BASE='https://ptscps.com.vn/';
const dir='ptscps-slider-ab-'+device;
const modes=['control','nohero','nocustomer','both'];
const hides={
 control:'',
 nohero:'sr7-module#SR7_1_1,.elementor-widget:has(sr7-module#SR7_1_1),.rev_slider_wrapper:has(sr7-module#SR7_1_1){display:none!important}',
 nocustomer:'.elementor-element-1be3f74{display:none!important}',
 both:'sr7-module#SR7_1_1,.elementor-widget:has(sr7-module#SR7_1_1),.rev_slider_wrapper:has(sr7-module#SR7_1_1),.elementor-element-1be3f74{display:none!important}'
};
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
 const marker='<style id="ptscps-slider-ab-test">:root{--ptscps-lh-slider-probe:'+mode+'!important}'+hides[mode]+'</style>';
 if(!/<head\b[^>]*>/i.test(html)||!/<sr7-module\b/i.test(html)||
   !html.includes('elementor-element-1be3f74'))throw Error('Unexpected WordPress homepage HTML');
 return html.replace(/<head\b[^>]*>/i,m=>m+marker);
}
async function run(mode,cycle,baseHtml){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ptscps-lh-'));
 const port=10000+((process.pid+cycle*19+modes.indexOf(mode)*23)%35000);
 let ctx=null;
 const row={device,mode,cycle,port,fulfilled:0};
 try{
  ctx=await chromium.launchPersistentContext(profile,{
   headless:true,acceptDownloads:false,serviceWorkers:'block',
   args:['--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port='+port]
  });
  await ctx.route('https://ptscps.com.vn/**',async route=>{
    const req=route.request();
    const url=new URL(req.url());
    if(req.isNavigationRequest()&&req.resourceType()==='document'&&url.pathname==='/'){
      row.fulfilled++;
      await route.fulfill({status:200,headers:{
        'content-type':'text/html; charset=utf-8','cache-control':'no-store'},
        body:patch(baseHtml,mode)});
    }else await route.continue();
  });
  // Verify CSS treatment on a real Chrome page before running Lighthouse.
  const smoke=await ctx.newPage();
  const res=await smoke.goto(BASE,{waitUntil:'domcontentloaded',timeout:85000});
  const actual=await smoke.evaluate(()=>{
   const el=document.querySelector('sr7-module#SR7_1_1');
   const cus=document.querySelector('.elementor-element-1be3f74');
   const box=e=>{
    if(!e)return null;
    const r=e.getBoundingClientRect();
    return {height:Math.round(r.height),width:Math.round(r.width),
      visible:e.getClientRects().length>0,display:getComputedStyle(e).display};
   };
   return {hero:box(el),customer:box(cus),marker:getComputedStyle(document.documentElement)
     .getPropertyValue('--ptscps-lh-slider-probe').trim(),
     hasInjected:!!document.querySelector('#ptscps-slider-ab-test')};
  });
  await smoke.close();
  const hidden=x=>!x||x.height<4||!x.visible||x.display==='none';
  const expectedH=['nohero','both'].includes(mode);
  const expectedC=['nocustomer','both'].includes(mode);
  row.smoke={http:res.status(),actual};
  if(res.status()!==200||!actual.hasInjected||actual.marker!==mode||
    !actual.hero||!actual.customer||
    hidden(actual.hero)!==expectedH||hidden(actual.customer)!==expectedC){
    throw Error('HTML-route visual gate failed: '+JSON.stringify(row.smoke));
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
  execFileSync(process.execPath,flags,{timeout:220000,stdio:'pipe',
    env:{...process.env,CHROME_PATH:chromium.executablePath()}});
  const j=JSON.parse(fs.readFileSync(output,'utf8'));
  const get=id=>j.audits?.[id]?.numericValue??null;
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
  console.log('SLIDERS_AB_LH_CASE '+JSON.stringify(row).slice(0,2700));
 }catch(e){
  row.ok=false;row.error=String(e.stderr||e.stack||e).slice(-1900);
  console.log('SLIDERS_AB_LH_ERROR '+JSON.stringify(row).slice(0,3200));
 }finally{
  try{await ctx?.close()}catch{}
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
  ['control','nohero','nocustomer','both'],
  ['both','nocustomer','nohero','control'],
  ['nocustomer','control','both','nohero'],
  ['nohero','both','control','nocustomer']
 ];
 for(let i=0;i<cycles;i++){
  for(const mode of rotated[i]){
   const row=await run(mode,i+1,html);
   rows.push(row);
   fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(rows,null,2));
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
   siLower250:pairs.filter(x=>x.deltaSI<=-250).length};
 });
 const summary={device,cycles,success:valid.length,expected:cycles*4,
  modes:modesSummary,pairs:paired,
  caveat:'Lighthouse uses a browser-local intercepted HTML copy of same live homepage, with early CSS display:none. WordPress not modified. Slider JS/scripts/images still load and initialize; this estimates the visual-layout effect, not full asset-removal effects. HTML TTFB is equalized by route.fulfill, so absolute SI may differ from normal production and should be compared as paired deltas only.'};
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));
 console.log('SLIDERS_AB_SUMMARY '+JSON.stringify(summary).slice(0,24000));
 if(valid.length!==cycles*4)process.exitCode=1;
})().catch(e=>{console.error('SLIDERS_AB_FATAL '+String(e.stack||e));process.exitCode=1;});
