'use strict';
/* Read-only frontend API inventory across representative anonymous page types.
 * Dynamic fetch/xhr, WP REST, admin-ajax and Elementor POST calls are
 * inspected but never triggered by submitting a form.  Search text entry only.
 */
const {chromium}=require('playwright');
const fs=require('node:fs');
const origin='https://ptscps.com.vn';
const targetPaths=[
  '/', '/dich-vu', '/thu-ngo.htm', '/hseq', '/tin-tuc', '/tuyen-dung',
  '/lien-he','/c/co-dong','/c/co-dong/quan-he-co-dong','/c/co-dong/bao-cao-tai-chinh',
  '/c/tin-tuc/hoat-dong-cua-cong-ty','/thu-vien-pps',
  '/dich-vu/van-hanh-va-bao-duong-fpso-fso-mopu',
  '/cong-ty-pps-hanh-trinh-tri-an-nam-2026-tai-tp-ho-chi-minh.htm',
  '/en'
];
const widths=[1440,412];
const isAPI=u=>{try{const dest=new URL(u);if(dest.origin!==origin)return false;const p=dest.pathname;return /\/wp-json(?:\/|$)|\/wp-admin\/admin-ajax\.php$|\/wp-admin\/admin-post\.php$|\/ajax(?:\/|$)/i.test(p) || /[?&](?:rest_route|wc-ajax)=/i.test(dest.search)}catch{return false}};
const safeURL=x=>{
 try{const u=new URL(x);if(u.origin!==origin)return u.origin+u.pathname;
 // Do not print auth/session parameters.
 const safe=new URLSearchParams();
 for(const [key,v] of u.searchParams)if(!/nonce|token|pass|key|authorization|user|email|cookie|security|captcha/i.test(key))
 safe.append(key,String(v).slice(0,95));
 return u.pathname+(safe.size?'?'+safe:'');
 }catch(e){return String(x).slice(0,200)}
};
const tasks=[];
for(const width of widths)for(const path of targetPaths)tasks.push({width,path});
async function runTask(browser,task){
 const context=await browser.newContext({
   viewport:{width:task.width,height:task.width===412?823:900},
   deviceScaleFactor:task.width===412?2:1,
   isMobile:task.width===412,hasTouch:task.width===412,
   serviceWorkers:'block'
 });
 const page=await context.newPage();
 const requests=[], failures=[], pageErrors=[];
 const tracked=new WeakMap();
 page.on('request',req=>{
   const url=req.url(),type=req.resourceType();
   if(!isAPI(url) && !['fetch','xhr'].includes(type))return;
   const event={method:req.method(),type,url:safeURL(url),isAPI:isAPI(url),time:Date.now()};
   tracked.set(req,event);requests.push(event);
 });
 page.on('response',res=>{
   const req=res.request();const event=tracked.get(req);
   if(event){event.status=res.status();event.ctype=(res.headers()['content-type']||'').slice(0,90);
     event.durationMs=Date.now()-event.time;
     event.cache=res.headers()['x-ptscps-sr7-plugin-profile']||null;
   }
 });
 page.on('requestfailed',req=>{
  const url=req.url();if(isAPI(url)||['fetch','xhr'].includes(req.resourceType()))
  failures.push({url:safeURL(url),reason:req.failure()?.errorText||''});
 });
 page.on('pageerror',e=>pageErrors.push(String(e.message).slice(0,180)));
 let status=null,error=null,searchTest=null,autoSlideCount=0;
 try{
  const res=await page.goto(origin+task.path,{waitUntil:'domcontentloaded',timeout:60000});
  status=res?.status()||null;
  await page.waitForTimeout(task.path==='/'?5200:1950);
  await page.evaluate(()=>window.scrollTo(0,Math.max(0,document.body.scrollHeight-innerHeight-200))).catch(()=>{});
  await page.waitForTimeout(800);
  await page.evaluate(()=>window.scrollTo(0,0)).catch(()=>{});
  if(task.path==='/'&&task.width===1440){
   // Safe typing only, no search submit or write calls.
   const input=page.locator('input[type="search"], input[name="s"]').first();
   if(await input.count()){
    try{
     await input.fill('FPSO',{timeout:4500});
     await page.waitForTimeout(2000);
     searchTest='typed-query-no-submit';
    }catch(e){searchTest='input-inaccessible'}
   }
  }
  autoSlideCount=await page.locator('sr7-module').count().catch(()=>0);
 }catch(e){error=String(e.message||e).slice(0,250)}
 const row={path:task.path,width:task.width,status,error,searchTest,slider:autoSlideCount,
   requests:requests.map(x=>({...x,time:undefined})),
   fails:failures.slice(0,9),errors:pageErrors.slice(0,8)};
 console.log('FRONT_API_PAGE '+JSON.stringify(row).slice(0,24500));
 await context.close();
 return row;
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 let rows=[],pos=0;
 try{
  async function worker(){while(pos<tasks.length){const task=tasks[pos++];rows.push(await runTask(browser,task));}}
  await Promise.all([worker(),worker(),worker()]);
 }finally{await browser.close()}
 const map=new Map();
 for(const row of rows){
  for(const e of row.requests){
   const key=e.method+' '+e.url;
   const obj=map.get(key)||{key,method:e.method,url:e.url,isAPI:e.isAPI,calls:0,
     pages:[],statuses:[],types:[],medianTimes:[]};
   obj.calls++;if(!obj.pages.includes(row.path+'@'+row.width))obj.pages.push(row.path+'@'+row.width);
   if(!obj.statuses.includes(e.status))obj.statuses.push(e.status);
   if(!obj.types.includes(e.type))obj.types.push(e.type);
   if(typeof e.durationMs==='number')obj.medianTimes.push(e.durationMs);
   map.set(key,obj);
  }
 }
 const summary=[...map.values()].map(x=>({...x,
  medianDurationMs:x.medianTimes.length?x.medianTimes.sort((a,b)=>a-b)[Math.floor(x.medianTimes.length/2)]:null,
  medianTimes:undefined})).sort((a,b)=>b.calls-a.calls);
 fs.writeFileSync('frontend-api-inventory.json',JSON.stringify({rows,summary},null,2));
 console.log('FRONT_API_SUMMARY '+JSON.stringify({pages:rows.length,pageSuccess:rows.filter(x=>x.status===200).length,
  endpoints:summary,failedRequests:rows.flatMap(x=>x.fails).slice(0,20),
  errors:rows.flatMap(x=>x.errors).slice(0,20)}).slice(0,26000));
})().catch(e=>{console.error('FRONT_API_FATAL '+String(e.stack||e));process.exitCode=1});
