'use strict';
/** Production smoke QA: fresh browser contexts, no modifications to the site. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const base = 'https://ptscps.com.vn';
const pages = ['/', '/lien-he', '/dich-vu', '/thu-ngo.htm', '/e'];
const modes = [
  {name:'mobile',width:412,height:850,isMobile:true,hasTouch:true},
  {name:'desktop',width:1440,height:900,isMobile:false,hasTouch:false}
];
(async () => {
  const browser = await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
  const cases = [];
  try {
    for(const mode of modes) for(const path of pages) {
      const context = await browser.newContext({
        viewport:{width:mode.width,height:mode.height},
        deviceScaleFactor:1,isMobile:mode.isMobile,hasTouch:mode.hasTouch,
        serviceWorkers:'block'
      });
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      page.on('pageerror',error=>errors.push(String(error.message).slice(0,180)));
      page.on('request',request=>{
        if(/eicons|fonts\.googleapis|fonts\.gstatic|tielabs-fonticon/.test(request.url())) {
          requests.push({type:request.resourceType(),url:request.url().split('?')[0]});
        }
      });
      const item={path,device:mode.name};
      try{
        const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:65000});
        await page.waitForTimeout(path==='/'?3400:900);
        item.http=response.status();
        item.data=await page.evaluate(()=>{
          const head=[...document.querySelectorAll('head link[rel="preconnect"]')].map(el=>el.href);
          const arrows=[...document.querySelectorAll('.elementor-element-ed1c7da .elementor-swiper-button')];
          return {
            preconnect:head,
            exo:!!document.querySelector('link[href*="ptscps-exo-fonts/exo-direct-v1.css"]'),
            svg:arrows.map(el=>({
              buttonClass:el.className,svgCount:el.querySelectorAll('svg.ptscps-carousel-svg').length,
              iconCount:el.querySelectorAll('i.eicon-chevron-left,i.eicon-chevron-right').length,
              aria:el.getAttribute('aria-label'),display:getComputedStyle(el).display,
              box:el.getBoundingClientRect().toJSON()
            })),
            slides:document.querySelectorAll('.elementor-element-ed1c7da .swiper-slide').length,
            docWidth:document.documentElement.scrollWidth,
            bodyFont:getComputedStyle(document.body).fontFamily,
            poster:!!document.querySelector('sr7-module')
          };
        });
        item.requests=requests;
        item.errors=errors;
        const googleHints=item.data.preconnect.filter(x=>/^https:\/\/fonts\.(googleapis|gstatic)\.com\//i.test(x));
        item.checks={
          validHTTP:item.http===200,
          noGoogleHints:googleHints.length===0,
          exoPresent:item.data.exo,
          noJsErrors:errors.length===0,
          noHorizontalOverflow:item.data.docWidth<=mode.width+3,
          svgArrows:path!=='/'||(item.data.svg.length===2&&item.data.svg.every(x=>x.svgCount===1&&x.iconCount===0&&x.aria&&x.box.width>0&&x.box.height>0)),
          swiperPresent:path!=='/'||item.data.slides>=2
        };
        // Compare slide state before and after pressing the verified next control.
        if(path==='/'&&item.checks.svgArrows&&item.checks.swiperPresent) {
          const before=await page.evaluate(()=>document.querySelector('.elementor-element-ed1c7da .swiper')?.swiper?.activeIndex);
          await page.locator('.elementor-element-ed1c7da .elementor-swiper-button-next').click({timeout:10000});
          await page.waitForTimeout(450);
          const after=await page.evaluate(()=>document.querySelector('.elementor-element-ed1c7da .swiper')?.swiper?.activeIndex);
          item.swiper={before,after};
          item.checks.nextArrowWorks=Number.isInteger(before)&&Number.isInteger(after)&&before!==after;
        }
        item.valid=Object.values(item.checks).every(Boolean);
        console.log('FONT_HEAD_SVG_CASE '+JSON.stringify(item).slice(0,3000));
      }catch(e){item.valid=false;item.error=String(e.stack||e).slice(0,650);console.log('FONT_HEAD_SVG_ERROR '+JSON.stringify(item));}
      cases.push(item);
      await context.close();
    }
  }finally{await browser.close();}
  fs.writeFileSync('font-head-svg-qa.json',JSON.stringify(cases,null,2));
  const summary={valid:cases.filter(x=>x.valid).length,total:cases.length,
    errors:cases.filter(x=>!x.valid).map(x=>({device:x.device,path:x.path,checks:x.checks,error:x.error})),
    fonts:cases.map(x=>({device:x.device,path:x.path,iconRequests:x.requests?.filter(r=>/eicons/.test(r.url)).length}))};
  console.log('FONT_HEAD_SVG_SUMMARY '+JSON.stringify(summary));
  if(summary.valid!==summary.total)process.exitCode=1;
})().catch(e=>{console.error('FONT_HEAD_SVG_FATAL '+String(e.stack||e));process.exitCode=1});
