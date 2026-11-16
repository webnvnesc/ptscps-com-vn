'use strict';
/**
 * ONE-TIME WordPress admin action using native Jannah Page 5 setting.
 * Check #tie_hide_page_featured in existing edit screen, publish through WordPress
 * UI, verify persisted setting and anonymous rendering, rollback on failed QA.
 * No theme/plugin edits, no database access, no custom PHP endpoints.
 */
const {chromium}=require('playwright');
const {execFileSync}=require('node:child_process');
const SITE='https://ptscps.com.vn';
const EDIT=SITE+'/wp-admin/post.php?post=5&action=edit';
const LOGIN=SITE+'/wp-login.php?redirect_to='+encodeURIComponent(EDIT);
const FLAG='#tie_hide_page_featured';
const USER=process.env.WP_ADMIN_USERNAME;
const PASS=process.env.WP_ADMIN_PASSWORD;
if(!USER||!PASS)throw Error('WordPress admin credentials unavailable');
const assert=(c,msg)=>{if(!c)throw Error(msg)};
(async()=>{
const browser=await chromium.launch({headless:true});
let editor=null,original=null,changed=false;
async function openEditor(){
 await editor.goto(EDIT,{waitUntil:'domcontentloaded',timeout:75000});
 await editor.locator(FLAG).waitFor({state:'attached',timeout:25000});
 assert(new URL(editor.url()).pathname==='/wp-admin/post.php','Editor access lost');
}
async function saveFlag(checked){
 await openEditor();
 const input=editor.locator(FLAG);
 await input.evaluate((el,enabled)=>{
  el.checked=enabled;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
 },checked);
 assert((await input.isChecked())===checked,'Jannah checkbox input state not changed');
 const submit=editor.locator('#publish');
 assert((await submit.count())===1,'Expected classic WordPress update button missing');
 await Promise.all([
  editor.waitForNavigation({waitUntil:'domcontentloaded',timeout:65000}),
  submit.click({force:true,timeout:30000})
 ]);
 await editor.waitForTimeout(950);
 await openEditor();
 const persisted=await editor.locator(FLAG).isChecked();
 assert(persisted===checked,'Jannah native checkbox failed to persist');
 console.log('NATIVE_OPTION_PERSISTED '+JSON.stringify({pageId:5,option:'tie_hide_page_featured',checked:persisted}));
}
function purge(){
 const stdout=execFileSync('python3',['scripts/ptscps-purge-home-featured.py'],{
  encoding:'utf8',timeout:55000,env:process.env
 });
 console.log('CACHE_ACTION '+stdout.trim());
}
async function checkAnonymous(width,bust){
 const mobile=width<700;
 const context=await browser.newContext({viewport:{width,height:mobile?823:900},
  deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
 const page=await context.newPage();
 const fetches=[];
 page.on('request',r=>{
  if(/\/2025\/09\/Untitled-1(?:-\d+x\d+)?\.jpg(?:\?|$)/i.test(r.url())){
   fetches.push({url:r.url(),type:r.resourceType()});
  }
 });
 const path=bust?('/?ptscps_hide_featured_qa='+Date.now()+'_'+width):'/';
 const response=await page.goto(SITE+path,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForTimeout(1800);
 const data=await page.evaluate(()=>{
  const targets=[...document.querySelectorAll('figure.single-featured-image')];
  const imgs=[...document.querySelectorAll('img')].filter(i=>(i.currentSrc||i.src||'').includes('/2025/09/Untitled-1'));
  const og=document.querySelector('meta[property="og:image"]')?.content||null;
  const h1=[...document.querySelectorAll('h1')].map(x=>x.textContent.trim()).slice(0,4);
  return {figures:targets.length,images:imgs.length,og,containsHomeBuilder:document.querySelectorAll('.elementor-widget').length>0,
   headerLogo:document.querySelectorAll('img.tie-logo-img-default').length,
   slider:!!document.querySelector('sr7-module'),h1};
 });
 const result={width,mode:bust?'cache-bypass':'canonical',status:response.status(),...data,fetches};
 console.log('PUBLIC_CHECK '+JSON.stringify(result));
 await context.close();
 assert(result.status===200,'Public homepage not HTTP 200');
 assert(result.figures===0&&result.images===0,'Featured image remains in homepage HTML');
 assert(result.fetches.length===0,'Hidden featured image still requested');
 assert(result.og&&result.og.includes('/2025/09/Untitled-1.jpg'),'og:image missing or changed');
 assert(result.containsHomeBuilder&&result.headerLogo>0&&result.slider,'Homepage builder/header/slider missing');
}
try{
 editor=await browser.newPage();
 await editor.goto(LOGIN,{waitUntil:'domcontentloaded',timeout:50000});
 if(await editor.locator('#user_login').count()){
  await editor.locator('#user_login').fill(USER);
  await editor.locator('#user_pass').fill(PASS);
  await editor.locator('#wp-submit').click();
  await editor.waitForLoadState('domcontentloaded',{timeout:60000});
 }
 await openEditor();
 original=await editor.locator(FLAG).isChecked();
 console.log('NATIVE_OPTION_BEFORE '+JSON.stringify({pageId:5,checked:original}));
 if(!original){
  // Native WordPress setting instead of output filtering or CSS/JS removal.
  await saveFlag(true);
  changed=true;
 }
 purge();
 for(const width of [412,1440]){
  await checkAnonymous(width,true);
  await checkAnonymous(width,false);
 }
 console.log('FEATURED_NATIVE_SUCCESS '+JSON.stringify({pageId:5,wasEnabled:original,nowEnabled:true,qa:'4/4',ogPreserved:true}));
}catch(err){
 console.error('FEATURED_NATIVE_FAIL '+String(err.message||err).slice(0,950));
 if(changed&&original===false){
  try{
   await saveFlag(false);
   purge();
   console.error('FEATURED_NATIVE_ROLLBACK_SUCCESS');
  }catch(re){console.error('FEATURED_NATIVE_ROLLBACK_FAILED '+String(re.message||re).slice(0,350))}
 }
 process.exitCode=1;
}finally{
 await browser.close();
}
})().catch(e=>{console.error("FEATURED_NATIVE_FATAL "+String(e.stack||e));process.exitCode=1});
