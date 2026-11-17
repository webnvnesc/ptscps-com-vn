'use strict';
/* Read-only PTSCPS homepage Elementor/Jannah section geometry and semantic roles.
 * Sections selected below MUST have top beyond fold on mobile and desktop. */
const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
 const b=await chromium.launch({headless:true});
 const results=[];
 try{
  for(const device of [{name:'mobile',width:412,height:850},{name:'desktop',width:1440,height:900}]){
   const c=await b.newContext({
     viewport:{width:device.width,height:device.height},isMobile:device.name==='mobile',hasTouch:device.name==='mobile',
     deviceScaleFactor:1,serviceWorkers:'block'});
   const p=await c.newPage();
   const errors=[];
   p.on('pageerror',e=>errors.push(String(e.message).slice(0,120)));
   const response=await p.goto('https://ptscps.com.vn/',{waitUntil:'domcontentloaded',timeout:70000});
   await p.waitForTimeout(1400);
   const data=await p.evaluate(()=>{
    const getInfo=(el,idx)=>{
     const r=el.getBoundingClientRect(),css=getComputedStyle(el),anchor=el.querySelector('h1,h2,h3,h4');
     return {idx,tag:el.localName,id:el.id||'',cls:String(el.className?.baseVal||el.className||'').slice(0,230),
       dataId:el.getAttribute('data-id')||'',
       top:Math.round(r.top+scrollY),y:Math.round(r.top),height:Math.round(r.height),width:Math.round(r.width),
       display:css.display,visibility:css.visibility,contentVisibility:css.contentVisibility,
       heading:anchor?.textContent?.replace(/\s+/g,' ').trim().slice(0,100)||'',
       text:el.innerText?.replace(/\s+/g,' ').trim().slice(0,120)||'',
       sliderCount:el.querySelectorAll('sr7-module').length,carouselCount:el.querySelectorAll('.swiper,.swiper-container').length,
       imgCount:el.querySelectorAll('img').length};
    };
    const root=document.querySelector('.elementor')||document.querySelector('.entry-content')||document.querySelector('#content');
    const topLevel=[];
    if(root) {
     let children=[...root.children];
     if(children.length===1 && children[0]?.classList.contains('elementor-inner'))children=[...children[0].children];
     topLevel.push(...children.map(getInfo));
    }
    const section=[...document.querySelectorAll('.elementor-top-section,.e-con.e-parent,.elementor-section.elementor-section-boxed')]
      .filter(el=>{
       const r=el.getBoundingClientRect();
       return r.width>=250 && r.height>=70;
      }).map(getInfo).sort((a,b)=>a.top-b.top||b.height-a.height).slice(0,75);
    const important=[...document.querySelectorAll('sr7-module,.elementor-widget-image-carousel,.elementor-widget-posts,.elementor-widget-text-editor,main,footer,#footer,.site-footer,.main-content')]
      .map(getInfo).filter(x=>x.width>220&&x.height>40).slice(0,36);
    return {viewport:{width:innerWidth,height:innerHeight},pageHeight:document.documentElement.scrollHeight,
      bodyClass:document.body.className,root:root?getInfo(root,0):null,topLevel,section,important};
   });
   results.push({device,http:response.status(),...data,errors});
   console.log('CV_AUDIT '+JSON.stringify({device,http:response.status(),viewport:data.viewport,pageHeight:data.pageHeight,
    root:data.root,topLevel:data.topLevel,section:data.section,
    important:data.important,errors}).slice(0,35000));
   await c.close();
  }
 }finally{await b.close()}
 fs.writeFileSync('ptscps-content-visibility-audit.json',JSON.stringify(results,null,2));
 if(results.length!==2||results.some(x=>x.http!==200||x.errors.length))
  process.exitCode=1;
})().catch(e=>{console.error('CV_AUDIT_FATAL '+e.stack);process.exitCode=1});
