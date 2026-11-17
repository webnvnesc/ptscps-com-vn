'use strict';
/**
 * Read-only production experiment: measure Lighthouse SI when either/both
 * existing sliders are visually excluded using a LOCAL Chrome extension.
 * No WordPress edits, no admin data edits, no stylesheet changes on hosting.
 *
 * Note: CSS display:none keeps slider JS and network requests executing.
 * This isolates first-viewport visual cost, NOT a true full-feature removal.
 */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const lighthouse=require.resolve('lighthouse/cli/index.js');
const device=process.env.PTSCPS_AB_DEVICE==='desktop'?'desktop':'mobile';
const count=Math.max(2,Math.min(5,Number(process.env.PTSCPS_AB_CYCLES||3)));
const BASE='https://ptscps.com.vn/';
const dir='ptscps-slider-ab-'+device;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ptscps-slider-css-'));
const modes=['control','nohero','nocustomer','both'];
const css={
 control:':root{--ptscps-lh-slider-probe:control!important}',
 nohero:':root{--ptscps-lh-slider-probe:nohero!important}\n'+
 'sr7-module#SR7_1_1,.elementor-widget:has(sr7-module#SR7_1_1),.rev_slider_wrapper:has(sr7-module#SR7_1_1){display:none!important}',
 nocustomer:':root{--ptscps-lh-slider-probe:nocustomer!important}\n'+
 '.elementor-element-1be3f74{display:none!important}',
 both:':root{--ptscps-lh-slider-probe:both!important}\n'+
 'sr7-module#SR7_1_1,.elementor-widget:has(sr7-module#SR7_1_1),.rev_slider_wrapper:has(sr7-module#SR7_1_1),.elementor-element-1be3f74{display:none!important}'
};
fs.mkdirSync(dir,{recursive:true});
const folders={};
for(const mode of modes){
 const folder=path.join(root,mode);
 fs.mkdirSync(folder);
 fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({
   manifest_version:3,name:'PTSCPS local LH css probe '+mode,
   version:'1.0.0',content_scripts:[{
      matches:['https://ptscps.com.vn/*'],
      css:['hide.css'],run_at:'document_start',all_frames:false
   }]
 }));
 fs.writeFileSync(path.join(folder,'hide.css'),css[mode]+'\n');
 folders[mode]=folder;
}
const median=xs=>{
 const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);
 return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null
};
function stats(rows,key){
 const xs=rows.map(x=>x[key]).filter(Number.isFinite);
 return {n:xs.length,median:median(xs),min:xs.length?Math.min(...xs):null,max:xs.length?Math.max(...xs):null}
}
async function smoke(mode){
 const folder=folders[mode];
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ptscps-lh-smoke-'));
 let context;
 try{
  context=await chromium.launchPersistentContext(profile,{
   headless:true,viewport:{width:device==='mobile'?412:1440,height:device==='mobile'?850:900},
   args:['--no-sandbox','--disable-dev-shm-usage',
    '--disable-extensions-except='+folder,'--load-extension='+folder],
   serviceWorkers:'block'
  });
  const page=await context.newPage();
  const response=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:80000});
  const selectors=await page.evaluate(()=>{
   const hero=document.querySelector('sr7-module#SR7_1_1');
   const customer=document.querySelector('.elementor-element-1be3f74');
   const box=el=>{
    if(!el)return null;
    const r=el.getBoundingClientRect();
    return {width:Math.round(r.width),height:Math.round(r.height),
       display:getComputedStyle(el).display,visible:el.getClientRects().length>0};
   };
   return {hero:box(hero),customer:box(customer),
     probe:getComputedStyle(document.documentElement).getPropertyValue('--ptscps-lh-slider-probe').trim(),
     docWidth:document.documentElement.scrollWidth,windowWidth:innerWidth};
  });
  const expectH=mode==='nohero'||mode==='both';
  const expectC=mode==='nocustomer'||mode==='both';
  const isHidden=x=>!x||x.height<4||x.display==='none'||x.visible===false;
  const valid=response.status()===200&&!!selectors.hero&&!!selectors.customer&&
   selectors.probe===mode&&isHidden(selectors.hero)===expectH&&
   isHidden(selectors.customer)===expectC;
  console.log('SLIDERS_AB_SMOKE '+JSON.stringify({device,mode,http:response.status(),valid,selectors}));
  if(!valid)throw Error('Extension did not hide exactly requested slider for '+mode);
  return {mode,valid,selectors};
 }finally{
  try{await context?.close()}catch{}
  fs.rmSync(profile,{recursive:true,force:true});
 }
}
function lh(mode,cycle){
 const folder=folders[mode];
 const output=path.join(dir,'lighthouse-'+cycle+'-'+mode+'.json');
 const flags=[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-first-run',
  '--disable-extensions-except='+folder,'--load-extension='+folder
 ].join(' ');
 const args=[
  lighthouse,BASE,'--only-categories=performance',
  '--chrome-path='+chromium.executablePath(),
  '--chrome-flags='+flags,'--output=json','--output-path='+output,
  '--quiet','--max-wait-for-load=60000'
 ];
 if(device==='desktop')args.push('--preset=desktop');
 execFileSync(process.execPath,args,{timeout:240000,stdio:'pipe',
   env:{...process.env,CHROME_PATH:chromium.executablePath()}});
 const r=JSON.parse(fs.readFileSync(output,'utf8'));
 const get=id=>r.audits?.[id]?.numericValue??null;
 const row={device,mode,cycle,ok:!!r.categories?.performance&&
   Number.isFinite(get('speed-index')),
   score:Math.round((r.categories.performance?.score||0)*100),
   si:Math.round(get('speed-index')||0),fcp:Math.round(get('first-contentful-paint')||0),
   lcp:Math.round(get('largest-contentful-paint')||0),
   tbt:Math.round(get('total-blocking-time')||0),
   cls:get('cumulative-layout-shift'),
   serverResponse:get('server-response-time'),
   lighthouseVersion:r.lighthouseVersion,finalUrl:r.finalUrl,
   warnings:r.runWarnings?.slice(0,4)||[],
   lcpElement:r.audits?.['largest-contentful-paint-element']?.details?.items?.[0]?.node?.snippet?.slice(0,220)||null};
 if(!row.ok||!row.si||row.finalUrl.replace(/\/$/,'')!==BASE.replace(/\/$/,'')){
  throw Error('Lighthouse result incomplete or wrong URL for '+mode);
 }
 console.log('SLIDERS_AB_LH_CASE '+JSON.stringify(row).slice(0,2600));
 return row;
}
(async()=>{
 const smokeResults=[];
 for(const mode of modes)smokeResults.push(await smoke(mode));
 const results=[];
 const rotated=[
  ['control','nohero','nocustomer','both'],
  ['both','nocustomer','nohero','control'],
  ['nocustomer','control','both','nohero'],
  ['nohero','both','control','nocustomer'],
  ['control','both','nohero','nocustomer']
 ];
 for(let cycle=0;cycle<count;cycle++){
  for(const mode of rotated[cycle]){
   let row;
   try{row=lh(mode,cycle+1)}
   catch(e){
    row={mode,cycle:cycle+1,ok:false,error:String(e.stderr||e.message||e).slice(-1600)};
    console.log('SLIDERS_AB_LH_ERROR '+JSON.stringify(row).slice(0,2000))
   }
   results.push(row);
   fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(results,null,2));
  }
 }
 const valid=results.filter(x=>x.ok);
 const pairs=[];
 for(let i=1;i<=count;i++){
  const base=valid.find(x=>x.cycle===i&&x.mode==='control');
  for(const mode of modes.filter(x=>x!=='control')){
   const test=valid.find(x=>x.cycle===i&&x.mode===mode);
   if(base&&test)pairs.push({cycle:i,mode,
    siDelta:test.si-base.si,scoreDelta:test.score-base.score,
    fcpDelta:test.fcp-base.fcp,lcpDelta:test.lcp-base.lcp,
    tbtDelta:test.tbt-base.tbt,clsDelta:test.cls-base.cls,
    serverResponseDelta:test.serverResponse-base.serverResponse});
  }
 }
 const summaries=modes.map(mode=>{
  const rows=valid.filter(x=>x.mode===mode);
  const deltas=pairs.filter(x=>x.mode===mode);
  return {mode,success:rows.length,
   si:stats(rows,'si'),fcp:stats(rows,'fcp'),lcp:stats(rows,'lcp'),
   score:stats(rows,'score'),tbt:stats(rows,'tbt'),cls:stats(rows,'cls'),
   pairedSiDelta:stats(deltas,'siDelta'),
   pairedScoreDelta:stats(deltas,'scoreDelta'),
   pairedFcpDelta:stats(deltas,'fcpDelta'),
   pairedLcpDelta:stats(deltas,'lcpDelta'),
   fasterSi:mode==='control'?null:deltas.filter(x=>x.siDelta<=-250).length
  }
 });
 const summary={device,cycles:count,valid:valid.length,expected:4*count,
  smoke:smokeResults,summaries,pairs,
  note:'Browser-only local Chrome extension hides the whole hero and/or Elementor customer carousel from visual layout at document_start. Slider JS, images and network are NOT removed. Actual standardized Lighthouse Speed Index is measured. Native homepage, theme, Elementor, SR7, WPSC and admin are unmodified; environment/TTFB can still fluctuate.'};
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));
 console.log('SLIDERS_AB_SUMMARY '+JSON.stringify(summary).slice(0,25000));
 if(valid.length!==4*count)process.exitCode=1;
})().catch(e=>{console.error('SLIDERS_AB_FATAL '+String(e.stack||e));process.exitCode=1})
.finally(()=>{try{fs.rmSync(root,{recursive:true,force:true})}catch{}});
