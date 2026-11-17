'use strict';
/**
 * Read-only production inventory of the existing Elementor customer/partner carousel.
 * Inspect the exact image URL (including srcset/currentSrc), WebP content negotiation,
 * original JPEG/PNG fallback and current lazy-load behavior. No writes or interception.
 */
const {chromium} = require('playwright');
const fs = require('node:fs');
const origin = 'https://ptscps.com.vn';
const selector = '.elementor-element-1be3f74';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const result=[];
 try{
  for(const device of [
   {name:'mobile',width:412,height:850,isMobile:true},
   {name:'desktop',width:1440,height:900,isMobile:false}
  ]){
   const ctx=await browser.newContext({viewport:{width:device.width,height:device.height},isMobile:device.isMobile,hasTouch:device.isMobile,serviceWorkers:'block'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message.slice(0,200)));
   const doc=await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:70000});
   await page.locator(selector).scrollIntoViewIfNeeded({timeout:28000});
   await page.waitForTimeout(2000);
   const assets=await page.evaluate((selector)=>{
    const section=document.querySelector(selector);
    return {
      nodeCount:section?.querySelectorAll('img.swiper-slide-image').length||0,
      sectionHTML:section?.outerHTML.slice(0,1000)||'',
      items:[...(section?.querySelectorAll('img.swiper-slide-image')||[])].map(img=>({
        src:img.currentSrc||img.src||img.getAttribute('data-src')||'',
        original:img.getAttribute('src')||'',
        dataSrc:img.getAttribute('data-src'),
        dataSrcset:img.getAttribute('data-srcset'),
        naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,
        width:img.getAttribute('width'),height:img.getAttribute('height')
      }))
    };
   },selector);
   const urls=[...new Set(assets.items.map(i=>i.src).filter(Boolean))];
   const checked=[];
   for(const original of urls.slice(0,45)){
    const item={url:original};
    try{
     const u=new URL(original,origin);
     item.sameHost=u.host==='ptscps.com.vn';
     item.ext=u.pathname.match(/\.(jpe?g|png|webp|gif|svg)$/i)?.[1]?.toLowerCase()||'unknown';
     item.uploads=u.pathname.includes('/wp-content/uploads/');
     if(!item.uploads||!['jpg','jpeg','png'].includes(item.ext)){item.skipped=true;checked.push(item);continue;}
     const webp=await ctx.request.get(u.href,{timeout:25000,headers:{'Accept':'image/webp,image/*;q=0.8,*/*;q=0.5','Cache-Control':'no-cache'}});
     const fallback=await ctx.request.get(u.href,{timeout:25000,headers:{'Accept':'image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5','Cache-Control':'no-cache'}});
     item.webp={status:webp.status(),mime:(webp.headers()['content-type']||'').split(';')[0].trim(),bytes:(await webp.body()).length,vary:webp.headers()['vary']||''};
     item.fallback={status:fallback.status(),mime:(fallback.headers()['content-type']||'').split(';')[0].trim(),bytes:(await fallback.body()).length,vary:fallback.headers()['vary']||''};
     item.webPActive=item.webp.status===200&&item.webp.mime==='image/webp'
       &&item.fallback.status===200&&/image\/(jpeg|png)/.test(item.fallback.mime);
     if(item.webPActive)item.savedPct=Math.round((1-item.webp.bytes/item.fallback.bytes)*1000)/10;
    }catch(e){item.error=String(e.message||e).slice(0,180);}
    checked.push(item);
   }
   const out={device:device.name,http:doc.status(),errors,count:assets.nodeCount,unique:urls.length,items:checked};
   console.log('CUSTOMER_WEBP_CASE '+JSON.stringify({device:out.device,http:out.http,count:out.count,unique:out.unique,webp:checked.filter(x=>x.webPActive).length,missing:checked.filter(x=>x.uploads&&!x.webPActive).length,errors:out.errors}).slice(0,1300));
   result.push(out);
   await ctx.close();
  }
 }finally{await browser.close();}
 const primary=result.find(x=>x.device==='desktop')||result[0];
 const uniq=primary?.items||[];
 const summary={devices:result.map(x=>({name:x.device,http:x.http,images:x.count,unique:x.unique,errors:x.errors})),
  uniqueImages:uniq.length,
  eligible:uniq.filter(x=>x.uploads&&['jpg','jpeg','png'].includes(x.ext)).length,
  webp:uniq.filter(x=>x.webPActive).length,
  missing:uniq.filter(x=>x.uploads&&!x.webPActive).length,
  assets:uniq.map(x=>({url:x.url,ext:x.ext,webPActive:x.webPActive??false,webp:x.webp,fallback:x.fallback,savedPct:x.savedPct,error:x.error}))};
 fs.writeFileSync('customer-carousel-webp-readonly.json',JSON.stringify({summary,full:result},null,2));
 console.log('CUSTOMER_WEBP_SUMMARY '+JSON.stringify(summary).slice(0,26000));
 if(result.length!==2||result.some(x=>x.http!==200||x.count<15||x.errors.length))process.exitCode=1;
})().catch(e=>{console.error('CUSTOMER_WEBP_FATAL '+String(e.stack||e).slice(0,1300));process.exitCode=1});
