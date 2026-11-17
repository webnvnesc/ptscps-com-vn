'use strict';
/**
 * Read-only: analyze real Lighthouse screenshot-thumbnails by vertical
 * viewport bands and correlate late visual changes with FCP/LCP/SI.
 * Does not alter WordPress, block resources, inject CSS, or modify production.
 */
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const {PNG}=require('pngjs');
const jpeg=require('jpeg-js');
const lighthouse=require.resolve('lighthouse/cli/index.js');
const device=process.env.PTSCPS_FILM_DEVICE==='desktop'?'desktop':'mobile';
const count=Math.max(1,Math.min(4,Number(process.env.PTSCPS_FILM_RUNS||3)));
const out='si-filmstrip-regions-'+device;
fs.mkdirSync(out,{recursive:true});
const BANDS=[
 {name:'header-upper',from:0,to:.18},
 {name:'hero-upper',from:.18,to:.40},
 {name:'hero-lower',from:.40,to:.63},
 {name:'below-hero',from:.63,to:.83},
 {name:'bottom-viewport',from:.83,to:1}
];
const median=(vals)=>{const a=vals.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[(a.length-1)>>1]+a[a.length>>1])/2:null};
function decode(url){
 if(!url?.startsWith('data:image/'))throw Error('Unsupported filmstrip data url');
 const at=url.indexOf(',');
 const raw=Buffer.from(url.slice(at+1),'base64');
 if(raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
   const im=PNG.sync.read(raw);return {width:im.width,height:im.height,data:im.data,bytes:raw.length,raw};
 }
 if(raw[0]===255&&raw[1]===216){
   const im=jpeg.decode(raw,{useTArray:true});return {width:im.width,height:im.height,data:im.data,bytes:raw.length,raw};
 }
 throw Error('Unsupported screenshot format');
}
function diff(before,after,from,to){
 const w=before.width,h=before.height;
 if(after.width!==w||after.height!==h)throw Error('Filmstrip size changes');
 const y1=Math.round(from*h),y2=Math.round(to*h);
 let changed=0,all=0,abs=0;
 for(let y=y1;y<y2;y+=3)for(let x=0;x<w;x+=3){
   const p=(y*w+x)*4;
   const a=before.data,b=after.data;
   const delta=(Math.abs(a[p]-b[p])+Math.abs(a[p+1]-b[p+1])+Math.abs(a[p+2]-b[p+2]))/3;
   changed+=(delta>=18)?1:0;
   abs+=delta;all++;
 }
 return {pct:all?Math.round(1000*changed/all)/10:null,mean:all?Math.round(10*abs/all)/10:null};
}
async function run(n){
 const target=out+'/lighthouse-'+n+'.json';
 const args=[
  lighthouse,'https://ptscps.com.vn/','--only-categories=performance',
  '--chrome-path='+chromium.executablePath(),
  '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
  '--output=json','--output-path='+target,'--quiet',
  '--max-wait-for-load=60000'
 ];
 if(device==='desktop')args.push('--preset=desktop');
 execFileSync(process.execPath,args,{timeout:190000,stdio:'pipe',env:{...process.env,CHROME_PATH:chromium.executablePath()}});
 const report=JSON.parse(fs.readFileSync(target,'utf8'));
 const items=report.audits?.['screenshot-thumbnails']?.details?.items||[];
 const frames=items.filter(x=>x.data?.startsWith('data:image/')).map(x=>({
  t:Math.round(x.timing??0),pic:decode(x.data)
 }));
 if(frames.length<4)throw Error('Fewer than four filmstrip images');
 // SI uses viewport and visual progress across early filmstrip frames. A final
 // screenshot may already be rotated by SR7 autoplay; report both terminal
 // and early-stable reference (~first at/after LCP+1200ms, max 6500ms).
 const lcp=report.audits['largest-contentful-paint']?.numericValue||0;
 const si=report.audits['speed-index']?.numericValue||0;
 const refEarly=frames.reduce((best,x)=>{
   const want=Math.min(6500,Math.max(3800,lcp+1400));
   return Math.abs(x.t-want)<Math.abs(best.t-want)?x:best;
 },frames[0]);
 const refEnd=frames[frames.length-1];
 const records=frames.map((x,i)=>({
  ms:x.t,
  toEarly:Object.fromEntries(BANDS.map(b=>[b.name,diff(x.pic,refEarly.pic,b.from,b.to)])),
  toEnd:Object.fromEntries(BANDS.map(b=>[b.name,diff(x.pic,refEnd.pic,b.from,b.to)])),
  // Compares successive frames, catches late transitions/animations.
  sincePrevious:i?Object.fromEntries(BANDS.map(b=>[b.name,diff(frames[i-1].pic,x.pic,b.from,b.to)])):null
 }));
 for(const x of frames)if(n===1)fs.writeFileSync(out+'/filmstrip-'+device+'-'+x.t+'ms.'+(x.pic.raw[0]===255?'jpg':'png'),x.pic.raw);
 const d=(id)=>Math.round(report.audits?.[id]?.numericValue||0);
 const r={
  device,n,lh:report.lighthouseVersion,score:Math.round(report.categories.performance.score*100),
  si:d('speed-index'),fcp:d('first-contentful-paint'),lcp:d('largest-contentful-paint'),
  tbt:d('total-blocking-time'),
  cls:Number((report.audits?.['cumulative-layout-shift']?.numericValue||0).toFixed(5)),
  frameCount:frames.length,dimensions:[frames[0].pic.width,frames[0].pic.height],
  refEarlyMs:refEarly.t,refEndMs:refEnd.t,
  // Time of first screenshot visually within <10% changed pixels of early reference.
  bands:BANDS.map(b=>({
    name:b.name,
    settlesByMs:records.find(x=>x.toEarly[b.name].pct<=10)?.ms??null,
    changedAfterLcp:records.filter(x=>x.ms>lcp).map(x=>x.sincePrevious?.[b.name]?.pct||0).reduce((a,v)=>Math.max(a,v),0),
    changedAtLcp:records.find(x=>x.ms>=lcp)?.toEarly[b.name].pct??null,
    atFcp:records.find(x=>x.ms>=d('first-contentful-paint'))?.toEarly[b.name].pct??null,
  })),
  frames:records
 };
 fs.writeFileSync(out+'/summary-'+n+'.json',JSON.stringify(r,null,2));
 console.log('SI_REGION_CASE '+JSON.stringify({
  device,n,score:r.score,si:r.si,lcp:r.lcp,fcp:r.fcp,tbt:r.tbt,cls:r.cls,
  frameCount:r.frameCount,refEarlyMs:r.refEarlyMs,refEndMs:r.refEndMs,bands:r.bands
 }).slice(0,12000));
 return r;
}
(async()=>{
 const result=[];
 for(let n=1;n<=count;n++){
  try{result.push(await run(n))}catch(e){
   const error=String(e.stderr||e.stack||e).slice(-1500);
   result.push({device,n,error});
   console.log('SI_REGION_ERROR '+JSON.stringify({device,n,error}));
  }
 }
 const ok=result.filter(x=>!x.error);
 const bands=BANDS.map(b=>({
  name:b.name,
  medianSettle:median(ok.map(x=>x.bands.find(y=>y.name===b.name).settlesByMs)),
  medianChangedAtLCP:median(ok.map(x=>x.bands.find(y=>y.name===b.name).changedAtLcp)),
  changedAfterLcpMax:Math.max(...ok.map(x=>x.bands.find(y=>y.name===b.name).changedAfterLcp))
 }));
 const summary={device,successful:ok.length,total:count,
  median:{si:median(ok.map(x=>x.si)),lcp:median(ok.map(x=>x.lcp)),fcp:median(ok.map(x=>x.fcp)),score:median(ok.map(x=>x.score)),
    tbt:median(ok.map(x=>x.tbt)),cls:median(ok.map(x=>x.cls))},
  bands,note:'Screenshot-region pixel difference is an attribution proxy, not the standardized Google Speed Index. A slide transition can make the end frame differ; use early reference and inspect original films before concluding causation.'};
 fs.writeFileSync(out+'/summary.json',JSON.stringify(summary,null,2));
 console.log('SI_REGION_SUMMARY '+JSON.stringify(summary));
 if(ok.length!==count)process.exitCode=1;
})().catch(e=>{console.error('SI_REGION_FATAL '+e.stack);process.exitCode=1});
