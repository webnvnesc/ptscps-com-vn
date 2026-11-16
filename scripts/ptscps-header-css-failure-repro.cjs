'use strict';
const {chromium}=require('playwright');
async function main(){
 const b=await chromium.launch({headless:true,args:['--disable-extensions']});
 for(const cssMode of ['baseline','block-jannah-main','block-jannah-all']){
  const c=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const p=await c.newPage();
  const errs=[],bad=[];
  p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
  if(cssMode!=='baseline')await p.route('**/*',async r=>{
   const u=r.request().url();
   if(cssMode==='block-jannah-main'&&/\/themes\/jannah\/assets\/css\/style\.min\.css/.test(u)
    ||cssMode==='block-jannah-all'&&/\/themes\/jannah\/assets\/css\//.test(u)){
    bad.push(u.split('?')[0]);await r.abort('failed');return;
   }
   await r.continue();
  });
  const response=await p.goto('https://ptscps.com.vn/',{waitUntil:'domcontentloaded',timeout:80000});
  await p.waitForTimeout(1500);
  const q=await p.evaluate(()=>{
    const bounds=e=>{const r=e?.getBoundingClientRect();return r?[r.x,r.y,r.width,r.height].map(Math.round):null};
    const logo=document.querySelector('img.tie-logo-img-default');
    const fields=[...document.querySelectorAll('input[type=search],input[name=s]')].filter(x=>!x.closest('#wpadminbar'));
    const search=fields[0]||document.querySelector('form.searchform');
    const st=logo&&getComputedStyle(logo),ss=search&&getComputedStyle(search);
    return {logo:bounds(logo),logoMaxWidth:st?.maxWidth,search:bounds(search),searchDisplay:ss?.display,
     searchCount:fields.length,header:bounds(document.querySelector('#theme-header')),
     css:Jannah=[...document.styleSheets].filter(x=>/jannah/.test(x.href||'')).length};
  });
  console.log('CSS_REPRO '+JSON.stringify({cssMode,status:response.status(),blocked:bad,metrics:q,errs}));
  await p.screenshot({path:'/tmp/header-repro-'+cssMode+'.png',fullPage:false}).catch(()=>{});
  await c.close();
 }
 await b.close();
}
main().catch(e=>{console.error('CSS_REPRO_FATAL '+(e.stack||e));process.exitCode=1});
