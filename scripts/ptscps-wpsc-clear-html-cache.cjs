'use strict';
/** Trigger only WP Super Cache's explicitly named "Delete Cache" control.
 * Does not change options, modify posts, access FTP or change other caches.
 */
const {chromium}=require('playwright');
const site='https://ptscps.com.vn';
(async()=>{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
   throw new Error('Missing WordPress administrator secrets');
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 try{
  const page=await browser.newPage();
  await page.goto(site+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:65000});
  if(await page.locator('#user_login').count()){
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
   await Promise.allSettled([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:45000}),page.locator('#wp-submit').click()]);
  }
  const response=await page.goto(site+'/wp-admin/options-general.php?page=wpsupercache',{waitUntil:'domcontentloaded',timeout:65000});
  const state=await page.evaluate(()=>{
   const html=document.body.innerText||'';
   const controls=[...document.querySelectorAll('button,input[type=submit],a')].filter(x=>{
    const t=(x.textContent||x.value||x.getAttribute('aria-label')||'').trim();
    return /cache|bộ nhớ đệm|xóa bộ nhớ/i.test(t);
   }).slice(0,90).map(x=>{
    const f=x.closest('form');return {
     tag:x.tagName,text:(x.textContent||x.value||'').trim().slice(0,115),
     name:x.getAttribute('name'),id:x.id||null,
     href:x.tagName==='A'?x.getAttribute('href')?.slice(0,150):null,
     formAction:f?.getAttribute('action')?.slice(0,150)||null,
     class:String(x.className||'').slice(0,120),
     visible:!!x.getClientRects().length};
   });
   return {path:location.pathname+location.search,title:document.title,
    hasAdminBar:!!document.querySelector('#wpadminbar'),
    canSeeSuperCache:/WP Super Cache/i.test(html),
    buttons:controls};
  });
  console.log('WPSC_ADMIN_INSPECTION '+JSON.stringify({http:response.status(),...state}).slice(0,17000));
  if(response.status()!==200||!state.hasAdminBar||!state.canSeeSuperCache){
   throw new Error('WP Super Cache admin interface not accessible; refuse blind purge');
  }
  const matches=state.buttons.filter(b=>b.visible&&b.tag!=='A'&&
   /^(Delete Cache|Clear Cache|Xóa Cache|Xóa bộ nhớ đệm)$/i.test(b.text));
  if(!matches.length)throw new Error('No unambiguous cache-clear button; no action performed');
  // WP Super Cache commonly shows the same cache-clear action twice. Both are
  // safe, but only click one on the Super Cache admin page.
  const target=matches[0];
  const btn=page.locator('button,input[type="submit"]').filter({hasText:/^Delete Cache$|^Clear Cache$|^Xóa Cache$|^Xóa bộ nhớ đệm$/i});
  let candidate=page.locator('input[type="submit"]');
  if(target.id)candidate=page.locator('[id="'+target.id+'"]');
  else if(target.name)candidate=page.locator('input[name="'+target.name+'"],button[name="'+target.name+'"]');
  else candidate=page.getByRole('button',{name:target.text,exact:true});
  console.log('WPSC_CHOSEN_CONTROL '+JSON.stringify(target));
  if(await candidate.count()!==1){
   // Multiple identical controls are okay, use the first only.
   if(!await candidate.count())throw new Error('Could not locate cache clear button');
   candidate=candidate.first();
  }
  await Promise.allSettled([
   page.waitForNavigation({waitUntil:'domcontentloaded',timeout:25000}),
   candidate.click({timeout:14000})
  ]);
  await page.waitForTimeout(1700);
  const result=await page.evaluate(()=>({
   path:location.pathname+location.search,
   body:(document.body.innerText||'').slice(-2500),
   title:document.title
  }));
  const clean=result.body.replace(/(?:password|secret|nonce|token)\s*[:=]\s*\S+/gi,'[redacted]');
  console.log('WPSC_PURGE_AFTER '+JSON.stringify({path:result.path,title:result.title,
   confirmsPurge:/cache (?:was )?(?:cleared|deleted|emptied)|deleted (?:all )?(?:the )?cache|cache cleared|cache deleted|cache successfully deleted|cache is now empty|đã xóa/i.test(clean),
   excerpt:clean.slice(-900)}).slice(0,1400));
  console.log('WPSC_PURGE_CLICKED');
 }finally{await browser.close()}
})().catch(e=>{console.error('WPSC_PURGE_ERROR '+String(e.stack||e).slice(0,1250));process.exitCode=1});
