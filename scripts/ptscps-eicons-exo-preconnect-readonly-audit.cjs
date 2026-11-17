'use strict';
/**
 * Read-only PTSCPS live font & head audit.
 * Determines whether eicons/tielabs icon fonts are actually used in carousel
 * controls and page elements; whether Exo is already swap+preloaded; and
 * whether Google's two preconnects are redundant.
 *
 * No production writes, no asset interception, no CSS injection.
 */
const {chromium}=require('playwright');
const fs=require('node:fs');
const OUT='ptscps-font-head-readonly-audit';
fs.mkdirSync(OUT,{recursive:true});
const PAGES=['/'];
const modes=[{name:'mobile',width:412,height:850,isMobile:true},{name:'desktop',width:1440,height:900,isMobile:false}];
const url='https://ptscps.com.vn';
function shorten(u){try{const x=new URL(u);return x.pathname+(x.search||'').slice(0,120)}catch{return String(u).slice(0,160)}}
function desc(r){return {url:shorten(r.url()),status:r.status(),type:r.headers()['content-type']||'',
 contentLength:r.headers()['content-length']||'',transferEncoding:r.headers()['transfer-encoding']||''}}
function inspectFace(css){const faces=[...css.matchAll(/@font-face\s*\{[^}]+\}/ig)].map(x=>{
 const body=x[0];
 const prop=k=>body.match(new RegExp(k+'\\s*:\\s*([^;]+)','i'))?.[1]?.trim()||null;
 return {family:prop('font-family'),weight:prop('font-weight'),style:prop('font-style'),
   display:prop('font-display'),url:body.match(/url\((['"]?)(.*?)\1\)/)?.[2]||null,
   unicodeRange:prop('unicode-range')};
 });
 return {faces,faceCount:faces.length,
  hasFontDisplaySwap:/font-display\s*:\s*swap/i.test(css),
  fontDisplayDeclarations:[...css.matchAll(/font-display\s*:\s*([a-z-]+)/ig)].map(x=>x[1]).slice(0,25),
  iconRuleSamples:[...css.matchAll(/\.eicon-[^{]{1,120}\{[^}]{1,220}\}/ig)].slice(0,8).map(x=>x[0].slice(0,250))};
}
async function auditPage(browser,mode,path){
 const ctx=await browser.newContext({viewport:{width:mode.width,height:mode.height},
  isMobile:mode.isMobile,hasTouch:mode.isMobile,deviceScaleFactor:1,
  serviceWorkers:'block'});
 const page=await ctx.newPage(),requests=[],jsErrors=[],cssLinks=[];
 page.on('pageerror',e=>jsErrors.push(e.message.slice(0,200)));
 page.on('request',r=>{
  if(/woff|ttf|font|eicon|tielabs|googleapis|gstatic|\/exo-direct/.test(r.url().toLowerCase())||r.resourceType()==='font'){
    requests.push({url:shorten(r.url()),resType:r.resourceType(),frame:r.frame()?.url()===url+'/'?'root':null});
  }
 });
 page.on('response',r=>{
  const u=r.url().toLowerCase();
  if(/\/eicons|\/tielabs-fonticon|ptscps-exo|googleapis|gstatic|\/font/.test(u)){
    cssLinks.push(desc(r));
  }
 });
 const entry={device:mode.name,path};
 try{
  const res=await page.goto(url+path,{waitUntil:'domcontentloaded',timeout:65000});
  await page.waitForTimeout(path==='/'?3600:1800);
  await page.evaluate(()=>document.fonts.ready);
  let evaluated=await page.evaluate(()=>{
   const arr=(list)=>[...list];
   const point=(el)=>{
    if(!el)return null;
    const style=getComputedStyle(el),before=getComputedStyle(el,'::before'),after=getComputedStyle(el,'::after');
    const rect=el.getBoundingClientRect();
    return {tag:el.tagName.toLowerCase(),
      className:String(el.getAttribute('class')||'').slice(0,220),
      tagText:(el.textContent||'').trim().slice(0,90),
      html:el.outerHTML.slice(0,360),
      family:style.fontFamily,content:style.content,
      before:{content:before.content,fontFamily:before.fontFamily,display:before.display},
      after:{content:after.content,fontFamily:after.fontFamily,display:after.display},
      box:{x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height)},
      isVisible:rect.width>0&&rect.height>0&&style.visibility!=='hidden'&&style.display!=='none'
    };
   };
   const normalize=(l)=>Array.from(l).map(x=>({
     rel:x.rel,href:x.href,crossorigin:x.getAttribute('crossorigin'),
     as:x.getAttribute('as'),type:x.getAttribute('type'),
     fetchpriority:x.getAttribute('fetchpriority'),
     id:x.id||null,
     media:x.media||null
   }));
   const head=normalize(document.querySelectorAll('head link[rel="preconnect"],head link[rel="dns-prefetch"],head link[rel="preload"],head link[rel="stylesheet"]'));
   const preconnects=head.filter(x=>x.rel==='preconnect');
   const exo=document.querySelectorAll('link[href*="exo-direct"]');
   const selectors=[
    '.elementor-swiper-button-prev','.elementor-swiper-button-next',
    '.elementor-image-carousel-wrapper .elementor-swiper-button-prev',
    '.elementor-image-carousel-wrapper .elementor-swiper-button-next',
    '.elementor-element-ed1c7da .elementor-swiper-button',
    '.elementor-element-ed1c7da .elementor-swiper-button-prev',
    '.elementor-element-ed1c7da .elementor-swiper-button-next',
    '.swiper-button-next','.swiper-button-prev',
    'i[class*="eicon"]','.eicon','.eicon-chevron-left','.eicon-chevron-right',
    '.tie-icon','.tielabs-fonticon','.tie-icon-angle-left','.tie-icon-angle-right'
   ];
   const matches=Object.fromEntries(selectors.map(s=>[s,{
    n:document.querySelectorAll(s).length,
    examples:arr(document.querySelectorAll(s)).slice(0,3).map(point)
   }]));
   const all=arr(document.querySelectorAll('body *'));
   let eiconClasses=0, eiconVisible=0, iconComputed={};
   let renderedFontUsage={eicons:0,tielabs:0,otherIcon:0};
   const eiconNodes=[],fontNodes=[];
   for(const el of all.slice(0,12000)){
    const cn=String(el.getAttribute('class')||'');
    if(/\beicon(?:-|$)/i.test(cn)){
      eiconClasses++;
      const p=point(el);
      if(p?.isVisible)eiconVisible++;
      if(eiconNodes.length<30)eiconNodes.push(p);
    }
    const css=getComputedStyle(el);
    const before=getComputedStyle(el,'::before');
    const after=getComputedStyle(el,'::after');
    const isFont=(f)=>/(eicons|tielabs-fonticon|FontAwesome|fontawesome|elementor-icons)/i.test(f||'');
    if(isFont(css.fontFamily)||isFont(before.fontFamily)||isFont(after.fontFamily)){
      const p=point(el);
      const c=String([css.fontFamily,before.fontFamily,after.fontFamily].join(' ')).toLowerCase();
      const group=c.includes('eicons')?'eicons':c.includes('tielabs-fonticon')?'tielabs':'otherIcon';
      renderedFontUsage[group]++;
      if(p?.isVisible&&fontNodes.length<45)fontNodes.push(p);
    }
   }
   const exoFaces=arr(document.fonts).filter(x=>x.family.toLowerCase().includes('exo')).map(x=>({family:x.family,weight:x.weight,style:x.style,status:x.status}));
   const names=arr(document.fonts).filter(x=>/eicons|tielabs|fontawesome|icon/i.test(x.family)).map(x=>({family:x.family,weight:x.weight,style:x.style,status:x.status}));
   const swiper=document.querySelector('.elementor-element-ed1c7da .swiper');
   const checks={
    eicons:document.fonts.check('16px eicons'),
    tielabs:document.fonts.check('16px tielabs-fonticon'),
    Exo:document.fonts.check('400 16px Exo')
   };
   const navLinks=arr(document.querySelectorAll('head link[rel="preconnect"]')).map(x=>x.href);
   const other=arr(document.querySelectorAll('[class*="elementor-swiper-button"],[class*="swiper-button"],[class*="eicon"]')).slice(0,55).map(point);
   return {htmlBytes:document.documentElement.outerHTML.length,head,preconnects,
     eiconClasses,eiconVisible,renderedFontUsage,
     eiconNodes,visibleFontNodes:fontNodes,
     otherControlNodes:other,matches,exoFaceStatus:exoFaces,
     iconFaceStatus:names,checks,
     swiperExists:!!swiper,
     fontSetStatus:document.fonts.status,
     bodyFont:getComputedStyle(document.body).fontFamily,
     h1Font:getComputedStyle(document.querySelector('h1,h2')||document.body).fontFamily,
     windowWidth:innerWidth,docWidth:document.documentElement.scrollWidth};
  });
  const stylesheetUrls=evaluated.head.filter(x=>x.rel==='stylesheet')
    .filter(x=>/eicons|tielabs|exo|elementor|style\.css|fonts/.test(x.href.toLowerCase()))
    .map(x=>x.href);
  let cssInspections=[];
  for(const cssUrl of stylesheetUrls.slice(0,18)){
   try{
    const fetched=await ctx.request.get(cssUrl,{timeout:24000});
    const content=await fetched.text();
    const faces=inspectFace(content);
    cssInspections.push({url:shorten(cssUrl),http:fetched.status(),
      bytes:Buffer.byteLength(content),...faces,
      eiconSelectors:/\.eicon-|font-family\s*:\s*["']?eicons/i.test(content),
      tielabsSelectors:/tielabs-fonticon/i.test(content),
      indexedExo:/Exo/i.test(content),
      preconnectRule:/preconnect/i.test(content)
    });
   }catch(e){cssInspections.push({url:shorten(cssUrl),error:e.message.slice(0,180)})}
  }
  entry.http=res.status();
  entry.data=evaluated;
  entry.css=cssInspections;
  entry.requests=requests;
  entry.responses=cssLinks;
  entry.errors=jsErrors;
  entry.valid=res.status()===200&&evaluated.docWidth<=mode.width+3&&!jsErrors.length;
  console.log('FONT_HEAD_AUDIT_CASE '+JSON.stringify({
   device:mode.name,path,valid:entry.valid,http:entry.http,
   preconnects:evaluated.preconnects,preloads:evaluated.head.filter(x=>x.rel==='preload'),
   renderUsage:evaluated.renderedFontUsage,eiconClasses:evaluated.eiconClasses,eiconVisible:evaluated.eiconVisible,
   exoFaces:evaluated.exoFaceStatus,
   iconFaces:evaluated.iconFaceStatus,
   iconChecks:evaluated.checks,
   stylesheetSummary:cssInspections.map(x=>({
     path:x.url,http:x.http,bytes:x.bytes,faces:x.faces?.slice(0,6),
     fontDisplay:x.fontDisplayDeclarations?.slice(0,15),
     eicons:x.eiconSelectors,tielabs:x.tielabsSelectors
   })),
   swiperControls:evaluated.otherControlNodes.slice(0,16),
   requests:requests.slice(0,25),errors:jsErrors
  }).slice(0,14000));
 }catch(e){entry.valid=false;entry.error=String(e.stack||e).slice(0,900);
  console.log('FONT_HEAD_AUDIT_ERROR '+JSON.stringify({device:mode.name,path,error:entry.error}));}
 fs.writeFileSync(OUT+'/'+mode.name+'-'+path.replace(/\W/g,'-')+'.json',JSON.stringify(entry,null,2));
 await ctx.close();
 return entry;
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions']});
 const entries=[];
 try{
  for(const mode of modes){
   for(const path of PAGES)entries.push(await auditPage(browser,mode,path));
  }
 }finally{await browser.close();}
 const summary={samples:entries.length,valid:entries.filter(x=>x.valid).length,
  rows:entries.map(x=>({device:x.device,path:x.path,valid:x.valid,
    error:x.error,preconnects:x.data?.preconnects?.map(y=>y.href),
    exoLink:x.data?.head?.filter(y=>/exo-direct/.test(y.href)).map(y=>y.href),
    iconCss:x.css?.filter(y=>/eicons|tielabs/.test(y.url)).map(y=>({url:y.url,faces:y.faces,bytes:y.bytes})),
    usage:x.data?.renderedFontUsage,domEicons:x.data?.eiconClasses,
    iconRequests:x.requests?.filter(y=>/eicons|tielabs/.test(y.url)),
    iconFonts:x.data?.iconFaceStatus,
    arrowCount:x.data?.otherControlNodes?.length,
    arrowElements:x.path==='/'?x.data?.otherControlNodes?.slice(0,9):undefined,
    eiconNodes:x.path==='/'?x.data?.eiconNodes?.slice(0,6):undefined,
    fontNodes:x.path==='/'?x.data?.visibleFontNodes?.slice(0,9):undefined,
    exoStyles:x.path==='/'?x.css?.filter(y=>/exo-direct/.test(y.url)).map(y=>({url:y.url,
      faces:y.faces?.slice(0,20),bytes:y.bytes,display:y.fontDisplayDeclarations})):undefined,
    googleRequests:x.requests?.filter(y=>/googleapis|gstatic/.test(y.url))
  }))};
 fs.writeFileSync(OUT+'/summary.json',JSON.stringify(summary,null,2));
 console.log('FONT_HEAD_AUDIT_SUMMARY '+JSON.stringify({
   samples:summary.samples,valid:summary.valid,
   rows:summary.rows.map(x=>({
     device:x.device,path:x.path,
     arrows:x.arrowElements?.map(e=>({className:e.className,html:e.html,
       before:e.before,after:e.after,visible:e.isVisible})),
     eiconNodes:x.eiconNodes?.map(e=>({className:e.className,html:e.html,
       before:e.before,visible:e.isVisible})),
     fontNodes:x.fontNodes?.slice(0,6).map(e=>({className:e.className,html:e.html,
       before:e.before,visible:e.isVisible})),
     exo:x.exoStyles?.map(y=>({url:y.url,bytes:y.bytes,
       faces:y.faces?.map(f=>({weight:f.weight,style:f.style,
         display:f.display,url:f.url?.split('/').at(-1)}))})),
     preconnects:x.preconnects
   }))
 }).slice(0,17000));
 if(summary.valid!==summary.samples)process.exitCode=1;
})().catch(e=>{console.error('FONT_HEAD_AUDIT_FATAL '+e.stack);process.exitCode=1});
