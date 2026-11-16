'use strict';
const { chromium }=require('playwright');
const fs=require('fs');
const root='https://ptscps.com.vn';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const map=new Map();
 try{
  for(const [device,viewport,ua] of [
   ['desktop',{width:1440,height:900},'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'],
   ['mobile',{width:412,height:850},'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36']]){
   const context=await browser.newContext({viewport,deviceScaleFactor:device==='mobile'?2:1,isMobile:device==='mobile',hasTouch:device==='mobile',userAgent:ua,serviceWorkers:'block'});
   const page=await context.newPage();
   await page.goto(root,{waitUntil:'domcontentloaded',timeout:65000});
   const found=await page.evaluate(()=>{
     const selectors=['#main-nav','#top-nav','#mobile-menu','#mobile-menu-wrap','.main-nav','#theme-header','header','.top-nav'];
     const result=[];
     for(const selector of selectors){
      document.querySelectorAll(selector).forEach(node=>{
       node.querySelectorAll('a[href]').forEach(a=>{
         const href=a.href;
         if(!href.startsWith('https://ptscps.com.vn/')||/\.(jpg|png|webp|pdf|zip|js|css)(\?|$)/i.test(href))return;
         if(a.closest('#wpadminbar'))return;
         const raw=a.textContent.replace(/\s+/g,' ').trim().slice(0,100) || a.getAttribute('aria-label')||'';
         const parent=a.closest('li');
         result.push({selector,href,raw,className:(parent?.className||'').slice(0,160),rel:a.rel||'',depth:a.closest('.sub-menu')?1:0});
       });
      });
     }
     return result;
   });
   const unique=new Map();
   for(const link of found){
    let u;try{u=new URL(link.href)}catch{continue}
    if(u.origin!==root||u.search||u.hash||!/^https?:$/.test(u.protocol))continue;
    const path=u.pathname.replace(/\/+$/,'')||'/';
    const ex=unique.get(path)||{path,text:[],selector:[],device:[],depth:link.depth};
    if(link.raw&&!ex.text.includes(link.raw))ex.text.push(link.raw);
    if(!ex.selector.includes(link.selector))ex.selector.push(link.selector);
    if(!ex.device.includes(device))ex.device.push(device);
    ex.depth=Math.min(ex.depth,link.depth);
    unique.set(path,ex);
   }
   for(const [p,v] of unique){const e=map.get(p)||{path:p,text:[],selectors:[],devices:[],depth:v.depth};for(const t of v.text)if(!e.text.includes(t))e.text.push(t);for(const t of v.selector)if(!e.selectors.includes(t))e.selectors.push(t);e.devices.push(device);map.set(p,e)}
   console.log('HEADER_DEVICE_LINKS '+JSON.stringify({device,links:[...unique.values()]}).slice(0,30000));
   await context.close();
  }
 }finally{await browser.close()}
 let links=[...map.values()].filter(x=>x.path!=='/'&&x.text.length>0);
 for(const p of ['/thu-ngo.htm','/dich-vu','/hseq','/c/co-dong','/tin-tuc','/lien-he'])if(!links.some(x=>x.path===p))links.push({path:p,text:['Known header page'],selectors:['explicit'],devices:[],depth:0});
 links=links.slice(0,55);
 fs.writeFileSync('ptscps-header-pages.json',JSON.stringify(links,null,2));
 console.log('HEADER_DISCOVERY_SUMMARY '+JSON.stringify({count:links.length,pages:links.map(x=>x.path)}));
})().catch(e=>{console.error('HEADER_DISCOVERY_FATAL '+String(e.stack||e));process.exitCode=1});
