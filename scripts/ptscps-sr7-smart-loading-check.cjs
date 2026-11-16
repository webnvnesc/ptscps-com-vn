'use strict';
/** Read-only check of PTSCPS Slider Revolution SR7 > Global Settings > Optimization.
 * Authenticated in the ephemeral GH runner using existing WP secrets; no saves,
 * edits, database writes, screenshots of admin credentials or raw private payloads.
 */
const {chromium}=require('playwright');
const fs=require('node:fs');
const SITE='https://ptscps.com.vn';
const USER=process.env.WP_ADMIN_USERNAME||'';
const PASS=process.env.WP_ADMIN_PASSWORD||'';
const DIR='sr7-smart-loading-check';
fs.mkdirSync(DIR,{recursive:true});
const assert=(value,message)=>{if(!value)throw Error(message)};
async function snapshot(page,label){
 const shot=await page.evaluate(()=>{
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,250);
  const visible=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return !!(r.width&&r.height&&s.visibility!=='hidden'&&s.display!=='none')};
  const relevant=/SR7 Data Load Method|Smart Loading|Preloading|On Demand Loading|Optimization|Global Settings|Slider Revolution|Save Global Settings/i;
  const elements=[...document.querySelectorAll('button,select,option,[role="button"],[role="combobox"],[role="tab"],label,span,p,h1,h2,h3,h4,div')];
  const matched=elements.filter(e=>e.childElementCount<8 && relevant.test(norm(e.textContent)) && visible(e)).slice(0,65).map(e=>{
   const r=e.getBoundingClientRect();
   return {tag:e.tagName,role:e.getAttribute('role'),id:e.id||'',class:String(e.className||'').slice(0,110),text:norm(e.textContent),title:e.getAttribute('title'),ariaLabel:e.getAttribute('aria-label'),
    selected:e.getAttribute('aria-selected'),dataValue:e.getAttribute('data-value'),value:(e instanceof HTMLSelectElement)?e.value:null,
    options:(e instanceof HTMLSelectElement)?[...e.options].map(o=>({label:norm(o.textContent),value:o.value,selected:o.selected})).slice(0,15):null,
    rect:[r.x,r.y,r.width,r.height].map(Math.round)};
  });
  const inputs=[...document.querySelectorAll('select,[role=combobox],input,[aria-expanded]')].filter(e=>visible(e)).slice(0,45).map(e=>({
   tag:e.tagName,id:e.id,name:e.getAttribute('name'),role:e.getAttribute('role'),
   ariaLabel:e.getAttribute('aria-label'),ariaExpanded:e.getAttribute('aria-expanded'),
   class:String(e.className||'').slice(0,95),value:e instanceof HTMLSelectElement?e.value:null,
   selected:e instanceof HTMLSelectElement?e.selectedOptions[0]?.textContent:null
  }));
  const bodyText=norm(document.body.innerText);
  const raw=String(document.body.innerText||'');
  const snippets=[];
  for(const needle of ['SR7 Data Load Method','Smart Loading','Preloading','On Demand Loading']){
   const ix=raw.indexOf(needle);
   if(ix>=0)snippets.push({needle,context:norm(raw.slice(Math.max(0,ix-120),ix+430))});
  }
  return {urlPath:location.pathname,queryParams:[...new URLSearchParams(location.search).keys()],title:document.title,
   dashboardPresent:/Slider Revolution|Sliderrevolution/i.test(raw),
   textLength:raw.length,matched,inputs,snippets,iframeCount:document.querySelectorAll('iframe').length,
   frameSrcs:[...document.querySelectorAll('iframe')].map(e=>new URL(e.src,location.href).pathname).slice(0,8)};
 });
 console.log('SR7_INSPECT '+JSON.stringify({label,...shot}).slice(0,17000));
 return shot;
}
async function tryClick(page,needle, label){
 const locator=page.getByText(needle,{exact:true}).filter({visible:true});
 const count=await locator.count();
 console.log('SR7_ACTION_CANDIDATES '+JSON.stringify({label,needle,count}));
 for(let i=0;i<Math.min(count,7);i++){
  const e=locator.nth(i);
  const detail=await e.evaluate(el=>{
   const r=el.getBoundingClientRect();
   const parent=el.closest('button,[role="button"],a,[tabindex],.rs-button,.rs-module')||el.parentElement;
   return {tag:el.tagName,tagParent:parent?.tagName,clsParent:String(parent?.className||'').slice(0,180),
    textParent:String(parent?.textContent||'').trim().slice(0,120),inWpSidebar:!!el.closest('#adminmenu'),
    visible:r.width>0&&r.height>0};
  });
  console.log('SR7_CANDIDATE '+JSON.stringify({label,index:i,...detail}));
  if(detail.inWpSidebar)continue;
  if(!detail.visible)continue;
  if(label==='global-settings' && !/settings/i.test(detail.textParent))continue;
  try{await e.click({timeout:6000});console.log('SR7_CLICKED '+JSON.stringify({label,index:i}));return true;}catch(err){
   console.log('SR7_CLICK_FAILED '+JSON.stringify({label,index:i,error:String(err.message).slice(0,190)}));
  }
 }
 return false;
}
async function main(){
 assert(USER&&PASS,'Missing WP admin authentication secrets');
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 try{
  const context=await browser.newContext({viewport:{width:1550,height:990}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message).slice(0,200)));
  await page.goto(SITE+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:65000});
  if(await page.locator('#user_login').count()){
   await page.locator('#user_login').fill(USER);
   await page.locator('#user_pass').fill(PASS);
   await Promise.allSettled([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:38000}),page.locator('#wp-submit').click()]);
  }
  await page.goto(SITE+'/wp-admin/admin.php?page=revslider',{waitUntil:'domcontentloaded',timeout:85000});
  await page.waitForTimeout(4500);
  assert(page.url().includes('/wp-admin/'),'Could not access WP administration');
  const opening=await snapshot(page,'dashboard');
  if(!opening.dashboardPresent){
   console.log('SR7_RESULT '+JSON.stringify({status:'dashboard-not-found',path:opening.urlPath,title:opening.title}));
   process.exitCode=1;return;
  }
  let clicked=await tryClick(page,'Settings','global-settings');
  if(!clicked)clicked=await tryClick(page,'Global Settings','global-settings');
  await page.waitForTimeout(2200);
  const opened=await snapshot(page,'after-settings');
  let optimization=await tryClick(page,'Optimization','optimization');
  if(!optimization){
   // The UI may render the tab as a longer title.
   const alt=page.locator('[role=tab],button,a,div').filter({hasText:/^Optimization$/i}).filter({visible:true});
   if(await alt.count()===1){
    await alt.first().click({timeout:6000});optimization=true;
   }
  }
  await page.waitForTimeout(1200);
  const final=await snapshot(page,'optimization');
  const output={opened,final,settingsClicked:clicked,optimizationClicked:optimization,errors};
  fs.writeFileSync(DIR+'/result.json',JSON.stringify(output,null,2));
  const options=final.matched.filter(e=>/Data Load Method|Smart Loading|Preloading|On Demand Loading/i.test(e.text));
  const values=final.inputs.filter(e=>/load|data|optimiz/i.test([e.id,e.name,e.ariaLabel].join(' ')));
  const data=final.snippets.filter(s=>/SR7 Data Load Method|Smart Loading/i.test(s.needle));
  const selected=values.filter(x=>x.value||x.selected);
  const result={settingsClicked:clicked,optimizationClicked:optimization,sr7DataLoadVisible:options.length>0,
    labels:options.slice(0,18),inputs:selected.slice(0,14),context:data,
    errors:errors.slice(0,8)};
  console.log('SR7_CHECK_RESULT '+JSON.stringify(result).slice(0,14000));
 }finally{await browser.close()}
}
main().catch(e=>{console.error('SR7_CHECK_FATAL '+String(e.stack||e).slice(0,1200));process.exitCode=1});
