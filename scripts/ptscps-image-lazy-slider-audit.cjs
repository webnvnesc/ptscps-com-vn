'use strict';
// Read-only browser audit: image request timing, lazy loading and SR7 responsive pixel sizes.
// No WordPress, Elementor, Jannah, FTP or Slider Revolution files are edited.
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root='https://ptscps.com.vn';
const width=Number(process.env.TEST_WIDTH||412);
const mobile=width<700;
const dpr=mobile?2:1;
const folder='image-audit-'+width;
const paths=[
  {name:'home',path:'/'},
  {name:'news-category',path:'/c/hoat-dong-cua-cong-ty'},
  {name:'service-detail',path:'/dich-vu/van-hanh-va-bao-duong-fpso-fso-mopu'}
];
fs.mkdirSync(folder,{recursive:true});
const ms=v=>Math.round(v||0);
function short(v,max=190){return String(v||'').slice(0,max);}
function rel(u){try {const x=new URL(u,root);return x.origin===root?x.pathname+x.search:x.origin+x.pathname+x.search} catch{return short(u)}}
function isImageURL(u){return /\.(?:jpe?g|png|webp|avif|gif|svg)(?:\?|$)/i.test(u||'');}
async function run(browser,entry){
 const context=await browser.newContext({
   viewport:{width,height:mobile?823:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:dpr,
   ...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})
 });
 const page=await context.newPage();
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 const network=new Map(),errors=[];
 page.on('pageerror',e=>errors.push(short(e.message,200)));
 cdp.on('Network.requestWillBeSent',e=>{
   if(e.type==='Image'||isImageURL(e.request.url)){
     network.set(e.requestId,{url:e.request.url,start:e.timestamp,initialPriority:e.request.initialPriority||null,initiator:e.initiator?.type||null,type:e.type});
   }
 });
 cdp.on('Network.responseReceived',e=>{
   const r=network.get(e.requestId); if(!r)return;
   Object.assign(r,{status:e.response.status,protocol:e.response.protocol,fromDiskCache:e.response.fromDiskCache,
     responseTime:e.timestamp,mimeType:e.response.mimeType});
 });
 cdp.on('Network.loadingFinished',e=>{
   const r=network.get(e.requestId);if(r)Object.assign(r,{end:e.timestamp,bytes:e.encodedDataLength});
 });
 cdp.on('Network.loadingFailed',e=>{
   const r=network.get(e.requestId);if(r)r.error=e.errorText;
 });
 let initial=null;
 try{
   const response=await page.goto(root+entry.path,{waitUntil:'domcontentloaded',timeout:75000});
   await page.waitForTimeout(3200);
   initial=await page.evaluate(({dpr})=>{
     const viewport={width:innerWidth,height:innerHeight,scrollY:scrollY,dpr,docHeight:document.documentElement.scrollHeight};
     const ms=v=>Math.round(v||0);
     const short=(v,n=190)=>String(v||'').slice(0,n);
     const isImageURL=u=>/\.(?:jpe?g|png|webp|avif|gif|svg)(?:\?|$)/i.test(u||'');
     const seen=new Set();
     const clean=(u)=>{try{return new URL(u,location.href).href}catch{return u||''}};
     const row=(e)=>{
       const r=e.getBoundingClientRect(),c=getComputedStyle(e);
       const p=e.closest('sr7-module, rs-module, .rev_slider_wrapper, .rev_slider, sr7-wrap');
       let dataset={};
       for(const [k,v] of Object.entries(e.dataset||{}))if(/(?:src|lazy|bg|original|slide|width|height)/i.test(k))dataset[k]=String(v).slice(0,160);
       return {
         tag:e.localName,
         selector:(e.id?'#'+e.id:e.localName+'.'+String(e.className?.baseVal||e.className||'').trim().split(/\s+/).slice(0,3).join('.')).slice(0,160),
         inSlider:!!p, sliderSelector:p?((p.id?'#'+p.id:p.localName+'.'+String(p.className||'').trim().split(/\s+/).slice(0,3).join('.')).slice(0,100)):null,
         top:Math.round(r.top),bottom:Math.round(r.bottom),
         left:Math.round(r.left),renderWidth:Math.round(r.width),renderHeight:Math.round(r.height),
         aboveFold:r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth,
         farBelow:r.top>innerHeight+750,
         display:c.display,visibility:c.visibility,opacity:c.opacity,objectFit:c.objectFit,
         backgroundSize:c.backgroundSize,backgroundPosition:c.backgroundPosition,
         dataset
       };
     };
     const imgs=[...document.images].map((e,i)=>{
       const r=row(e);
       return {...r,index:i,src:clean(e.getAttribute('src')||''),currentSrc:e.currentSrc||'',
         loading:e.getAttribute('loading')||'auto',fetchpriority:e.getAttribute('fetchpriority')||'auto',
         decoding:e.getAttribute('decoding')||'auto',srcset:(e.getAttribute('srcset')||'').slice(0,400),
         sizes:(e.getAttribute('sizes')||'').slice(0,200),
         naturalWidth:e.naturalWidth,naturalHeight:e.naturalHeight,complete:e.complete,
         apparentPixelRatio:e.naturalWidth&&r.renderWidth?Number((e.naturalWidth/(r.renderWidth*dpr)).toFixed(2)):null};
     });
     const css=[];
     // Preserve only computed image URLs; inspect slider DOM + background images.
     const elements=[...document.querySelectorAll('body *')];
     for(const e of elements){
       const rs=e.closest('sr7-module, rs-module, sr7-wrap, .rev_slider, .rev_slider_wrapper');
       if(!rs && !/^(DIV|SECTION|A)$/.test(e.tagName))continue;
       const st=getComputedStyle(e),bg=st.backgroundImage||'';
       const hasbg=bg.includes('url(')&&!bg.includes('data:image');
       const data=Object.entries(e.dataset||{}).filter(([k,v])=>/(?:src|lazy|bg)/i.test(k)&&isImageURL(v)).slice(0,5);
       if(hasbg|| (rs && data.length)){
         const info=row(e);
         const sources=[...bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m=>clean(m[1]));
         css.push({...info,background:short(bg,400),sources,data});
       }
       if(css.length>=200)break;
     }
     const slider=document.querySelector('sr7-module, rs-module, .rev_slider, .rev_slider_wrapper, sr7-wrap');
     const sliderStructure=slider?{
       ...row(slider),node:slider.outerHTML.slice(0,1200),
       tags:[...new Set([...slider.querySelectorAll('*')].map(e=>e.localName))].slice(0,30),
       slideCount:slider.querySelectorAll('sr7-slide,rs-slide').length,
       layers:slider.querySelectorAll('sr7-img,rs-layer,.tp-bgimg').length
     }:null;
     const nav=performance.getEntriesByType('navigation')[0];
     const fcp=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint')?.startTime||null;
     const pres=[...document.querySelectorAll('link[rel=preload][as=image]')].map(e=>({href:e.href,imagesrcset:e.getAttribute('imagesrcset'),imagesizes:e.getAttribute('imagesizes')}));
     const resources=performance.getEntriesByType('resource').filter(e=>e.initiatorType==='img'||/\.(?:jpg|jpeg|png|webp|avif|gif)(?:[?#]|$)/i.test(e.name))
       .map(e=>({url:e.name,initiator:e.initiatorType,start:ms(e.startTime),end:ms(e.responseEnd),bytes:e.transferSize,encoded:e.encodedBodySize,decoded:e.decodedBodySize}));
     return {
       viewport,htmlStatus:document.readyState,ttfb:ms(nav?.responseStart),fcp:ms(fcp),
       imgs,css,sliderStructure,preloads:pres,resources,
       imgStats:{total:imgs.length,attrLazy:imgs.filter(x=>x.loading==='lazy').length,
         attrEager:imgs.filter(x=>x.loading==='eager').length,
         attrAuto:imgs.filter(x=>x.loading==='auto').length,
         farBelow:imgs.filter(x=>x.farBelow).length,
         farBelowLoaded:imgs.filter(x=>x.farBelow&&x.complete&&x.naturalWidth>0).length,
         farBelowLazy:imgs.filter(x=>x.farBelow&&x.loading==='lazy').length,
         offscreenLoaded:imgs.filter(x=>!x.aboveFold&&x.complete&&x.naturalWidth>0).length,
         sliderImg:imgs.filter(x=>x.inSlider).length,
         bigOffscreenLoaded:imgs.filter(x=>x.farBelow&&x.complete&&x.naturalWidth>=600).length
       }
     };
   },{dpr});
   const net=[...network.values()];
   const firstStart=net.length?Math.min(...net.map(x=>x.start)):0;
   const imageTraffic=net.map(x=>({...x,url:rel(x.url),startMs:ms((x.start-firstStart)*1000),
     endMs:x.end?ms((x.end-firstStart)*1000):null}));
   const loadedUrls=new Set(imageTraffic.filter(x=>x.status&&x.status<400).map(x=>x.url));
   const images=initial.imgs.map(x=>({...x,
      requestObserved:loadedUrls.has(rel(x.currentSrc||x.src)),
      requestedUrl:rel(x.currentSrc||x.src)
   }));
   const sliderURLs=[...new Set([
      ...images.filter(x=>x.inSlider).map(x=>x.currentSrc||x.src),
      ...initial.css.filter(x=>x.inSlider).flatMap(x=>x.sources||[])
   ])].filter(x=>x.startsWith('http')&&!x.startsWith('data:')).slice(0,12);
   // Dimension probe occurs after FCP / first snapshot to avoid perturbing first-load network evidence.
   const actualImageDimensions=await page.evaluate(async urls=>{
     const results=[];
     for(const url of urls){
       try{
         const r=await fetch(url,{credentials:'same-origin',cache:'force-cache'});
         if(!r.ok){results.push({url,error:'HTTP '+r.status});continue}
         const blob=await r.blob();
         const bitmap=await createImageBitmap(blob);
         results.push({url,width:bitmap.width,height:bitmap.height,blobBytes:blob.size,mime:blob.type});
         bitmap.close();
       }catch(e){results.push({url,error:String(e).slice(0,140)})}
     }
     return results;
   },sliderURLs);
   // Optional lazy-load activation test: scroll only after initial measurement and screenshot.
   await page.screenshot({path:path.join(folder,entry.name+'-viewport.png'),animations:'disabled',timeout:30000});
   const lazyCandidate=images.find(x=>x.farBelow&&x.loading==='lazy'&&x.naturalWidth===0&&x.renderWidth>1);
   let lazyAfterScroll=null;
   if(lazyCandidate){
     try{
       await page.evaluate(index=>{
         const img=document.images[index];if(img)img.scrollIntoView({block:'center',behavior:'instant'});
       },lazyCandidate.index);
       await page.waitForTimeout(1700);
       lazyAfterScroll=await page.evaluate(index=>{
         const x=document.images[index];return x?{
           complete:x.complete,naturalWidth:x.naturalWidth,naturalHeight:x.naturalHeight,
           top:Math.round(x.getBoundingClientRect().top),src:x.currentSrc
         }:null;
       },lazyCandidate.index);
     }catch(e){lazyAfterScroll={error:String(e).slice(0,120)}}
   }
   const results={page:entry.name,url:root+entry.path,width,status:response.status(),...initial,
     imgs:images,network:imageTraffic,sliderImageDimensions:actualImageDimensions,
     lazyAfterScroll:{initial:lazyCandidate?{index:lazyCandidate.index,url:rel(lazyCandidate.currentSrc||lazyCandidate.src),complete:lazyCandidate.complete,loading:lazyCandidate.loading}:null,result:lazyAfterScroll},
     errors};
   fs.writeFileSync(path.join(folder,entry.name+'.json'),JSON.stringify(results,null,2));
   const loadedFar=images.filter(x=>x.farBelow&&x.complete&&x.naturalWidth>0);
   const big=loadedFar.filter(x=>x.naturalWidth>600);
   console.log('PAGE '+JSON.stringify({
     page:entry.name,width,status:response.status(),ttfb:initial.ttfb,fcp:initial.fcp,
     stats:initial.imgStats,loadedFarBig:big.slice(0,12).map(x=>({u:rel(x.currentSrc||x.src),
       loading:x.loading,natural:[x.naturalWidth,x.naturalHeight],render:[x.renderWidth,x.renderHeight],top:x.top})),
     sliderStructure:initial.sliderStructure && {selector:initial.sliderStructure.selector,
       size:[initial.sliderStructure.renderWidth,initial.sliderStructure.renderHeight],slideCount:initial.sliderStructure.slideCount},
     sliderImages:images.filter(x=>x.inSlider).slice(0,15).map(x=>({
       url:rel(x.currentSrc||x.src),src:rel(x.src),loading:x.loading,fetchpriority:x.fetchpriority,
       natural:[x.naturalWidth,x.naturalHeight],render:[x.renderWidth,x.renderHeight],
       top:x.top,visible:x.aboveFold,scale:x.apparentPixelRatio,srcset:short(x.srcset,100),sizes:x.sizes})),
     sliderBg:initial.css.filter(x=>x.inSlider).slice(0,10).map(x=>({
       selector:x.selector,render:[x.renderWidth,x.renderHeight],top:x.top,
       urls:(x.sources||[]).map(rel),data:x.data,backgroundSize:x.backgroundSize})),
     sliderImageDimensions:actualImageDimensions.slice(0,10).map(x=>({...x,url:rel(x.url)})),
     firstImageRequests:imageTraffic.slice(0,18).map(x=>({url:x.url,start:x.startMs,end:x.endMs,bytes:x.bytes,priority:x.initialPriority})),
     lazyAfterScroll:results.lazyAfterScroll,errors
   }));
 }catch(e){
   console.log('FAILED '+JSON.stringify({page:entry.name,width,error:String(e.stack||e).slice(0,900)}));
   process.exitCode=1;
 }finally{await context.close()}
}
async function main(){
 const browser=await chromium.launch({headless:true});
 try{for(const entry of paths)await run(browser,entry)}finally{await browser.close()}
}
main().catch(e=>{console.error('FATAL',e.stack||String(e));process.exitCode=1});
