'use strict';
/** Read-only: inspect ACTUAL network jpeg/webp transfers triggered by Swiper,
 * including lazy/picture/srcset variants that a currentSrc-only audit can miss. */
const {chromium}=require('playwright');
const fs=require('node:fs');
const ORIGIN='https://ptscps.com.vn',SELECTOR='.elementor-element-1be3f74';
async function probe(browser,device){
 const context=await browser.newContext({viewport:{width:device.width,height:device.height},
   isMobile:device.mobile,hasTouch:device.mobile,deviceScaleFactor:device.dpr,serviceWorkers:'block'});
 const page=await context.newPage();
 const requests=[],errors=[];
 page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,200)));
 page.on('response',async res=>{
   const url=res.url();
   if(url.startsWith(ORIGIN+'/wp-content/uploads/')&&/\.(png|jpe?g|webp)(\?|$)/i.test(url)){
     const req=res.request();
     requests.push({url,
       status:res.status(),
       type:req.resourceType(),
       mimetype:(res.headers()['content-type']||'').split(';')[0],
       initiator:req.headers()['referer']?.slice(0,130)||null,
       transfer:res.headers()['content-length']||null,
       vary:res.headers()['vary']||null});
   }
 });
 const result={device:device.name,viewport:device.width,dpr:device.dpr};
 try{
   const r=await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded',timeout:70000});
   await page.locator(SELECTOR).scrollIntoViewIfNeeded({timeout:45000});
   await page.waitForTimeout(2200);
   const next=page.locator(SELECTOR+' .elementor-swiper-button-next');
   if(await next.count())for(let n=0;n<3;n++){
     await next.first().click({timeout:12000});
     await page.waitForTimeout(550);
   }
   await page.waitForTimeout(1200);
   result.http=r.status();
   result.dom=await page.evaluate(selector=>{
     const wrap=document.querySelector(selector);
     const nodes=[...(wrap?.querySelectorAll('img')||[])].map(img=>({
       src:img.getAttribute('src'), currentSrc:img.currentSrc,
       srcset:img.getAttribute('srcset'), sizes:img.getAttribute('sizes'),
       dataSrc:img.getAttribute('data-src'), dataSrcset:img.getAttribute('data-srcset'),
       loading:img.getAttribute('loading'),classes:img.getAttribute('class'),
       w:img.naturalWidth,h:img.naturalHeight
     }));
     const urlSet=new Set();
     for(const n of nodes)for(const k of ['src','currentSrc','dataSrc']){
       if(n[k])urlSet.add(n[k]);
     }
     return {images:nodes.length,uniqueDomUrls:urlSet.size,
       scaledElements:nodes.filter(n=>/-scaled\.(jpg|jpeg|png)/i.test(JSON.stringify(n))).slice(0,12),
       srcsetExamples:nodes.filter(n=>n.srcset||n.dataSrcset).slice(0,5),
       swiperState:wrap?.querySelector('.swiper')?.swiper?.activeIndex??null};
   },SELECTOR);
   const unique=new Map(requests.map(x=>[x.url,x]));
   result.images=[...unique.values()];
   result.jpeg=result.images.filter(x=>/image\/(jpeg|png)/i.test(x.mimetype));
   result.webp=result.images.filter(x=>x.mimetype==='image/webp');
   result.errors=errors;
   result.ok=r.status()===200&&!errors.length&&result.dom.images>=18;
   console.log('CUSTOMER_NETWORK_CASE '+JSON.stringify({device:result.device,ok:result.ok,
     images:result.images.length,jpegs:result.jpeg.map(x=>({path:new URL(x.url).pathname,mime:x.mimetype})),
     webp:result.webp.length,dom:result.dom.images,
     scaledDom:result.dom.scaledElements.map(x=>({src:x.src,currentSrc:x.currentSrc,srcset:x.srcset?.slice(0,400),dataSrc:x.dataSrc})),
     errors}).slice(0,14000));
 }catch(e){result.ok=false;result.error=String(e.stack||e).slice(0,600);console.log('CUSTOMER_NETWORK_ERROR '+JSON.stringify(result).slice(0,1200));}
 await context.close();
 return result;
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const list=[];
 try{
  for(const device of [{name:'mobile1x',width:412,height:850,mobile:true,dpr:1},
    {name:'mobile2x',width:412,height:850,mobile:true,dpr:2},
    {name:'desktop1x',width:1440,height:900,mobile:false,dpr:1}])
    list.push(await probe(browser,device));
 }finally{await browser.close();}
 const bad=[...new Map(list.flatMap(x=>x.jpeg||[]).map(x=>[x.url,x])).values()];
 const summary={samples:list.length,valid:list.filter(x=>x.ok).length,
   remainingJpegPng:bad.map(x=>({url:x.url,mime:x.mimetype})),
   devices:list.map(x=>({device:x.device,ok:x.ok,loaded:x.images?.length,remaining:x.jpeg?.length}))};
 fs.writeFileSync('customer-network-variants.json',JSON.stringify({summary,results:list},null,2));
 console.log('CUSTOMER_NETWORK_SUMMARY '+JSON.stringify(summary));
 if(summary.valid!==list.length)process.exitCode=1;
})().catch(e=>{console.error('CUSTOMER_NETWORK_FATAL '+String(e.stack||e));process.exitCode=1});
