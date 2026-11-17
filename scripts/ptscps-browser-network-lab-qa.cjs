'use strict';
/** Smoke-test browser diagnostic on production; never touches WordPress admin. */
const {chromium}=require('playwright');
const fs=require('node:fs');
const endpoint='https://ptscps.com.vn/ptscps-browser-network-lab-20261117.html';
const out='ptscps-browser-netlab-qa.json';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:850},serviceWorkers:'block'});
  const errors=[];
  page.on('pageerror',err=>errors.push(String(err.message||err).slice(0,170)));
  const response=await page.goto(endpoint,{waitUntil:'load',timeout:35000});
  if(!response || response.status()!==200)throw Error('Diagnostic page did not respond HTTP 200');
  const title=await page.title();
  if(!title.includes('PTSCPS'))throw Error('Unexpected lab document');
  const robots=await page.locator('meta[name="robots"]').getAttribute('content');
  if(!robots.includes('noindex'))throw Error('Missing noindex');
  await page.locator('#rounds').selectOption('6');
  await page.locator('#run').click();
  await page.waitForFunction(()=>{
   const r=window.ptscpsNetworkLab?.getReport?.();
   return r && r.summary?.jannah?.solo?.attempted>=6 && !document.querySelector('#run').disabled;
  },null,{timeout:125000});
  const results=await page.evaluate(()=>window.ptscpsNetworkLab.getReport());
  const summary={version:results.version,domain:results.origin,rounds:results.rounds,
    attempted:results.rows.length,
    individual:Object.fromEntries(Object.entries(results.summary).map(([key,value])=>[
     key,{solo:value.solo,group:value.group}
    ])),
    errors,assets:results.assets.map(({key,path})=>({key,path})),
    groupCount:results.groupAssets.length
  };
  fs.writeFileSync(out,JSON.stringify(summary,null,2));
  console.log('NETLAB_QA '+JSON.stringify(summary).slice(0,11000));
  if(results.groupAssets.length<3)throw Error('No grouped requests');
  for(const key of ['jannah','spacer','jquery']){
   if(results.summary[key].solo.attempted<6 || results.summary[key].group.attempted<6)
    throw Error('Insufficient samples '+key);
   if(results.summary[key].solo.n<4 || results.summary[key].group.n<4)
    throw Error('Too many failed samples '+key);
  }
  if(errors.length)throw Error('Browser JS errors: '+errors.join('; '));
 }finally{await browser.close();}
})().catch(e=>{console.error('NETLAB_QA_ERROR '+String(e.stack||e));process.exitCode=1;});
