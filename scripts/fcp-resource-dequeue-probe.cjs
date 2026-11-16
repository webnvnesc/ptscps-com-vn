'use strict';
const {chromium}=require('playwright');
const fs=require('fs');
const BASE='https://ptscps.com.vn/';
const cases=[
  {name:'control_a',assets:[]},
  {name:'without_robotoslab',assets:['robotoslab.css']},
  {name:'without_roboto',assets:['/google-fonts/css/roboto.css']},
  {name:'without_roboto_pair',assets:['/google-fonts/css/roboto.css','/google-fonts/css/robotoslab.css']},
  {name:'without_ilightbox',assets:['/ilightbox/dark-skin/skin.css']},
  {name:'without_eicons',assets:['/elementor-icons.min.css']},
  {name:'without_fontawesome',assets:['/jannah/assets/css/fontawesome.css']},
  {name:'control_b',assets:[]},
];
function classify(el){
  const r=el.getBoundingClientRect(),css=getComputedStyle(el);
  return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),font:css.fontFamily,fs:css.fontSize,display:css.display,color:css.color};
}
async function measure(browser,variant,viewport,throttle){
 const ctx=await browser.newContext({viewport:{width:viewport,height:viewport<=480?823:900},isMobile:viewport<=480,hasTouch:viewport<=480,deviceScaleFactor:1,locale:'vi-VN'});
 const page=await ctx.newPage();
 const issues=[];let removed=[],linkSummary=[];
 page.on('pageerror',e=>issues.push('page:'+e.message.slice(0,180)));
 page.on('console',m=>{if(m.type()==='error')issues.push('console:'+m.text().slice(0,130))});
 if(variant.assets.length){
   await page.route(BASE,async route=>{
     const original=await route.fetch();
     let html=await original.text();
     html=html.replace(/<link\b[^>]*>/gi,tag=>{
       if(!/rel\s*=\s*(?:["']?)stylesheet/i.test(tag))return tag;
       if(!variant.assets.some(asset=>tag.includes(asset)))return tag;
       removed.push({url:tag.match(/href\s*=\s*["']([^"']+)/)?.[1]?.replace(/https:\/\/ptscps.com.vn/,'')||null,
         handle:tag.match(/id\s*=\s*["']([^"']+)/)?.[1]||null});
       return '<!-- FCP-TEST-ONLY stylesheet excluded, not on server -->';
     });
     await route.fulfill({response:original,body:html});
   });
 }
 await page.addInitScript(()=>{
   window.__layoutshifts=[];
   try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__layoutshifts.push({t:e.startTime,v:e.value})}).observe({type:'layout-shift',buffered:true})}catch(e){}
 });
 if(throttle){
   const cdp=await ctx.newCDPSession(page);
   await cdp.send('Network.enable');
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:220*1024,uploadThroughput:115*1024});
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 }
 let result={case:variant.name,viewport,throttle,removed,issues};
 try{
   const navResponse=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:80000});
   await page.waitForTimeout(6600);
   const details=await page.evaluate(()=>{
     const n=performance.getEntriesByType('navigation')[0];
     const paint=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
     const labels=['body','#main-nav','.logo','.elementor-element-77137dd','.elementor-element-920fc5e','.elementor-element-a34b2bb','footer'];
     const coords={};
     for(const k of labels){const el=document.querySelector(k);coords[k]=el?({x:Math.round(el.getBoundingClientRect().x),y:Math.round(el.getBoundingClientRect().y),h:Math.round(el.getBoundingClientRect().height),w:Math.round(el.getBoundingClientRect().width),font:getComputedStyle(el).fontFamily}):null}
     const sections=Array.from(document.querySelectorAll('.elementor-top-section')).map(el=>({id:el.getAttribute('data-id'),y:Math.round(el.getBoundingClientRect().y),h:Math.round(el.getBoundingClientRect().height),w:Math.round(el.getBoundingClientRect().width)})).slice(0,30);
     const fonts={};
     // Count actual CSS-computed font families on visible text-bearing nodes; check every section, not only initial viewport.
     for(const el of document.querySelectorAll('h1,h2,h3,h4,p,span,a,button,li,figcaption,div')){
       if(!el.textContent?.trim()||el.children.length>4)continue;
       const c=getComputedStyle(el);
       if(c.display==='none'||c.visibility==='hidden')continue;
       const family=c.fontFamily;
       if(/Roboto|Exo|tiefonticon|eicons|FontAwesome/i.test(family)){
         fonts[family]=(fonts[family]||0)+1;
       }
     }
     const used={};for(const x of document.querySelectorAll('.elementor-widget')){const t=x.getAttribute('data-widget_type');used[t]=(used[t]||0)+1}
     const anchors=Array.from(document.querySelectorAll('a[href*="lightbox"],a[data-elementor-open-lightbox],a[data-rel*="lightbox"],a[href$=".jpg"]')).length;
     const images=Array.from(document.images).slice(0,15).map(el=>({src:(el.currentSrc||el.src).split('/').slice(-1)[0],loaded:el.complete,w:el.naturalWidth,h:el.naturalHeight}));
     return {ttfb:Math.round(n.responseStart),fcp:Math.round(paint?.startTime||0),cls:window.__layoutshifts.reduce((a,x)=>a+x.v,0),
       coords,sections,fonts,widgets:used,lightboxLinks:anchors,images,bodyClass:document.body.className,
       stylesheetLinks:Array.from(document.querySelectorAll('link[rel=stylesheet]')).map(l=>({id:l.id,href:l.href.replace(location.origin,'')}))};
   });
   result={...result,http:navResponse.status(),...details,issues:issues.slice(0,8)};
   const name=variant.name+'-'+viewport+(throttle?'-slow':'-fast');
   if(['control_a','without_roboto_pair','without_eicons','without_ilightbox','without_fontawesome'].includes(variant.name)){
     await page.screenshot({path:'resource-results/'+name+'-top.png',animations:'disabled'});
     await page.evaluate(()=>scrollTo(0,1100));
     await page.waitForTimeout(700);
     await page.screenshot({path:'resource-results/'+name+'-mid.png',animations:'disabled'});
   }
 }catch(e){result.error=String(e.stack||e).slice(0,900);process.exitCode=1}
 fs.writeFileSync('resource-results/'+variant.name+'-'+viewport+(throttle?'-slow':'-fast')+'.json',JSON.stringify(result,null,2));
 console.log('RESULT '+JSON.stringify({case:variant.name,viewport,throttle,http:result.http,removed:result.removed,ttfb:result.ttfb,fcp:result.fcp,afterTTFB:result.fcp-result.ttfb,cls:result.cls,issues:result.issues?.slice(0,3),error:result.error,
 fonts:result.fonts,widgetTypes:result.widgets,lightboxLinks:result.lightboxLinks,sections:result.sections?.slice(0,6)}).slice(0,5000));
 await ctx.close();
}
async function main(){
 fs.mkdirSync('resource-results',{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  for(const variant of cases)await measure(browser,variant,412,true);
  for(const variant of cases.filter(x=>['control_a','without_roboto_pair','without_eicons','without_ilightbox','control_b'].includes(x.name)))
    await measure(browser,variant,1440,false);
 }finally{await browser.close()}
}
main().catch(e=>{console.error('FATAL '+String(e.stack||e));process.exitCode=1});