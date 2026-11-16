'use strict';
const {chromium}=require('playwright');
const postcss=require('postcss');
const selectorParser=require('postcss-selector-parser');
const {gzipSync}=require('node:zlib');
const fs=require('node:fs');
const site='https://ptscps.com.vn';
const target='/wp-content/themes/jannah/assets/css/style.min.css';
const width=Number(process.env.TEST_WIDTH||412);
const cases=[
  {name:'home',url:'/'},
  {name:'news-category',url:'/c/hoat-dong-cua-cong-ty'},
  {name:'service-detail',url:'/dich-vu/van-hanh-va-bao-duong-fpso-fso-mopu'}
];
const out='feature-ab-'+width;
fs.mkdirSync(out,{recursive:true});
const classifiers={
 slider:c=>c.some(x=>/^tie-slider(?:-\d+)?$/.test(x)||/^tie-slider-/.test(x)),
 dark:c=>c.includes('dark-skin'),
 block:c=>c.some(x=>/^block-head-(?:1|2|3|4|5|6|8|9|10|11)$/.test(x))&&!c.includes('block-head-7')
};
const variants={
 control:[],
 no_slider:['slider'],
 no_dark:['dark'],
 no_alternate_block:['block'],
 no_three:['slider','dark','block']
};
function filterRule(rule,k){
 let yes=true,n=0;
 try{
  selectorParser(ast=>ast.each(sel=>{
   const classes=[];let complex=false;
   sel.walkClasses(c=>classes.push(c.value));
   sel.walkPseudos(p=>{if(/^:(?:is|where|not|has|matches)$/.test(p.value))complex=true});
   if(!classes.length||complex||!classifiers[k](classes))yes=false;
   n++;
  })).processSync(rule.selector)
 }catch{return false}
 return n>0&&yes;
}
const ms=xs=>xs.length?[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)]:null;
async function run(browser,css,variant,entry,cycle){
 const ctx=await browser.newContext({viewport:{width,height:width<700?823:900},
  isMobile:width<700,hasTouch:width<700,deviceScaleFactor:width<700?1.5:1,
  ...(width<700?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})});
 const page=await ctx.newPage();const jsErrors=[],networkErrors=[];
 page.on('pageerror',e=>jsErrors.push(e.message.slice(0,220)));
 page.on('console',m=>{if(m.type()==='error')networkErrors.push(m.text().slice(0,150))});
 let served=false;
 await page.route('**/wp-content/themes/jannah/assets/css/style.min.css?*',async route=>{
  served=true;
  // Give baseline and variants identical synthetic RTT plus estimated compressed transfer.
  const bytes=gzipSync(Buffer.from(css[variant])).length;
  await new Promise(ok=>setTimeout(ok,150+Math.round(bytes/(210*1024)*1000)));
  await route.fulfill({status:200,contentType:'text/css; charset=utf-8',
   headers:{'cache-control':'no-store','access-control-allow-origin':'*'},body:css[variant]});
 });
 await page.addInitScript(()=>{
  window.__shifts=[];
  try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__shifts.push(e.value)}).observe({type:'layout-shift',buffered:true})}catch(e){}
 });
 const cdp=await ctx.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:210*1024,uploadThroughput:95*1024});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 const data={entry:entry.name,variant,cycle,width};
 try{
  const resp=await page.goto(site+entry.url,{waitUntil:'domcontentloaded',timeout:75000});
  await page.waitForTimeout(2600);
  const p=await page.evaluate(()=>{
   const n=performance.getEntriesByType('navigation')[0],paint=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
   const g={};for(const sel of ['#main-nav','.logo','.elementor-element-77137dd','.elementor-element-920fc5e',
   '.mag-box','.entry-header-outer','footer']){
    const el=document.querySelector(sel);if(!el){g[sel]=null;continue}
    const r=el.getBoundingClientRect();g[sel]={x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}
   }
   const allClasses=new Set();
   document.querySelectorAll('[class]').forEach(x=>x.classList.forEach(v=>{
    if(/^(?:dark-skin|tie-slider|block-head-)/.test(v))allClasses.add(v)
   }));
   return {fcp:Math.round(paint?.startTime||0),ttfb:Math.round(n.responseStart),
    cls:window.__shifts.reduce((a,b)=>a+b,0),geometry:g,
    featureClasses:[...allClasses].sort().slice(0,50),
    stylesheetCount:document.querySelectorAll('link[rel=stylesheet]').length,
    editorWidgets:document.querySelectorAll('.elementor-widget').length,
    scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth}
  });
  Object.assign(data,p,{gap:p.fcp-p.ttfb,status:resp.status(),served,jsErrors:jsErrors.slice(0,5),
   networkErrors:networkErrors.slice(0,5)});
  if(cycle===0)await page.screenshot({path:out+'/'+entry.name+'-'+variant+'-'+width+'.png',animations:'disabled'});
 }catch(e){data.error=String(e.stack||e).slice(0,500);process.exitCode=1}
 await ctx.close();
 fs.writeFileSync(out+'/'+entry.name+'-'+variant+'-'+cycle+'.json',JSON.stringify(data,null,2));
 console.log('SAMPLE '+JSON.stringify({entry:entry.name,variant,cycle,fcp:data.fcp,ttfb:data.ttfb,gap:data.gap,
  cls:data.cls,served:data.served,featureClasses:data.featureClasses,errors:data.jsErrors,
  scrollWidth:data.scrollWidth,viewport:data.viewport,failed:data.error}));
 return data;
}
async function main(){
 const response=await fetch(site+target+'?ver=7.6.3');
 if(!response.ok)throw Error('cannot fetch source CSS '+response.status);
 const original=await response.text();const css={control:original};
 for(const [variant,keys]of Object.entries(variants)){
  if(!keys.length)continue;
  const ast=postcss.parse(original);
  let removed=0;
  ast.walkRules(rule=>{if(keys.some(k=>filterRule(rule,k))){rule.remove();removed++}});
  ast.walkAtRules(a=>{if(a.nodes&&a.nodes.length===0&&['media','supports','layer'].includes(a.name))a.remove()});
  css[variant]=ast.toString();
  console.log('VARIANT '+JSON.stringify({variant,removed,gzip:gzipSync(Buffer.from(css[variant])).length}));
 }
 const browser=await chromium.launch({headless:true});
 const samples=[];
 try{
  for(const entry of cases){
   for(let cycle=0;cycle<2;cycle++){
    const keys=cycle%2?Object.keys(variants).reverse():Object.keys(variants);
    for(const key of keys)samples.push(await run(browser,css,key,entry,cycle));
   }
  }
 }finally{await browser.close()}
 for(const entry of cases){
  const grp=samples.filter(x=>x.entry===entry.name&&x.fcp);
  const controls=new Map(grp.filter(x=>x.variant==='control').map(x=>[x.cycle,x]));
  const summary=Object.keys(variants).map(variant=>{
   const records=grp.filter(x=>x.variant===variant);
   const diffs=records.filter(x=>controls.has(x.cycle)).map(x=>x.gap-controls.get(x.cycle).gap);
   return {variant,n:records.length,medianFCP:ms(records.map(x=>x.fcp)),medianGap:ms(records.map(x=>x.gap)),
    pairedGapDeltas:diffs,clsMax:Math.max(...records.map(x=>x.cls||0)),totalErrors:records.reduce((s,x)=>s+x.jsErrors?.length||0,0),
    served:records.every(x=>x.served),featureClasses:records[0]?.featureClasses};
  });
  console.log('STATS '+JSON.stringify({entry:entry.name,width,summary}));
 }
}
main().catch(e=>{console.error('FATAL',e.stack||String(e));process.exitCode=1});