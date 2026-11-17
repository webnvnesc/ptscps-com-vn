'use strict';
/**
 * Independent PTSCPS production Lighthouse 13.5.0 repeatability check.
 * 10 complete runs for one device, same stock Lighthouse CLI settings for all.
 * No changes to site / DNS / browser CSS injection / request blocking.
 */
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const lighthouse=require.resolve('lighthouse/cli/index.js');
const {chromium}=require('playwright');

const DEVICE=process.env.PTSCPS_LH_DEVICE==='desktop'?'desktop':'mobile';
const COUNT=Number(process.env.PTSCPS_LH_COUNT||10);
if(!Number.isInteger(COUNT)||COUNT<1||COUNT>15)throw Error('Invalid repeat count');
const BASE='https://ptscps.com.vn/';
const dir='ptscps-repeat-lighthouse-'+DEVICE;
fs.mkdirSync(dir,{recursive:true});
const all=[];
const started=new Date().toISOString();
const metrics=['first-contentful-paint','largest-contentful-paint','speed-index','total-blocking-time','cumulative-layout-shift'];
function summary(values){
 const arr=values.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!arr.length)return null;
 const sum=arr.reduce((x,y)=>x+y,0);
 return {n:arr.length,mean:sum/arr.length,median:(arr[Math.floor((arr.length-1)/2)]+arr[Math.floor(arr.length/2)])/2,
   p95:arr[Math.min(arr.length-1,Math.ceil(arr.length*.95)-1)],min:arr[0],max:arr[arr.length-1]};
}
const sleeper=ms=>{const end=Date.now()+ms;while(Date.now()<end){}};
for(let i=0;i<COUNT;i++){
 const file=path.join(dir,'lighthouse-'+String(i+1).padStart(2,'0')+'.json');
 const args=[
  lighthouse,BASE,'--only-categories=performance',
  '--chrome-path='+chromium.executablePath(),
  '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
  '--output=json','--output-path='+file,'--quiet',
  '--max-wait-for-load=60000'
 ];
 if(DEVICE==='desktop')args.push('--preset=desktop');
 let entry={device:DEVICE,attempt:i+1,at:new Date().toISOString()};
 try{
  execFileSync(process.execPath,args,{timeout:195000,stdio:'pipe',
    env:{...process.env,CHROME_PATH:chromium.executablePath()}});
  const j=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!j.categories?.performance||!j.audits?.['first-contentful-paint']||!j.audits?.['speed-index']){
   throw Error('Incomplete Lighthouse performance response');
  }
  const timings=Object.fromEntries(metrics.map(m=>[m,j.audits[m]?.numericValue??null]));
  const req=j.audits['network-requests']?.details?.items||[];
  const banners=req.filter(r=>/ruby-banner\.jpg|banner2\.jpg|banner3\.jpg/i.test(r.url||''))
    .map(r=>({file:r.url?.split('?')[0].split('/').at(-1),
      start:Math.round(r.startTime||0),end:Math.round(r.endTime||0),bytes:r.transferSize||0}));
  const lcpItem=j.audits['largest-contentful-paint-element']?.details?.items?.[0]||null;
  const lcpSnippet=lcpItem?.node?.snippet?.slice(0,250)||null;
  const lcpUrl=lcpItem?.url||null;
  const lab=j.audits['largest-contentful-paint-element']?.details?.items?.length||0;
  const runner=j.environment||{};
  entry={...entry,ok:true,score:Math.round(j.categories.performance.score*100),
    ...timings,finalUrl:j.finalUrl,
    fetched:j.fetchTime,version:j.lighthouseVersion,ua:j.userAgent,
    environment:{hostUserAgent:runner.hostUserAgent||null,
      networkUserAgent:runner.networkUserAgent||null,
      benchmarkIndex:runner.benchmarkIndex??null},
    lcpSnippet,lcpUrl,lcpElements:lab,banners,
    runWarnings:j.runWarnings||[],
    diagnostics:{networkRequests:req.length,
      bootupTime:j.audits['bootup-time']?.numericValue??null,
      serverResponseTime:j.audits['server-response-time']?.numericValue??null}};
  console.log('LH_REPEAT_CASE '+JSON.stringify({
   device:DEVICE,n:i+1,score:entry.score,
   fcp:Math.round(entry['first-contentful-paint']),
   lcp:Math.round(entry['largest-contentful-paint']),
   si:Math.round(entry['speed-index']),
   tbt:Math.round(entry['total-blocking-time']),
   cls:Number(entry['cumulative-layout-shift'].toFixed(6)),
   bannerCount:entry.banners.length,
   lcpSnippet:entry.lcpSnippet,
   warnings:entry.runWarnings.slice(0,3)}).slice(0,2600));
 }catch(err){
  entry.ok=false;
  entry.error=String(err.stderr||err.message||err).slice(-1100);
  console.log('LH_REPEAT_ERROR '+JSON.stringify({device:DEVICE,run:i+1,
    error:entry.error}).slice(0,1500));
 }
 all.push(entry);
 fs.writeFileSync(path.join(dir,'runs.json'),JSON.stringify(all,null,2));
 if(i<COUNT-1)sleeper(1200);
}
const valid=all.filter(x=>x.ok);
const stats={
 device:DEVICE,
 target:COUNT,
 successful:valid.length,
 failed:all.filter(x=>!x.ok).map(x=>({run:x.attempt,error:x.error})),
 started,ended:new Date().toISOString(),
 score:summary(valid.map(x=>x.score)),
 lcp:summary(valid.map(x=>x['largest-contentful-paint'])),
 fcp:summary(valid.map(x=>x['first-contentful-paint'])),
 si:summary(valid.map(x=>x['speed-index'])),
 tbt:summary(valid.map(x=>x['total-blocking-time'])),
 cls:summary(valid.map(x=>x['cumulative-layout-shift'])),
 score100Count:valid.filter(x=>x.score===100).length,
 lcpTags:valid.map(x=>({run:x.attempt,
   snippet:x.lcpSnippet,url:x.lcpUrl,
   banners:x.banners.map(y=>y.file)})),
 lighthouseVersion:[...new Set(valid.map(x=>x.version))],
 finalUrls:[...new Set(valid.map(x=>x.finalUrl))]
};
fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(stats,null,2));
console.log('LH_REPEAT_SUMMARY '+JSON.stringify(stats).slice(0,14500));
if(valid.length!==COUNT)process.exitCode=1;
