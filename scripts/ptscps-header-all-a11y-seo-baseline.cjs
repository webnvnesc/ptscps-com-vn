'use strict';
const {chromium}=require('playwright');
const {AxeBuilder}=require('@axe-core/playwright');
const fs=require('node:fs');
const base='https://ptscps.com.vn';
const list=JSON.parse(fs.readFileSync('ptscps-header-pages.json','utf8')).slice(0,55);
const pages=[...new Set(list.map(x=>x.path))];
const dataDir='ptscps-header-audit';
fs.mkdirSync(dataDir,{recursive:true});
const timeout=70000;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions','--no-sandbox']});
 let failed=0;
 try{
  for(const device of ['desktop','mobile']){
   const mobile=device==='mobile';
   const context=await browser.newContext({
    viewport:mobile?{width:412,height:850}:{width:1440,height:900},
    deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,
    userAgent:mobile?
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
    serviceWorkers:'block'
   });
   for(const path of pages){
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(String(e.message).slice(0,250)));
    let entry={device,path};
    try{
     const resp=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout});
     await page.waitForTimeout(400);
     const info=await page.evaluate(()=>{
      const q=s=>[...document.querySelectorAll(s)];
      const meta=q('meta[name="description" i]').map(x=>x.content);
      const title=document.title;
      const h1=q('h1').map(x=>({text:x.textContent.trim().slice(0,130),visible:!!x.getClientRects().length}));
      const links=q('a[href]').filter(a=>!a.textContent.trim()&&!a.getAttribute('aria-label')&&!a.querySelector('img[alt]:not([alt=""])')).slice(0,12).map(x=>x.outerHTML.slice(0,360));
      const badImages=q('img:not([alt])').slice(0,12).map(x=>x.outerHTML.slice(0,320));
      const can=q('link[rel=canonical]').map(x=>x.href);
      const lang=document.documentElement.lang;
      const robots=q('meta[name="robots" i]').map(x=>x.content);
      const skipped=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(el=>!el.textContent.trim()).slice(0,8).map(e=>e.outerHTML.slice(0,240));
      return {title,lang,meta,canonical:can,robots,h1,emptyHeadings:skipped,unnamedLinks:links,missingAlt:badImages,
       wpAdminBar:!!document.querySelector('#wpadminbar'),
       bodyMode:document.body.classList.contains('is-mobile')?'mobile':document.body.classList.contains('is-desktop')?'desktop':'unknown',
       main:document.querySelectorAll('main,[role=main]').length};
     });
     const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']).analyze();
     const violations=axe.violations.map(v=>({
      id:v.id,impact:v.impact,nodes:v.nodes.length,
      samples:v.nodes.slice(0,5).map(n=>({target:n.target,html:n.html.slice(0,340),summary:n.failureSummary?.slice(0,280)}))
     }));
     const problems=[];
     if(resp.status()!==200)problems.push('http:'+resp.status());
     if(!info.lang)problems.push('missing-lang');
     if(!info.title||info.title.trim().length<5)problems.push('missing-title');
     if(info.meta.length!==1||!info.meta[0]?.trim())problems.push('meta-description:'+info.meta.length);
     if(info.canonical.length!==1)problems.push('canonical:'+info.canonical.length);
     if(!info.h1.some(x=>x.text))problems.push('missing-h1');
     if(info.bodyMode!==device)problems.push('wrong-cached-device:'+info.bodyMode);
     if(violations.length)problems.push(...violations.map(v=>'axe:'+v.id+'('+v.nodes+')'));
     entry={...entry,http:resp.status(),info,violations,errors,problems};
    }catch(e){
     entry={...entry,problems:['exception:'+String(e.message||e).slice(0,190)],errors};
    }
    const safe=(path==='/'?'home':path.replace(/[^a-z0-9]+/ig,'-').replace(/^-|-$/g,'')).slice(0,110);
    fs.writeFileSync(dataDir+'/'+device+'-'+safe+'.json',JSON.stringify(entry,null,2));
    console.log('HEADER_PAGE_AUDIT '+JSON.stringify({
      device,path,http:entry.http,problems:entry.problems,
      metaCount:entry.info?.meta?.length,
      descriptions:entry.info?.meta?.map(x=>x.slice(0,180)),
      title:entry.info?.title,h1:entry.info?.h1,
      violations:entry.violations,jsErrors:entry.errors
    }).slice(0,10500));
    if(entry.problems.length)failed++;
    await page.close();
   }
   await context.close();
  }
 }finally{await browser.close()}
 console.log('HEADER_AUDIT_SUMMARY '+JSON.stringify({paths:pages.length,total:pages.length*2,withIssues:failed}));
})().catch(e=>{console.error('HEADER_AUDIT_FATAL '+e.stack);process.exitCode=1});
