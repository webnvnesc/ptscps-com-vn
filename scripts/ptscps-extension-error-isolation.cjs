'use strict';
/**
 * Read-only anonymous Chrome smoke check after report of
 * Content scripts > "Tải video & audio" > onboarding.js:48
 * (browser extension). Uses a fresh Chromium context with extensions disabled;
 * separates website/runtime errors from extension-origin errors.
 */
const { chromium }=require('playwright');
const cases=[
  {label:'homepage',path:'/'},
  {label:'services',path:'/dich-vu'},
  {label:'contact',path:'/lien-he'}
];
const base='https://ptscps.com.vn';
async function main(){
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 const samples=[];
 try{
  for(const width of [412,1440]){
   for(const scenario of cases){
    const ctx=await browser.newContext({
     viewport:{width,height:width===412?823:900},
     deviceScaleFactor:width===412?2:1,
     isMobile:width===412,hasTouch:width===412
    });
    const page=await ctx.newPage();
    const pageErrors=[],consoleErrors=[],onboardingRequests=[],failedRequests=[];
    page.on('pageerror',e=>pageErrors.push({message:e.message.slice(0,260),
      stack:(e.stack||'').split('\n').slice(0,3).join(' ').slice(0,340)}));
    page.on('console',msg=>{
     if(msg.type()==='error'){
      const at=msg.location();
      consoleErrors.push({text:msg.text().slice(0,220),
       url:(at.url||'').slice(0,160),line:at.lineNumber});
     }
    });
    page.on('request',req=>{
     if(/onboarding\.js|chrome-extension:|moz-extension:/i.test(req.url()))
      onboardingRequests.push(req.url().slice(0,180));
    });
    page.on('requestfailed',req=>{
     const url=req.url();
     failedRequests.push({url:url.slice(0,160),error:req.failure()?.errorText||null});
    });
    let status=null,docScripts=0,inlineOnboarding=0,home=false,error=null;
    try{
     const response=await page.goto(base+scenario.path,
      {waitUntil:'domcontentloaded',timeout:75000});
     status=response?.status()||null;
     await page.waitForTimeout(3000);
     const dom=await page.evaluate(()=>{
      const scripts=[...document.querySelectorAll('script[src]')].map(e=>e.src);
      return {scriptCount:scripts.length,
       onboardingScriptCount:scripts.filter(url=>/onboarding\.js/i.test(url)).length,
       pageTitle:document.title,
       hasMain:!!document.querySelector('main, #main-content, .main-content'),
       hasSlider:!!document.querySelector('sr7-module')};
     });
     docScripts=dom.scriptCount;
     inlineOnboarding=dom.onboardingScriptCount;
     home=dom.hasMain;
    }catch(e){error=(e.stack||e.message||String(e)).slice(0,480)}
    const row={path:scenario.path,width,status,
     pageErrors,consoleErrors,failedRequests:failedRequests.slice(0,8),
     onboardingRequests,inlineOnboarding,docScripts,hasMain:home,error};
    samples.push(row);
    console.log('EXTENSION_ISOLATION '+JSON.stringify(row));
    await ctx.close();
   }
  }
 }finally{await browser.close()}
 const summary={cases:samples.length,statusOK:samples.filter(s=>s.status===200).length,
  truePageErrorCount:samples.reduce((a,s)=>a+s.pageErrors.length,0),
  consoleErrorCount:samples.reduce((a,s)=>a+s.consoleErrors.length,0),
  onboardingRequests:samples.reduce((a,s)=>a+s.onboardingRequests.length,0),
  pageScriptsNamedOnboarding:samples.reduce((a,s)=>a+s.inlineOnboarding,0),
  tests:samples.map(s=>({path:s.path,width:s.width,status:s.status,
   pageErrors:s.pageErrors.length,consoleErrors:s.consoleErrors.length}))};
 console.log('EXTENSION_ISOLATION_SUMMARY '+JSON.stringify(summary));
 if(samples.some(s=>s.status!==200||s.error))process.exitCode=1;
}
main().catch(e=>{console.error('FATAL '+(e.stack||e));process.exitCode=1});
