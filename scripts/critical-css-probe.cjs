'use strict';
const {chromium}=require('playwright');
const postcss=require('postcss');
const fs=require('fs');
const BASE='https://ptscps.com.vn/';
const TOP_CSS={
  style:'/wp-content/themes/jannah/assets/css/style.min.css',
  base:'/wp-content/themes/jannah/assets/css/base.min.css',
  widgets:'/wp-content/themes/jannah/assets/css/widgets.min.css',
  helpers:'/wp-content/themes/jannah/assets/css/helpers.min.css',
  single:'/wp-content/themes/jannah/assets/css/single.min.css',
  fontawesome:'/wp-content/themes/jannah/assets/css/fontawesome.css',
  elementor:'/wp-content/plugins/elementor/assets/css/frontend.min.css',
};
const candidates=[
  {name:'baseline_before',styles:[]},
  {name:'style_only',styles:['style']},
  {name:'style_base',styles:['style','base']},
  {name:'style_widgets',styles:['style','widgets']},
  {name:'style_base_helpers_widgets',styles:['style','base','helpers','widgets']},
  {name:'style_base_elementor',styles:['style','base','elementor']},
  {name:'baseline_after',styles:[]}
];
function short(v,n=220){return String(v??'').slice(0,n)}
function overlap(node,ranges){
  const lo=node.source?.start?.offset,hi=node.source?.end?.offset;
  if(lo==null||hi==null)return false;
  return ranges.some(r=>r.end>lo&&r.start<hi+1);
}
function getCriticalCss(entry){
  let root;
  try{root=postcss.parse(entry.text,{from:entry.url||'inlined'})}catch(e){return {error:String(e),css:'',original:entry.text.length}}
  let kept=0,discarded=0;
  root.walkRules(n=>{if(overlap(n,entry.ranges)){kept++}else{n.remove();discarded++}});
  root.walkAtRules(n=>{
    if(['font-face','keyframes','-webkit-keyframes','property','charset'].includes(n.name))return;
    if(n.nodes&&n.nodes.length===0)n.remove();
  });
  return {css:root.toString(),kept,discarded,original:entry.text.length};
}
async function runProbe(browser,label,width,styles,cssCache){
  const ctx=await browser.newContext({viewport:{width,height:width<768?823:900},isMobile:width<768,hasTouch:width<768,deviceScaleFactor:width<768?1.75:1,locale:'vi-VN'});
  const page=await ctx.newPage();
  const errors=[];let matched=[];
  page.on('pageerror',e=>errors.push(short(e.message)));
  if(styles.length){
    await page.route(BASE,async route=>{
      const response=await route.fetch();let html=await response.text();
      let critical=styles.map(k=>cssCache[k]?.css||'').join('\n');
      const styleTag='<style id="ptscps-critical-simulation" media="(max-width: 767px)">'+critical.replace(/<\/style/gi,'<\\/style')+'</style>';
      html=html.replace(/<head([^>]*)>/i,'<head$1>'+styleTag);
      html=html.replace(/<link\b[^>]*>/gi,tag=>{
        if(!/rel\s*=\s*['"]stylesheet['"]/i.test(tag))return tag;
        let key=styles.find(k=>tag.includes(TOP_CSS[k]));
        if(!key)return tag;
        matched.push(key);
        return tag.replace(/\s+media\s*=\s*(['"]).*?\1/ig,'').replace(/\s*\/?>$/,' media="print" onload="this.media=\'all\'" />');
      });
      await route.fulfill({response,body:html});
    });
  }
  await page.addInitScript(()=>{
    window.__ls=[];
    try{new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput)window.__ls.push({t:Math.round(e.startTime),v:e.value})}}).observe({type:'layout-shift',buffered:true})}catch(e){}
  });
  const cdp=await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:110*1024});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  let out={label,width,matched,errors};
  try{
    const response=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:80000});
    await page.waitForTimeout(8000);
    const measured=await page.evaluate(()=>{
      const nav=performance.getEntriesByType('navigation')[0];
      const fcp=performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint');
      const find=sel=>{const el=document.querySelector(sel);if(!el)return null;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),color:s.color,display:s.display,font:s.fontFamily}};
      return {ttfb:Math.round(nav.responseStart),fcp:Math.round(fcp?.startTime||0),cls:window.__ls.reduce((a,x)=>a+x.v,0),shiftEvents:window.__ls,cssDisabled:[...document.querySelectorAll('link[rel=stylesheet]')].filter(x=>x.media==='print').map(x=>x.href.replace(location.origin,'')),intro:find('.elementor-element-920fc5e'),slider:find('.elementor-element-77137dd'),header:find('#main-nav'),logo:find('.logo'),firstService:find('.elementor-element-a34b2bb'),body:find('body'),linkStyles:[...document.querySelectorAll('link[rel=stylesheet]')].length};
    });
    await page.screenshot({path:'critical-results/'+label+'-'+width+'.png',animations:'disabled'});
    out={...out,http:response.status(),...measured,errors:errors.slice(0,10)};
  }catch(e){out.error=short(e.stack,900);process.exitCode=1}
  await ctx.close();
  fs.writeFileSync('critical-results/'+label+'-'+width+'.json',JSON.stringify(out,null,2));
  console.log('RESULT '+JSON.stringify({label,width,matched,fcp:out.fcp,ttfb:out.ttfb,renderDelay:out.fcp&&out.ttfb?out.fcp-out.ttfb:null,cls:out.cls,errors:out.errors?.length,error:out.error,intro:out.intro?.y,slider:out.slider?.h,header:out.header?.y,cssDisabled:out.cssDisabled?.length}));
  return out;
}
async function main(){
  fs.mkdirSync('critical-results',{recursive:true});
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:412,height:823},deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
    const page=await context.newPage();
    await page.coverage.startCSSCoverage({resetOnNavigation:false});
    await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:75000});
    await page.waitForTimeout(6500);
    const coverage=await page.coverage.stopCSSCoverage();
    await context.close();
    const cssCache={};
    for(const [name,pattern]of Object.entries(TOP_CSS)){
      const entries=coverage.filter(e=>e.url?.includes(pattern));
      if(entries.length===0){console.log('MISSING '+name);continue}
      const best=entries.reduce((a,b)=>a.text.length>b.text.length?a:b);
      cssCache[name]=getCriticalCss(best);
      console.log('CRITICAL '+JSON.stringify({name,original:cssCache[name].original,inlineBytes:cssCache[name].css.length,kept:cssCache[name].kept,discarded:cssCache[name].discarded,error:cssCache[name].error}));
    }
    fs.writeFileSync('critical-results/critical-css-stats.json',JSON.stringify(Object.fromEntries(Object.entries(cssCache).map(([k,v])=>[k,{size:v.original,inlineBytes:v.css.length,kept:v.kept,error:v.error}])),null,2));
    for(const cfg of candidates){
      if(cfg.styles.some(k=>!cssCache[k]?.css)){console.log('SKIPPED '+cfg.name);continue}
      await runProbe(browser,cfg.name,412,cfg.styles,cssCache);
    }
    const preferred=candidates.filter(c=>['baseline_before','style_only','style_base','baseline_after'].includes(c.name));
    for(const cfg of preferred){
      if(cfg.styles.some(k=>!cssCache[k]?.css))continue;
      await runProbe(browser,cfg.name,375,cfg.styles,cssCache);
    }
  }finally{await browser.close()}
}
main().catch(e=>{console.error('FATAL '+String(e.stack||e));process.exitCode=1});