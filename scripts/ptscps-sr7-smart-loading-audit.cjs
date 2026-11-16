'use strict';
/** Read-only SR7 global loader configuration audit. No changes, no secret logging. */
const { chromium }=require('playwright');
const site='https://ptscps.com.vn';
const user=process.env.WP_ADMIN_USERNAME;
const pass=process.env.WP_ADMIN_PASSWORD;
(async()=>{
const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
try{
 const page=await browser.newPage();
 if(!user||!pass){console.log('SR7_ADMIN '+JSON.stringify({status:'missing_credentials'}));process.exitCode=1;}
 else {
  await page.goto(site+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:55000});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(user);
    await page.locator('#user_pass').fill(pass);
    await Promise.allSettled([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:35000}),page.locator('#wp-submit').click()]);
  }
  const dashboard=await page.goto(site+'/wp-admin/admin.php?page=revslider',{waitUntil:'domcontentloaded',timeout:70000});
  await page.waitForTimeout(2000);
  const targets=await page.evaluate(()=>{
    const nodes=[...document.querySelectorAll('button,[role="button"],a')].filter(el=>/settings|optimization|smart loading|global/i.test(
      (el.textContent||'').trim().slice(0,90)+' '+(el.getAttribute('aria-label')||'')+' '+(el.title||''))).slice(0,65);
    return nodes.map(el=>({tag:el.tagName,text:el.textContent?.trim().slice(0,80),aria:el.getAttribute('aria-label'),
     title:el.getAttribute('title'),class:String(el.className||'').slice(0,130),visible:el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0}));
  });
  console.log('SR7_SETTINGS_BUTTONS '+JSON.stringify({items:targets}).slice(0,16000));
  const candidates=page.getByRole('button',{name:/^settings$/i});
  let settingsOpened=false;
  if(await candidates.count()){
    for(let index=0;index<await candidates.count();index++){
      try{if(await candidates.nth(index).isVisible()){
        await candidates.nth(index).click({timeout:12000});settingsOpened=true;break;
      }}catch(e){}
    }
  }
  if(!settingsOpened){
    const el=page.locator('button:has-text("Settings"),[role="button"]:has-text("Settings")').first();
    try{if(await el.count()){await el.click({timeout:12000});settingsOpened=true;}}catch(e){}
  }
  await page.waitForTimeout(1500);
  console.log('SR7_SETTINGS_OPEN '+JSON.stringify({clicked:settingsOpened,
    tabs:await page.evaluate(()=>[...document.querySelectorAll('button,[role="tab"],a')].filter(e=>
      /optimization|general|settings/i.test(e.textContent?.trim()||'')&&e.getBoundingClientRect().width>0)
      .slice(0,50).map(e=>({tag:e.tagName,text:e.textContent?.trim().slice(0,100),aria:e.getAttribute('aria-label'),
       class:String(e.className||'').slice(0,100)})))}));
  const opt=page.getByText('Optimization',{exact:true});
  if(await opt.count()){
    try{await opt.last().click({timeout:12000});await page.waitForTimeout(1200);}catch(e){
      console.log('SR7_OPT_CLICK_ERROR '+String(e.message||e).slice(0,200));
    }
  }
  const optState=await page.evaluate(()=>{
    const text=document.body.innerText||'';
    const names=['SR7 Data Load Method','Smart Loading','Preloading','On Demand Loading','SR7 Feeds Load Method'];
    const excerpts=[];
    for(const term of names){let i=-1,n=0;while((i=text.toLowerCase().indexOf(term.toLowerCase(),i+1))>=0&&n++<6){
      excerpts.push({term,context:text.slice(Math.max(0,i-100),i+220)})}}
    const selects=[...document.querySelectorAll('select,[role="combobox"],[role="listbox"],input[type="radio"]')].slice(0,90).map(el=>({
      tag:el.tagName,id:el.id||null,role:el.getAttribute('role'),aria:el.getAttribute('aria-label'),
      value:(el.value||'').slice(0,150),display:getComputedStyle(el).display,
      context:el.parentElement?.textContent?.trim().slice(0,220)||''
    }));
    const controls=[...document.querySelectorAll('label,button,[role="radio"],[role="option"]')]
       .filter(e=>/smart loading|preloading|on demand|data load method/i.test(e.textContent?.trim()||''))
       .slice(0,50).map(e=>({tag:e.tagName,text:e.textContent?.trim().slice(0,130),
         selected:e.getAttribute('aria-selected'),checked:e.getAttribute('aria-checked'),
         cls:String(e.className||'').slice(0,160),outer:e.outerHTML.slice(0,350)}));
    return {path:location.pathname+location.search,excerpts:excerpts.slice(0,30),selects,controls};
  });
  console.log('SR7_SELECTED_LOADING '+JSON.stringify(optState).slice(0,26000));
  const urls=[
   '/wp-admin/admin.php?page=revslider',
   '/wp-admin/admin.php?page=revslider&view=global_settings',
   '/wp-admin/admin.php?page=revslider&view=global_settings&tab=optimization'
  ];
  for(const path of urls){
    const resp=await page.goto(site+path,{waitUntil:'domcontentloaded',timeout:75000});
    await page.waitForTimeout(2600);
    const summary=await page.evaluate(()=>{
      const text=document.body.innerText||'';
      const terms=['Smart Loading','smart loading','Data Load Method','Data Load','On Demand','Optimization','Preloading','Load Method','SmartLoad','loadmethod','moduleLoading','sr7'];
      const snippets=[];
      for(const needle of terms){let pos=-1,n=0;while((pos=text.toLowerCase().indexOf(needle.toLowerCase(),pos+1))>=0 && n++<3){snippets.push({term:needle,near:text.slice(Math.max(0,pos-130),pos+260)});}}
      const relevantInputs=[...document.querySelectorAll('input,select,[role="switch"],[role="radio"]')].filter(x=>/load|smart|preload|optimization|sr7/i.test((x.name||'')+' '+(x.id||'')+' '+(x.getAttribute('aria-label')||'')+' '+(x.outerHTML||'').slice(0,350))).slice(0,35)
       .map(x=>({name:x.name||null,id:x.id||null,type:x.type||null,value:x.type==='password'?'[redacted]':(x.value||'').slice(0,90),checked:!!x.checked,aria:x.getAttribute('aria-label')||null}));
      const scriptMatches=[...document.querySelectorAll('script')].filter(x=>/smart.?load|data.?load.?method|on.?demand|preloading|sliderrevolution.*optimization/i.test(x.textContent||'')).slice(0,6).map(x=>{
        const s=x.textContent||''; const low=s.toLowerCase(); let pos=low.search(/smart.?load|data.?load.?method|on.?demand|preloading|optimization/);return {src:x.src||'',length:s.length,near:pos>=0?s.slice(Math.max(0,pos-130),pos+240).replace(/(?:nonce|secret|token|password|auth)[^,}\n]{0,150}/gi,'[redacted]'):''};
      });
      return {title:document.title,path:location.pathname+location.search,bodyStart:text.slice(0,350),
       snippets:snippets.slice(0,28),inputMatches:relevantInputs,scriptMatches,
       hasSettings:!!document.querySelector('#rs-dashboard, #revslider-global-settings, #rs-builder, #rs-global-settings'),
       htmlLen:document.documentElement.outerHTML.length};
    });
    console.log('SR7_ADMIN '+JSON.stringify({requested:path,http:resp.status(),...summary}).slice(0,18000));
  }
 }
 const publicPage=await browser.newPage();
 const observed=[];
 publicPage.on('response',r=>{if(/\/wp-json\/sliderrevolution\/sliders\//.test(r.url()))observed.push({path:new URL(r.url()).pathname,status:r.status(),time:Date.now()});});
 const response=await publicPage.goto(site+'/',{waitUntil:'domcontentloaded',timeout:80000});
 await publicPage.waitForTimeout(3800);
 const runtime=await publicPage.evaluate(()=>({
  sr7Modules:[...document.querySelectorAll('sr7-module')].map(x=>({id:x.id,attr:[...x.attributes].map(a=>a.name).filter(a=>/load|cache|lazy|data/i.test(a))})),
  sr7DataScripts:[...document.querySelectorAll('script')].filter(x=>/SR7_1_1|sr7-loader/i.test(x.textContent||'')).length
 }));
 console.log('SR7_FRONT '+JSON.stringify({http:response.status(),runtime,apiCalls:observed}));
}finally{await browser.close()}
})().catch(e=>{console.error('SR7_AUDIT_ERROR '+String(e.message||e));process.exitCode=1});
