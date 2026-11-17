'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs');
const fsdir='ptscps-poster-browser-ab';fs.mkdirSync(fsdir,{recursive:true});
const root='https://ptscps.com.vn/';
const cases=[
 {device:'desktop',width:1440,js:false},
 {device:'mobile',width:412,js:false},
 {device:'desktop',width:1440,js:true},
 {device:'mobile',width:412,js:true}
];
function addPoster(html){
 const module=html.match(/<sr7-module\b[^>]*\bid="SR7_1_1"[^>]*>/i);
 if(!module)throw Error('SR7 module missing');
 const after=html.slice(html.indexOf(module[0])+module[0].length);
 const first=after.match(/<sr7-slide\b[^>]*>[\s\S]*?<\/sr7-slide>/i);
 const src=first?.[0]?.match(/<noscript>\s*<img\b[^>]*\bsrc="([^"]+)"/i)?.[1];
 if(!src||!src.startsWith('https://ptscps.com.vn/wp-content/uploads/'))throw Error('first slide image not confirmed');
 const newtag=module[0].replace(/>$/,' style="background-image:url(\''+src+'\');background-position:center center;background-repeat:no-repeat;background-size:cover;">');
 return {html:html.replace(module[0],newtag),src};
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const all=[];
 try{
  for(const c of cases)for(const variant of ['baseline','poster']){
   const context=await browser.newContext({viewport:{width:c.width,height:c.device==='mobile'?850:900},isMobile:c.device==='mobile',hasTouch:c.device==='mobile',javascriptEnabled:c.js,deviceScaleFactor:c.device==='mobile'?2:1,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[],requests=[];
   page.on('pageerror',e=>errors.push(String(e.message).slice(0,220)));
   page.on('request',r=>{if(/ruby-banner|banner2\.jpg|banner3\.jpg/.test(r.url()))requests.push(r.url().split('/').at(-1))});
   let src=null;
   if(variant==='poster')await page.route(root,async route=>{
    const res=await route.fetch({timeout:70000});
    const data=addPoster(await res.text());src=data.src;
    await route.fulfill({response:res,body:data.html});
   });
   const record={...c,variant};
   try{
    const resp=await page.goto(root,{waitUntil:'domcontentloaded',timeout:70000});
    await page.waitForTimeout(c.js?1650:350);
    const probe=await page.evaluate(()=>{
     const mod=document.querySelector('sr7-module#SR7_1_1'),s=getComputedStyle(mod),slide=mod.querySelector('sr7-slide');
     const rect=mod.getBoundingClientRect();
     const hit=document.elementsFromPoint(rect.x+rect.width/2,rect.y+rect.height/2).slice(0,7).map(n=>n.localName+'#'+n.id);
     const firstbg=mod.querySelector('sr7-slide sr7-bg');
     return {bg:s.backgroundImage,rect:[rect.x,rect.y,rect.width,rect.height].map(Math.round),
      visibility:s.visibility,slideVisibility:getComputedStyle(slide).visibility,bgDisplay:getComputedStyle(firstbg).display,
      hit,firstSlide:mod.querySelector('sr7-slide')?.id,slides:mod.querySelectorAll('sr7-slide').length
     };
    });
    const cssBg=probe.bg.includes('ruby-banner');
    const screenshot=fsdir+'/'+c.device+'-'+(c.js?'js':'nojs')+'-'+variant+'.png';
    await page.screenshot({path:screenshot,timeout:20000});
    Object.assign(record,{http:resp.status(),src,probe,cssBg,requests,errors,screenshot});
   }catch(e){record.error=String(e).slice(0,450);}
   console.log('POSTER_AB '+JSON.stringify(record).slice(0,6500));
   all.push(record);
   await context.close();
  }
 }finally{await browser.close()}
 const errors=all.filter(r=>r.error||r.http!==200||(r.variant==='poster'&&!r.cssBg)||r.errors.length);
 console.log('POSTER_AB_SUMMARY '+JSON.stringify({cases:all.length,errors:errors.map(r=>({device:r.device,js:r.js,variant:r.variant,error:r.error,cssBg:r.cssBg,errors:r.errors})),files:all.map(x=>x.screenshot)}));
 if(errors.length)process.exitCode=1;
})().catch(e=>{console.error('POSTER_AB_FATAL '+e.stack);process.exitCode=1});
