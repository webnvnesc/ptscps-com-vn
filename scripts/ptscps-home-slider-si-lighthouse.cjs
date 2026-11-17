'use strict';
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const lighthouse=require.resolve('lighthouse/cli/index.js');
const {chromium}=require('playwright');
const device=process.env.SI_DEVICE||'mobile';
const cycles=Number(process.env.SI_CYCLES||2);
const dir='si-slider-lh-'+device;
fs.mkdirSync(dir,{recursive:true});
const results=[];
for(let i=0;i<cycles;i++){
 const path=dir+'/lighthouse-'+i+'.json';
 const flags=[
  lighthouse,'https://ptscps.com.vn/',
  '--only-categories=performance',
  '--chrome-path='+chromium.executablePath(),
  '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
  '--output=json','--output-path='+path,'--quiet',
  '--max-wait-for-load=60000'
 ];
 if(device==='desktop')flags.push('--preset=desktop');
 try{
  execFileSync(process.execPath,flags,{timeout:180000,stdio:'pipe',env:{...process.env,CHROME_PATH:chromium.executablePath()}});
  const report=JSON.parse(fs.readFileSync(path,'utf8'));
  const audits=report.audits;
  const metric=id=>({value:Math.round(audits[id]?.numericValue??0),score:audits[id]?.score??null});
  const shot=audits['screenshot-thumbnails']?.details?.items||[];
  const out=shot.map((p,index)=>{
   const stamp=Math.round(p.timing??0);
   if(p.data?.startsWith('data:image/png;base64,'))fs.writeFileSync(dir+'/filmstrip-'+i+'-'+index+'-'+stamp+'ms.png',Buffer.from(p.data.split(',')[1],'base64'));
   return {ms:stamp,bytes:p.data?.length??0};
  });
  const requests=audits['network-requests']?.details?.items||[];
  const banner=requests.filter(r=>/ruby-banner\.jpg|banner[23]\.jpg|sliderrevolution|srengine=|tptools|sr7(?:\.min)?\.js/.test(r.url||'')).map(r=>({
   url:r.url?.split('?')[0].split('/').slice(-2).join('/'),
   start:Math.round(r.startTime||0),end:Math.round(r.endTime||0),
   transferSize:r.transferSize,resourceSize:r.resourceSize,priority:r.priority
  }));
  const lcpEl=audits['largest-contentful-paint-element']?.details?.items?.slice(0,2).map(x=>({snippet:x.node?.snippet?.slice(0,450),url:x.url}));
  const summary={
   device,cycle:i,score:Math.round((report.categories.performance.score||0)*100),
   fcp:metric('first-contentful-paint'),
   si:metric('speed-index'),
   lcp:metric('largest-contentful-paint'),
   tbt:metric('total-blocking-time'),
   cls:audits['cumulative-layout-shift']?.numericValue,
   ttfb:metric('server-response-time'),
   screenshots:out,filmlength:out.length,
   lcpElement:lcpEl,bannerRequests:banner,
   warnings:report.runWarnings?.slice(0,6)
  };
  results.push(summary);console.log('SLIDER_SI_LH '+JSON.stringify(summary).slice(0,13500));
 }catch(e){
  const err=String(e.stderr||e.message||e).slice(-3000);
  console.log('SLIDER_SI_LH_FAILED '+JSON.stringify({device,cycle:i,error:err}));
  results.push({device,cycle:i,error:err});
 }
}
const conclusion={device,cycles,completed:results.filter(x=>!x.error).length,rows:results.map(x=>({cycle:x.cycle,score:x.score,si:x.si?.value,fcp:x.fcp?.value,lcp:x.lcp?.value,tbt:x.tbt?.value,cls:x.cls,frames:x.filmlength}))};
fs.writeFileSync(dir+'/summary.json',JSON.stringify(results,null,2));
console.log('SLIDER_SI_LH_SUMMARY '+JSON.stringify(conclusion));
if(conclusion.completed!==cycles)process.exitCode=1;
