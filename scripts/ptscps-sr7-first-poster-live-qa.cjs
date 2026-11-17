'use strict';
const {chromium}=require('playwright');
const {PNG}=require('pngjs');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const list=[];
 const checks=[
  {device:'desktop',width:1440,js:false,path:'/'},
  {device:'mobile',width:412,js:false,path:'/'},
  {device:'desktop',width:1440,js:true,path:'/'},
  {device:'mobile',width:412,js:true,path:'/'},
  {device:'desktop',width:1440,js:true,path:'/thu-ngo.htm'},
  {device:'mobile',width:412,js:true,path:'/lien-he'}
 ];
 try{
  for(const c of checks){
   const mobile=c.device==='mobile';
   const ctx=await browser.newContext({
    viewport:{width:c.width,height:mobile?850:900},isMobile:mobile,hasTouch:mobile,
    deviceScaleFactor:1,javascriptEnabled:c.js,serviceWorkers:'block',
    userAgent:mobile?'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
   });
   const page=await ctx.newPage(),errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message.slice(0,240)));
   page.on('response',r=>{if(/\/wp-content\/uploads\/.*\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(r.url()))requests.push({url:r.url(),status:r.status()})});
   if(c.js)await page.addInitScript(()=>{
     window.__ptscpsCLS=[];
     try{new PerformanceObserver(list=>list.getEntries().forEach(e=>{
       if(!e.hadRecentInput)window.__ptscpsCLS.push(e.value)
     })).observe({type:'layout-shift',buffered:true})}catch{}
   });
   const record={...c};
   try{
    const response=await page.goto('https://ptscps.com.vn'+c.path,{waitUntil:'domcontentloaded',timeout:80000});
    if(c.path!=='/'){
     const unexpected=await page.locator('[data-ptscps-poster]').count();
     const ok=response.status()===200&&!unexpected&&!errors.length;
     Object.assign(record,{http:response.status(),unexpected,errors,passed:ok});
     list.push(record);console.log('POSTER_LIVE_QA '+JSON.stringify(record));
     await ctx.close();continue;
    }
    await page.waitForTimeout(1250);
    const result=await page.evaluate(()=>{
      const m=document.querySelector('sr7-module#SR7_1_1');
      if(!m)return {error:'SR7 module absent'};
      const first=m.querySelector('sr7-slide'),img=first?.querySelector('sr7-bg noscript img');
      const src=img?.getAttribute('src')||img?.src||null;
      const r=m.getBoundingClientRect();
      const style=getComputedStyle(m);
      const visible=first?getComputedStyle(first).visibility:null;
      return {moduleId:m.id,src,poster:m.getAttribute('data-ptscps-poster'),
       bg:style.backgroundImage,rect:[r.x,r.y,r.width,r.height].map(Math.round),
       slide: first?.id,firstVisibility:visible,slideCount:m.querySelectorAll('sr7-slide').length,
       cls:(window.__ptscpsCLS||[]).reduce((s,e)=>s+e,0),scriptCount:[...document.querySelectorAll('script[src]')].filter(x=>/revslider|sr7|tptools/i.test(x.src)).length,
       cacheMode:document.body.classList.contains('is-mobile')?'mobile':document.body.classList.contains('is-desktop')?'desktop':'unknown'
      };
    });
    let pixel=null;
    if(!c.js&&result.rect){
     const pic=PNG.sync.read(await page.screenshot({timeout:30000}));
     const [rx,ry,rw,rh]=result.rect;
     let total=0,nonwhite=0,blue=0;
     for(let y=Math.max(2,ry+8);y<Math.min(pic.height-2,ry+rh-8);y+=9)
      for(let x=Math.max(2,rx+8);x<Math.min(pic.width-2,rx+rw-8);x+=9){
       const i=(pic.width*y+x)*4,r=pic.data[i],g=pic.data[i+1],b=pic.data[i+2];
       total++;if(r<225||g<225||b<225)nonwhite++;
       if(b>r+25&&b>g+8)blue++;
      }
     pixel={total,nonwhite:Math.round(100*nonwhite/Math.max(1,total)),blue:Math.round(100*blue/Math.max(1,total))};
    }
    const matches=(result.src||'')===(result.poster||'');
    const visibleBg=result.bg?.includes(result.src?.split('/').at(-1)||'#notfound');
    const geometry=result.rect&&result.rect[2]>(mobile?360:590)&&result.rect[3]>175&&result.rect[3]<350;
    const imgRequested=requests.some(x=>x.url===result.src&&x.status===200);
    const complete=response.status()===200&&matches&&visibleBg&&geometry&&imgRequested&&
      result.slideCount>=3&&result.cacheMode===c.device&&errors.length===0&&
      result.cls<0.055&&(!pixel||pixel.blue>=27&&pixel.nonwhite>=33);
    Object.assign(record,{http:response.status(),result,pixel,requests:requests.filter(x=>x.url===result.src),errors,passed:!!complete});
   }catch(e){Object.assign(record,{passed:false,error:String(e.stack||e).slice(0,450),errors})}
   list.push(record);console.log('POSTER_LIVE_QA '+JSON.stringify(record).slice(0,9000));
   await ctx.close();
  }
 }finally{await browser.close()}
 const summary={total:list.length,passed:list.filter(x=>x.passed).length,fail:list.filter(x=>!x.passed).map(x=>({device:x.device,js:x.js,path:x.path,error:x.error,result:x.result,pixel:x.pixel,errors:x.errors}))};
 fs.writeFileSync('sr7-poster-live-results.json',JSON.stringify(list,null,2));
 console.log('POSTER_LIVE_SUMMARY '+JSON.stringify(summary).slice(0,12000));
 if(summary.passed!==summary.total)process.exitCode=1;
})().catch(e=>{console.error('POSTER_LIVE_FATAL '+String(e.stack||e));process.exitCode=1});
