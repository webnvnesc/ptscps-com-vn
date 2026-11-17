'use strict';
// Chrome read-only: quantify how much the visible first banner changes across
// SR7 ready while LCP has already been recorded. This is NOT Lighthouse SI.
const fs=require('node:fs');
const {chromium}=require('playwright');
const jpeg=require('jpeg-js');
const device=process.env.HANDOFF_DEVICE==='desktop'?'desktop':'mobile';
const mobile=device==='mobile';
const cycles=Math.max(1,Math.min(3,Number(process.env.HANDOFF_CYCLES||2)));
const directory='handoff-pixels-'+device;
fs.mkdirSync(directory,{recursive:true});
const median=a=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?(a[(a.length-1)>>1]+a[a.length>>1])/2:null};
function closeFrame(frames,time){
 if(!Number.isFinite(time))return null;
 return frames.reduce((best,x)=>!best||Math.abs(x.t-time)<Math.abs(best.t-time)?x:best,null);
}
function compare(a,b,rect){
 if(!a||!b||!rect||rect.width<40||rect.height<40)return null;
 const aa=jpeg.decode(a.image,{useTArray:true}),bb=jpeg.decode(b.image,{useTArray:true});
 if(aa.width!==bb.width||aa.height!==bb.height)return null;
 const left=Math.max(0,Math.floor(rect.x)),right=Math.min(aa.width,Math.ceil(rect.x+rect.width));
 const top=Math.max(0,Math.floor(rect.y)),bottom=Math.min(aa.height,Math.ceil(rect.y+rect.height));
 let n=0,diff=0,sum=0;
 for(let y=top;y<bottom;y+=5)for(let x=left;x<right;x+=5){
  const k=(y*aa.width+x)*4;
  const d=(Math.abs(aa.data[k]-bb.data[k])+Math.abs(aa.data[k+1]-bb.data[k+1])+Math.abs(aa.data[k+2]-bb.data[k+2]))/3;
  n++;diff+=d>=20?1:0;sum+=d;
 }
 return n?{pixels:n,changedPct:Math.round(diff/n*1000)/10,meanDelta:Math.round(sum/n*10)/10}:null;
}
async function run(browser,index){
 const ctx=await browser.newContext({viewport:{width:mobile?412:1440,height:mobile?850:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,serviceWorkers:'block'});
 const page=await ctx.newPage(),cdp=await ctx.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Page.enable');
 if(mobile){
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:95*1024});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 }
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e.message).slice(0,250)));
 await page.addInitScript(()=>{
  window.__handoff={lcp:[],ready:[],changes:[],paint:[]};
  try{new PerformanceObserver(list=>list.getEntries().forEach(x=>window.__handoff.lcp.push({
   t:Math.round(x.startTime),tag:x.element?.tagName||null,id:x.element?.id||null,url:x.url||null
  }))).observe({type:'largest-contentful-paint',buffered:true});}catch{}
  try{new PerformanceObserver(list=>list.getEntries().forEach(x=>window.__handoff.paint.push({
   name:x.name,t:Math.round(x.startTime)
  }))).observe({type:'paint',buffered:true});}catch{}
  document.addEventListener('sr.module.ready',()=>window.__handoff.ready.push(Math.round(performance.now())),true);
  document.addEventListener('DOMContentLoaded',()=>{
   const get=()=>{
    const m=document.querySelector('#SR7_1_1');
    return m?.getAttribute('data-current')||null;
   };
   let previous=get();
   const interval=setInterval(()=>{
    const value=get();
    if(value!==previous){window.__handoff.changes.push({t:Math.round(performance.now()),from:previous,to:value});previous=value;}
    if(performance.now()>17000)clearInterval(interval);
   },125);
  },{once:true});
 });
 const output={device,index,ok:false},frames=[];
 try{
  const response=await page.goto('https://ptscps.com.vn/',{waitUntil:'domcontentloaded',timeout:90000});
  output.http=response.status();
  const watchUntil=mobile?11500:9500;
  for(let n=0;n<36;n++){
    const state=await page.evaluate(()=>{
     const m=document.querySelector('#SR7_1_1');
     const b=m?.getBoundingClientRect();
     const first=m?.querySelector('sr7-slide');
     return {t:Math.round(performance.now()),
      current:m?.getAttribute('data-current')||null,
      firstVisibility:first?getComputedStyle(first).visibility:null,
      canvasCount:m?.querySelectorAll('canvas[data-use-for="BGContentImage"]').length||0,
      poster:!!m?.getAttribute('data-ptscps-poster'),
      rect:b?{x:b.x,y:b.y,width:b.width,height:b.height}:null};
    });
    const shot=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:55,captureBeyondViewport:false,fromSurface:true});
    frames.push({...state,image:Buffer.from(shot.data,'base64')});
    const t=await page.evaluate(()=>performance.now());
    if(t>watchUntil)break;
    await page.waitForTimeout(350);
  }
  const snap=await page.evaluate(()=>({
    events:window.__handoff,
    title:document.title,
    docWidth:document.documentElement.scrollWidth,
    innerWidth:innerWidth
  }));
  const lcp=snap.events.lcp?.at(-1)||null;
  const ready=snap.events.ready?.[0]??null;
  const changedAt=snap.events.changes.find(x=>ready!=null&&x.t>ready&&x.to&&x.to!=='1')?.t??null;
  const targets={lcpPlus300:lcp?.t+300,preReady:ready-400,postReady:ready+400,postReadyLater:ready+800};
  const selected={};
  for(const [name,time] of Object.entries(targets)){
    const frame=closeFrame(frames,time);
    if(frame && Math.abs(frame.t-time)<750){
      selected[name]=frame;
      fs.writeFileSync(directory+'/'+index+'-'+name+'-'+frame.t+'.jpg',frame.image);
    }
  }
  const hero=frames.at(-1)?.rect;
  const full={x:0,y:0,width:mobile?412:1440,height:mobile?850:900};
  const pairs=[['lcpPlus300','preReady'],['preReady','postReady'],['lcpPlus300','postReadyLater']];
  const changes={};
  for(const [a,b] of pairs){
    changes[a+'__'+b]={hero:compare(selected[a],selected[b],hero),viewport:compare(selected[a],selected[b],full),
      atA:selected[a]?.t??null,atB:selected[b]?.t??null,
      sameNativeSlide:!selected[a]?.current||!selected[b]?.current||selected[a]?.current===selected[b]?.current};
  }
  Object.assign(output,{fcp:snap.events.paint.find(x=>x.name==='first-contentful-paint')?.t??null,
    lcp,ready,changedAt,hero,frameCount:frames.length,changes,errors,
    lcpToReady:ready!=null&&lcp?ready-lcp.t:null,
    selected:Object.fromEntries(Object.entries(selected).map(([n,x])=>[n,{t:x.t,current:x.current,firstVisibility:x.firstVisibility,canvas:x.canvasCount}])),
    events:snap.events});
  output.ok=output.http===200&&!!lcp?.t&&Number.isFinite(ready)&&frames.length>=8
      &&hero?.height>40&&errors.length===0&&snap.docWidth<=snap.innerWidth+3;
  console.log('SR7_HANDOFF_CASE '+JSON.stringify({device,index,ok:output.ok,lcp:output.lcp,
   fcp:output.fcp,ready,changedAt,frameCount:frames.length,selected:output.selected,
   changes:output.changes,errors}).slice(0,11000));
 }catch(e){
  output.error=String(e.stack||e).slice(0,1300);
  console.log('SR7_HANDOFF_ERROR '+JSON.stringify({device,index,error:output.error}));
 }finally{
  fs.writeFileSync(directory+'/'+index+'.json',JSON.stringify(output,null,2));
  await ctx.close();
 }
 return output;
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const rows=[];
 try{for(let i=0;i<cycles;i++)rows.push(await run(browser,i))}
 finally{await browser.close()}
 const ok=rows.filter(x=>x.ok);
 const scoped=ok.filter(x=>x.changes?.preReady__postReady?.sameNativeSlide&&x.changes.preReady__postReady.hero);
 const summary={
  device,expected:cycles,valid:ok.length,validFirstSlidePairs:scoped.length,
  medianLcp:median(ok.map(x=>x.lcp?.t)),medianReady:median(ok.map(x=>x.ready)),
  medianReadyMinusLcp:median(ok.map(x=>x.lcpToReady)),
  medianHeroPctChangedAroundReady:median(scoped.map(x=>x.changes.preReady__postReady.hero.changedPct)),
  medianViewportPctChangedAroundReady:median(scoped.map(x=>x.changes.preReady__postReady.viewport.changedPct)),
  medianHeroPctChangedFromLcpToReady:median(scoped.map(x=>x.changes.lcpPlus300__postReadyLater?.hero?.changedPct)),
  cases:rows.map(x=>({index:x.index,ok:x.ok,lcp:x.lcp?.t,ready:x.ready,frameCount:x.frameCount,
    changedAt:x.changedAt,aroundReady:x.changes?.preReady__postReady,error:x.error})),
  note:'Screencast/screenshot pixel difference (compression tolerant) is not Lighthouse SI. Only changes within same native first slide should count toward initial-handoff hypothesis. No production modification.'
 };
 fs.writeFileSync(directory+'/summary.json',JSON.stringify(summary,null,2));
 console.log('SR7_HANDOFF_SUMMARY '+JSON.stringify(summary).slice(0,25000));
 if(ok.length!==cycles)process.exitCode=1;
})().catch(e=>{console.error('SR7_HANDOFF_FATAL '+String(e.stack||e));process.exitCode=1});
