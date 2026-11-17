'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
  const reports=[];
  try {
    for(const d of [{name:'mobile',width:412,height:850},{name:'desktop',width:1440,height:900}]){
      const ctx=await browser.newContext({viewport:{width:d.width,height:d.height},
        isMobile:d.width<768,hasTouch:d.width<768,serviceWorkers:'block',deviceScaleFactor:1});
      const p=await ctx.newPage();
      const imageEvents=[];
      const errors=[];
      p.on('pageerror',e=>errors.push(String(e.message).slice(0,160)));
      p.on('requestfinished',req=>{
        if(req.resourceType()==='image'&&req.url().includes('/wp-content/uploads/')){
          imageEvents.push({url:req.url().split('?')[0].split('/').slice(-2).join('/'),at:Date.now()});
        }
      });
      const res=await p.goto('https://ptscps.com.vn/',{waitUntil:'domcontentloaded',timeout:70000});
      await p.waitForTimeout(1600);
      const before=await p.evaluate(()=>{
        const section=document.querySelector('.elementor-element-1be3f74');
        if(!section)return {error:'missing section'};
        const r=section.getBoundingClientRect();
        const els=[...section.querySelectorAll('img.swiper-slide-image')];
        return {section:{top:Math.round(r.top),height:Math.round(r.height),id:section.id,cls:section.className},
          count:els.length,
          widgets:[...section.querySelectorAll('.elementor-widget')].map(w=>({
            id:w.getAttribute('data-id'),widgetType:w.getAttribute('data-widget_type'),
            images:w.querySelectorAll('img.swiper-slide-image').length
          })).filter(w=>w.images),
          images:els.map((el,i)=>({
            i,src:el.getAttribute('src')?.split('/').slice(-2).join('/'),
            srcset:!!el.getAttribute('srcset'),
            loading:el.getAttribute('loading'),
            width:el.getAttribute('width'),height:el.getAttribute('height'),
            nw:el.naturalWidth,nh:el.naturalHeight,complete:el.complete,
            attrStyle:el.getAttribute('style'),
            rect:{w:Math.round(el.getBoundingClientRect().width),h:Math.round(el.getBoundingClientRect().height)},
            outer: i<2 ? el.outerHTML.slice(0,450):undefined
          }))
        };
      });
      await p.locator('.elementor-element-1be3f74').scrollIntoViewIfNeeded();
      await p.waitForTimeout(2600);
      const after=await p.evaluate(()=>{
        const imgs=[...document.querySelectorAll('.elementor-element-1be3f74 img.swiper-slide-image')];
        const sec=document.querySelector('.elementor-element-1be3f74');
        return {sectionHeight:sec.getBoundingClientRect().height,loaded:imgs.filter(i=>i.naturalWidth>0).length,
          first:imgs.slice(0,20).map(i=>({file:i.currentSrc.split('/').slice(-1)[0],w:i.naturalWidth,h:i.naturalHeight}))};
      });
      const row={device:d.name,http:res.status(),before,after,imageRequestCount:imageEvents.length,
        imageEvents:imageEvents.map(x=>x.url),errors};
      reports.push(row);
      console.log('CAROUSEL_AUDIT '+JSON.stringify(row).slice(0,24000));
      await ctx.close();
    }
    fs.writeFileSync('ptscps-carousel-image-audit.json',JSON.stringify(reports,null,2));
  }finally{await browser.close()}
})().catch(e=>{console.error('CAROUSEL_AUDIT_FAIL '+e.stack);process.exitCode=1});
