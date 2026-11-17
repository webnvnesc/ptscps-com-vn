'use strict';
/** Read only HTTP validation for exact two -scaled images and safety invariants. */
const fs=require('node:fs');
const {chromium}=require('playwright');
const state=JSON.parse(fs.readFileSync('customer-webp-scaled-created.json','utf8'));
if(state.marker!=='PTSCPS_CUSTOMER_WEBP_SCALED_20261117_v1')throw Error('Unexpected migration state');
if(state.created.length!==2)throw Error('Both audited scaled variants must convert');
const origin='https://ptscps.com.vn/wp-content/uploads/';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const results=[];
 try {
  for(const device of [{name:'mobile',width:412,height:850,isMobile:true},{name:'desktop',width:1440,height:900,isMobile:false}]) {
   const ctx=await browser.newContext({viewport:{width:device.width,height:device.height},isMobile:device.isMobile,hasTouch:device.isMobile,serviceWorkers:'block'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const home=await page.goto('https://ptscps.com.vn/',{waitUntil:'domcontentloaded',timeout:70000});
   await page.locator('.elementor-element-1be3f74').scrollIntoViewIfNeeded({timeout:30000});
   await page.waitForTimeout(900);
   const section=await page.evaluate(()=>{
    const wrap=document.querySelector('.elementor-element-1be3f74');
    return {count:wrap?.querySelectorAll('img.swiper-slide-image').length||0,
      docWidth:document.documentElement.scrollWidth,
      carouselHasArrows:!!document.querySelector('.elementor-element-ed1c7da .elementor-swiper-button-next'),
      logoImgs:[...(wrap?.querySelectorAll('img.swiper-slide-image')||[])].length};
   });
   if(home.status()!==200||section.count<18||section.docWidth>device.width+3||errors.length)throw Error('Homepage layout regression '+device.name+' '+JSON.stringify({status:home.status(),section,errors}));
   for(const row of state.created){
    const url=origin+row.file;
    const webp=await ctx.request.get(url,{timeout:30000,headers:{Accept:'image/webp,image/*;q=0.9,*/*;q=0.8','Cache-Control':'no-cache'}});
    const jpeg=await ctx.request.get(url,{timeout:30000,headers:{Accept:'image/jpeg,image/*;q=0.9,*/*;q=0.8','Cache-Control':'no-cache'}});
    const wb=await webp.body(),jb=await jpeg.body();
    const one={device:device.name,path:row.file,
      webpStatus:webp.status(),webpMime:webp.headers()['content-type'],webpSize:wb.length,
      jpegStatus:jpeg.status(),jpegMime:jpeg.headers()['content-type'],jpegSize:jb.length,
      webpMagic:wb.subarray(0,4).toString('latin1')==='RIFF'&&wb.subarray(8,12).toString('latin1')==='WEBP',
      jpegMagic:jb[0]===0xff&&jb[1]===0xd8&&jb[2]===0xff,
      vary:webp.headers()['vary']||''};
    one.ok=one.webpStatus===200&&one.jpegStatus===200&&
      one.webpMime.startsWith('image/webp')&&one.jpegMime.startsWith('image/jpeg')&&
      one.webpSize===row.webpBytes&&one.jpegSize===row.sourceBytes&&
      one.webpMagic&&one.jpegMagic&&one.webpSize<one.jpegSize*0.96;
    results.push(one);
    console.log('CUSTOMER_SCALED_HTTP_CASE '+JSON.stringify(one));
   }
   await ctx.close();
  }
 }finally{await browser.close();}
 const report={cases:results.length,valid:results.filter(x=>x.ok).length,
   created:state.created.length,
   savings:state.created.map(x=>({file:x.file,sourceBytes:x.sourceBytes,webpBytes:x.webpBytes,
     savedPercent:Math.round(1000*(1-x.webpBytes/x.sourceBytes))/10}))};
 fs.writeFileSync('customer-scaled-webp-http.json',JSON.stringify(report,null,2));
 console.log('CUSTOMER_SCALED_WEBP_SUMMARY '+JSON.stringify(report));
 if(report.valid!==4)process.exitCode=1;
})().catch(e=>{console.error('CUSTOMER_SCALED_WEBP_FATAL '+String(e.stack||e));process.exitCode=1});
