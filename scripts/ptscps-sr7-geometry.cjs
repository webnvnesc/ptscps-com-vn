'use strict';
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const mobile of [false,true])for(const javascriptEnabled of [false,true]){
  const ctx=await b.newContext({viewport:{width:mobile?412:1440,height:mobile?850:900},isMobile:mobile,hasTouch:mobile,javascriptEnabled});
  const p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message.slice(0,100)));
  try{
   const res=await p.goto('https://ptscps.com.vn/',{waitUntil:'domcontentloaded',timeout:70000});
   await p.waitForTimeout(javascriptEnabled?1700:450);
   const x=await p.evaluate(()=>{
    const sel=['#SR7_1_1','.wp-block-themepunch-revslider','.elementor-widget-slider_revolution','.elementor-element-277403e','#SR7_1_1 sr7-content','#SR7_1_1 sr7-slide:first-child','#SR7_1_1 sr7-bg:first-child'];
    return Object.fromEntries(sel.map(k=>{const el=document.querySelector(k);if(!el)return[k,null];const b=el.getBoundingClientRect(),s=getComputedStyle(el);return[k,{rect:[b.x,b.y,b.width,b.height].map(Math.round),display:s.display,position:s.position,visibility:s.visibility,opacity:s.opacity,background:s.background,z:s.zIndex,overflow:s.overflow}]}));
   });
   console.log('SR7_GEOMETRY '+JSON.stringify({mobile,javascriptEnabled,status:res.status(),geometry:x,errors}).slice(0,9000));
  }catch(e){console.log('SR7_GEOMETRY_ERROR '+JSON.stringify({mobile,javascriptEnabled,error:String(e).slice(0,250)}));}
  await ctx.close();
 }
 await b.close();
})().catch(e=>{console.error(e.stack);process.exitCode=1});
