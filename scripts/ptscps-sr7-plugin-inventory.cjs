'use strict';
// Read-only WordPress plugin inventory, to safely determine minimal allowed
// plugin stack for the public Slider Revolution REST endpoint.
const {chromium}=require('playwright');
const SITE='https://ptscps.com.vn';
(async()=>{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD){
   throw new Error('Missing WordPress admin secrets');
 }
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 try{
   const page=await browser.newPage();
   await page.goto(SITE+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:65000});
   if(await page.locator('#user_login').count()){
     await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
     await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
     await Promise.allSettled([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:40000}),page.locator('#wp-submit').click()]);
   }
   const res=await page.goto(SITE+'/wp-admin/plugins.php',{waitUntil:'domcontentloaded',timeout:75000});
   await page.waitForTimeout(1600);
   const state=await page.evaluate(()=>{
     const rows=[...document.querySelectorAll('tr[data-plugin]')];
     return {
       url:location.pathname+location.search,
       title:document.title,
       rows:rows.map(x=>({
         slug:x.getAttribute('data-plugin'),
         active:x.classList.contains('active'),
         title:x.querySelector('.plugin-title strong')?.textContent?.trim()?.slice(0,100)||''
       })),
       hasWpAdminBar:!!document.querySelector('#wpadminbar'),
       total:rows.length
     };
   });
   if(!new URL(page.url()).pathname.startsWith('/wp-admin/')||res.status()!==200){
     throw new Error('Plugin inventory page inaccessible');
   }
   console.log('SR7_PLUGIN_INVENTORY '+JSON.stringify(state));
 }finally{await browser.close()}
})().catch(e=>{console.error('SR7_PLUGIN_INVENTORY_ERROR '+String(e.message||e));process.exitCode=1});
