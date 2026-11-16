'use strict';
const {chromium}=require('playwright');
const {gzipSync}=require('node:zlib');
const fs=require('node:fs');
const BASE='https://ptscps.com.vn/';
const HANDLES=['tie-css-base','tie-css-styles','tie-css-widgets','tie-css-helpers'];
const GROUPS={control:[],two:HANDLES.slice(0,2),four:HANDLES.slice(0,4)};
const CASES=[
 ['control1','control',412],['two1','two',412],['control2','control',412],
 ['four1','four',412],['control3','control',412],['four2','four',412],
 ['two2','two',412],['control4','control',412],
 ['controlDesktop','control',1440],['fourDesktop','four',1440]
];
function getAttr(tag,name){
 const r=new RegExp('\\b'+name+'\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))','i');
 const match=r.exec(tag);
 return match?(match[1]||match[2]||match[3]):'';
}
function readStyles(html){
 const out=[];
 for(const m of html.matchAll(/<link\b[^>]*>/gi)){
  const tag=m[0],rel=getAttr(tag,'rel');
  if(!/(?:^|\s)stylesheet(?:\s|$)/i.test(rel))continue;
  const id=getAttr(tag,'id');
  const href=getAttr(tag,'href').replaceAll('&amp;','&');
  const handle=HANDLES.find(n=>id===n+'-css')||null;
  out.push({id,href,handle,media:getAttr(tag,'media'),start:m.index,end:m.index+tag.length});
 }
 return out;
}
function bundlePlan(html,styles,keys){
 const selected=keys.map(key=>styles.find(s=>s.handle===key));
 if(selected.some(x=>!x))return {ok:false,reason:'missing handle'};
 const indices=selected.map(x=>styles.indexOf(x));
 if(indices.some((x,i)=>i>0&&x!==indices[i-1]+1))
   return {ok:false,reason:'nonconsecutive stylesheets: '+indices.join(',')};
 if(selected.some(x=>x.media&&x.media!=='all'))return {ok:false,reason:'non-all media'};
 for(let i=1;i<selected.length;i++){
  const between=html.slice(selected[i-1].end,selected[i].start);
  if(/<style\b|<link\b/i.test(between))return {ok:false,reason:'intervening link or style'};
 }
 return {ok:true,selected};
}
function rebase(raw,from){
 return raw.replace(/url\(\s*(?:(["'])(.*?)\1|([^)]*))\s*\)/gi,(all,q,quoted,unquoted)=>{
  const url=(quoted===undefined?unquoted:quoted)||'';
  if(/^(?:data:|#|blob:|https?:|\/\/)/i.test(url.trim()))return all;
  try{return 'url("'+new URL(url.trim(),from).href+'")'}catch{return all}
 });
}
async function evaluateCase(browser,id,groupName,width,styles,bundles){
 const group=GROUPS[groupName],bundle=bundles[groupName];
 const ctx=await browser.newContext({viewport:{width,height:width<700?823:900},
    isMobile:width<700,hasTouch:width<700,deviceScaleFactor:width<700?1.75:1,locale:'vi-VN'});
 const page=await ctx.newPage();let matches=[],jsErrors=[],resourceErrors=[],served=false;
 page.on('pageerror',e=>jsErrors.push(e.message.slice(0,200)));
 page.on('console',m=>{if(m.type()==='error')resourceErrors.push(m.text().slice(0,150))});
 await ctx.route('**/__ptscps_ab_bundle_*.css',async route=>{
   if(!bundle){await route.abort();return}
   served=true;
   // A synthetic response otherwise has zero latency. Approximate one RTT plus
   // transfer of the gzipped bundle on the same mobile network.
   const delayMs=150+Math.round(bundle.gzip/(210*1024)*1000);
   await new Promise(resolve=>setTimeout(resolve,delayMs));
   await route.fulfill({status:200,contentType:'text/css',headers:{'cache-control':'no-store'},body:bundle.css});
 });
 await page.route(BASE,async route=>{
   const upstream=await route.fetch({timeout:65000});
   let html=await upstream.text();
   if(group.length){
    const all=readStyles(html),plan=bundlePlan(html,all,group);
    if(!plan.ok){console.log('BLOCKED '+id+' '+plan.reason);await route.fulfill({response:upstream,body:html});return}
    let inserted=false;
    html=html.replace(/<link\b[^>]*>/gi,tag=>{
     const key=HANDLES.find(k=>getAttr(tag,'id')===k+'-css');
     if(!key||!group.includes(key))return tag;
     matches.push(key);
     if(!inserted){
       inserted=true;
       return '<link id="ptscps-ab-bundle-css" rel="stylesheet" href="'+BASE+'__ptscps_ab_bundle_'+groupName+'.css">';
     }
     return '<!-- bundled '+key+' in browser only -->';
    });
   }
   await route.fulfill({response:upstream,body:html});
 });
 await page.addInitScript(()=>{
  window.__shifts=[];
  try{new PerformanceObserver(list=>{for(const e of list.getEntries()){
    if(!e.hadRecentInput)window.__shifts.push({t:e.startTime,v:e.value})
  }}).observe({type:'layout-shift',buffered:true})}catch(e){}
 });
 const cdp=await ctx.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.emulateNetworkConditions',{
    offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:95*1024});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 let result={id,groupName,width};
 try{
  const res=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:80000});
  await page.waitForTimeout(5900);
  const metrics=await page.evaluate(()=>{
   const n=performance.getEntriesByType('navigation')[0];
   const p=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
   const geom={};
   for(const sel of ['#main-nav','.logo','.elementor-element-77137dd','.elementor-element-920fc5e',
                       '.elementor-element-a34b2bb','.elementor-widget-image-carousel','footer']){
    const e=document.querySelector(sel);
    if(!e){geom[sel]=null;continue}
    const r=e.getBoundingClientRect(),s=getComputedStyle(e);
    geom[sel]={x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),font:s.fontFamily};
   }
   const res=performance.getEntriesByType('resource').filter(x=>/jannah\/assets\/css|__ptscps_ab_bundle_/.test(x.name));
   return {ttfb:Math.round(n.responseStart),fcp:Math.round(p?.startTime||0),
    cls:window.__shifts.reduce((a,x)=>a+x.v,0),geom,
    network:res.map(x=>({name:x.name.replace(location.origin,''),duration:Math.round(x.duration),end:Math.round(x.responseEnd)})),
    widgets:document.querySelectorAll('.elementor-widget').length,
    slider:!!document.querySelector('sr7-module#SR7_1_1'),
    cssBundlePresent:!!document.querySelector('#ptscps-ab-bundle-css')};
  });
  result={...result,ok:true,http:res.status(),...metrics,matches,served,
    jsErrors:jsErrors.slice(0,8),resourceErrors:resourceErrors.slice(0,8)};
  if(['control1','two1','four1','controlDesktop','fourDesktop'].includes(id)){
    await page.screenshot({path:'bundle-results/'+id+'.png',fullPage:false,animations:'disabled'});
  }
 }catch(e){result.error=String(e.stack||e).slice(0,700);process.exitCode=1}
 fs.writeFileSync('bundle-results/'+id+'.json',JSON.stringify(result,null,2));
 console.log('MEASURE '+JSON.stringify({
  id,width,group:groupName,ok:result.ok,
  ttfb:result.ttfb,fcp:result.fcp,afterTTFB:result.fcp&&result.ttfb?result.fcp-result.ttfb:null,
  cls:result.cls,matched:matches,served,
  sliderY:result.geom?.['.elementor-element-77137dd']?.y,
  sliderH:result.geom?.['.elementor-element-77137dd']?.h,
  introY:result.geom?.['.elementor-element-920fc5e']?.y,
  errors:result.jsErrors,networkErrors:result.resourceErrors?.slice(0,3),error:result.error
 }));
 await ctx.close();return result;
}
async function main(){
 fs.mkdirSync('bundle-results',{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  const setup=await browser.newContext();
  const response=await setup.request.get(BASE,{timeout:45000});
  if(!response.ok())throw Error('Cannot read public homepage '+response.status());
  const html=await response.text(),styles=readStyles(html);
  console.log('STYLE_ORDER '+JSON.stringify(styles.map((s,i)=>({i,id:s.id,handle:s.handle,href:s.href}))));
  const contents={},bundles={};
  for(const entry of styles.filter(x=>x.handle)){
    if(contents[entry.handle])continue;
    const cssR=await setup.request.get(new URL(entry.href,BASE).href,{timeout:45000});
    if(!cssR.ok())throw Error('Cannot retrieve '+entry.handle+' '+cssR.status());
    contents[entry.handle]=await cssR.text();
  }
  for(const [name,group] of Object.entries(GROUPS)){
    if(!group.length)continue;
    const plan=bundlePlan(html,styles,group);
    console.log('PLAN '+JSON.stringify({name,ok:plan.ok,reason:plan.reason||null,
      ids:plan.selected?.map(s=>s.id)||[]}));
    if(!plan.ok)continue;
    const css=plan.selected.map(s=>'/* '+s.handle+' */\n'+
        rebase(contents[s.handle],new URL(s.href,BASE).href)).join('\n');
    if(/@import\b/.test(css)){console.log('REJECT '+name+' unsupported @import');continue}
    bundles[name]={css,raw:Buffer.byteLength(css),gzip:gzipSync(css).length};
    console.log('BUNDLE '+JSON.stringify({name,raw:bundles[name].raw,
      gzip:bundles[name].gzip,requestsSaved:group.length-1}));
  }
  await setup.close();
  if(!bundles.two||!bundles.four){
     console.log('NO_SAFE_BUNDLE: Preserve cascade; do not use altered CSS order');
     return;
  }
  const results=[];
  for(const [id,name,width] of CASES)results.push(await evaluateCase(browser,id,name,width,styles,bundles));
  console.log('SUMMARY '+JSON.stringify(results.filter(x=>x.ok).map(x=>({
    id:x.id,group:x.groupName,width:x.width,fcp:x.fcp,ttfb:x.ttfb,
    afterTTFB:x.fcp-x.ttfb,cls:x.cls,served:x.served,missing:x.error||null
  }))));
 }finally{await browser.close()}
}
main().catch(err=>{console.error('FATAL',err.stack||String(err));process.exitCode=1});