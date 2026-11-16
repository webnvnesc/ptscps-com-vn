'use strict';
// Verify whether a WordPress featured image is actually rendered/requested by
// anonymous users. No site changes; public homepage only.
const { chromium }=require('playwright');
const BASE='https://ptscps.com.vn/';
const TARGET='Untitled-1';
async function run(width){
 const mobile=width<700;
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({
  viewport:{width,height:mobile?823:900},deviceScaleFactor:mobile?2:1,
  isMobile:mobile,hasTouch:mobile
 });
 const page=await context.newPage();
 const events=[];
 page.on('request', req=>{
  if(req.url().includes(TARGET))events.push({phase:'request',url:req.url(),type:req.resourceType(),at:Date.now()});
 });
 page.on('response',res=>{
  if(res.url().includes(TARGET))events.push({phase:'response',url:res.url(),status:res.status(),at:Date.now()});
 });
 page.on('requestfailed',req=>{
  if(req.url().includes(TARGET))events.push({phase:'failed',url:req.url(),error:req.failure()?.errorText,at:Date.now()});
 });
 const resp=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForTimeout(4000);
 const state=await page.evaluate((name)=>{
  const elements=[...document.querySelectorAll('img')].filter(i=>(i.getAttribute('src')||'').includes(name)||(i.currentSrc||'').includes(name)||(i.srcset||'').includes(name));
  const og=[...document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"],meta[property="og:image:url"],link[rel="image_src"]')].map(n=>({attr:n.getAttribute('property')||n.getAttribute('name')||n.getAttribute('rel'),content:n.getAttribute('content')||n.getAttribute('href')}));
  const perf=performance.getEntriesByType('resource').filter(e=>e.name.includes(name)).map(e=>({
   name:e.name,initiatorType:e.initiatorType,startTime:Math.round(e.startTime),
   responseEnd:Math.round(e.responseEnd),transferSize:e.transferSize,
   encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize}));
  const chain=(el)=>{let p=el;const c=[];for(let i=0;p&&i<9;p=p.parentElement,i++){
   const st=getComputedStyle(p),r=p.getBoundingClientRect();
   c.push({tag:p.tagName,class:p.className?.toString().slice(0,140)||'',id:p.id||'',
     display:st.display,visibility:st.visibility,opacity:st.opacity,
     rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
     offsetParent:p.offsetParent?.tagName||null});
  }return c};
  return {url:location.href,og,view:[innerWidth,innerHeight],imageCount:elements.length,
   images:elements.map(el=>{const r=el.getBoundingClientRect();const st=getComputedStyle(el);
    return {
      outerHTML:el.outerHTML.slice(0,1100),visibleCSS:st.display!=='none'&&st.visibility!=='hidden',
      inInitialViewport:r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth,
      renderedBox:r.width>0&&r.height>0,
      complete:el.complete,naturalSize:[el.naturalWidth,el.naturalHeight],
      currentSrc:el.currentSrc,loading:el.loading,decoding:el.decoding,
      fetchPriority:el.fetchPriority,parents:chain(el)};}),
   resources:perf};
 },TARGET);
 console.log('FEATURED_HOME '+JSON.stringify({width,status:resp.status(),events,...state}).slice(0,18000));
 await context.close();await browser.close();
}
(async()=>{for(const width of [412,1440])await run(width)})().catch(e=>{console.error('FEATURED_ERR '+e.stack);process.exitCode=1});
