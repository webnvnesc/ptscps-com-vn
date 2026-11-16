'use strict';
/* Read-only Jannah header intermittency and HTML cache variant audit.
   Keep samples of anonymous and logged-in mobile/desktop, compare raw server
   HTML snippets, WordPress cache footer, computed layout and critical CSS.
   No WordPress writes. */
const {chromium}=require('playwright');
const fs=require('node:fs');
const crypto=require('node:crypto');
const ROOT='https://ptscps.com.vn/';
const DIR='ptscps-header-variants';
fs.mkdirSync(DIR,{recursive:true});
const runs=Number(process.env.HEADER_CYCLES||9);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex').slice(0,14);
const norm=u=>u.replace(/[?#].*$/,'');
const median=a=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:null};
async function main(){
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 const samples=[];
 try{
 const environments=[
  {label:'desktop-anon',width:1440,logged:false},
  {label:'desktop-login',width:1440,logged:true},
  {label:'compact-anon',width:1024,logged:false},
  {label:'mobile-anon',width:412,logged:false}
 ];
 for(const env of environments){
  if(env.logged&&!(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD)){
   console.log('HEADER_SKIP '+JSON.stringify({env:env.label,reason:'WP admin secrets missing'}));continue;
  }
  for(let i=1;i<=runs;i++){
   const context=await browser.newContext({
    viewport:{width:env.width,height:900},deviceScaleFactor:1,
    isMobile:env.width<700,hasTouch:env.width<700,
    ...(env.width<700?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})
   });
   const page=await context.newPage();
   const errors=[],fails=[],css=[];
   page.on('pageerror',e=>errors.push(e.message.slice(0,160)));
   page.on('requestfailed',r=>fails.push({url:r.url().split('?')[0],err:r.failure()?.errorText||''}));
   page.on('response',r=>{
    if(/\.css(?:\?|$)/i.test(r.url())&&(/jannah|elementor|child/i.test(r.url())))
     css.push({url:r.url().split('?')[0],status:r.status()});
   });
   let status=0,body='',headers={},state={},url=ROOT,error=null;
   try{
    if(env.logged){
     await page.goto(ROOT+'wp-login.php',{waitUntil:'domcontentloaded',timeout:60000});
     if(await page.locator('#user_login').count()){
      await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
      await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
      await Promise.allSettled([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:25000}),page.locator('#wp-submit').click()]);
     }
    }
    const response=await page.goto(ROOT,{waitUntil:'domcontentloaded',timeout:85000});
    status=response.status();url=page.url();headers=await response.allHeaders();
    body=await response.text();
    await page.waitForTimeout(2600);
    state=await page.evaluate(()=>{
      const rect=(el)=>{let r=el?.getBoundingClientRect();return r?[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]:null};
      const get=(s)=>document.querySelector(s);
      const logo=get('img.tie-logo-img-default');
      const altLogo=[...document.querySelectorAll('img')].filter(x=>/logo/i.test(x.className||'')).slice(0,8);
      const srch=get('#searchform, form.searchform, #tie-search-form, .search-form, .header-search, .search-input, input[type="search"], input[name="s"]');
      const nav=get('#main-nav, #main-nav-wrap, #main-nav-menu, .main-nav, .main-menu');
      const h=get('#theme-header, header#theme-header, .theme-header');
      const se=srch&&getComputedStyle(srch);
      const ls=logo&&getComputedStyle(logo);
      const hs=h&&getComputedStyle(h);
      const css=[...document.styleSheets].map(s=>({url:s.href,disabled:s.disabled})).filter(s=>s.url);
      return {
       href:location.href,bodyClass:document.body.className,htmlClass:document.documentElement.className,
       wpAdminBar:!!get('#wpadminbar'),lang:document.documentElement.lang,
       logo:{src:logo?.currentSrc||logo?.src||null,rect:rect(logo),style:ls?{display:ls.display,maxWidth:ls.maxWidth,width:ls.width,maxHeight:ls.maxHeight,visibility:ls.visibility}:null},
       otherLogos:altLogo.map(x=>({cls:x.className,src:x.currentSrc||x.src,rect:rect(x)})),
       search:{found:!!srch,rect:rect(srch),display:se?.display,visibility:se?.visibility,opacity:se?.opacity,outer:srch?.outerHTML.slice(0,350)||''},
       nav:{rect:rect(nav),class:nav?.className},header:{rect:rect(h),style:hs?{display:hs.display}:null},
       stylesheets:css.filter(x=>/jannah|child|elementor/i.test(x.url||'')).map(x=>({url:x.url?.split('?')[0],disabled:x.disabled})).slice(0,40),
       viewport:{innerWidth,screenWidth:screen.width,devicePixelRatio},
       jquery:typeof window.jQuery,
       searchBoxes:[...document.querySelectorAll('input[type="search"],input[name="s"]')].map(x=>({rect:rect(x),display:getComputedStyle(x).display,outer:x.outerHTML.slice(0,140)})).slice(0,8)
      };
    });
   }catch(e){error=String(e.stack||e).slice(0,700)}
   const htmlLogo=(body.match(/<img\b[^>]*tie-logo-img-default[^>]*>/i)||[])[0]||null;
   const htmlSearch=body.includes('searchform')||body.includes('search-form');
   const row={env:env.label,i,width:env.width,status,url,
    htmlHash:hash(body),htmlBytes:Buffer.byteLength(body),
    logoHtmlHash:htmlLogo?hash(htmlLogo):null,logoHTML:htmlLogo?.slice(0,480),
    htmlSearch,cacheMarker:body.includes('Cached page generated by WP-Super-Cache'),
    cacheComment:(body.match(/(?:Cached page generated by WP-Super-Cache|Dynamic page generated by WP-Super-Cache)[^\n<]*/i)||[])[0]||null,
    headers:{cacheControl:headers['cache-control'],vary:headers.vary,age:headers.age,etag:headers.etag},
    state,failed:fails.slice(0,15),errors:errors.slice(0,15),css:css.slice(0,35),error};
   samples.push(row);
   console.log('HEADER_CASE '+JSON.stringify({env:row.env,i,status:row.status,
    hash:row.htmlHash,cache:row.cacheMarker,logoHTML:row.logoHTML,htmlSearch:row.htmlSearch,
    bodyClass:state.bodyClass,logo:state.logo,search:state.search,nav:state.nav,
    cssFailed:row.failed.filter(x=>/\.css(?:$|\?)/.test(x.url)),jsFailed:row.failed.filter(x=>/\.js(?:$|\?)/.test(x.url)),
    pageErrors:row.errors,admin:state.wpAdminBar,error}).slice(0,9500));
   if(i===1||i===runs)await page.screenshot({path:DIR+'/'+env.label+'-'+i+'.png',fullPage:false}).catch(()=>{});
   await context.close();
  }
 }
 }finally{await browser.close()}
 fs.writeFileSync(DIR+'/results.json',JSON.stringify(samples,null,2));
 for(const name of [...new Set(samples.map(s=>s.env))]){
  const rows=samples.filter(x=>x.env===name);
  const summary={env:name,n:rows.length,success:rows.filter(x=>x.status===200).length,
   distinctFullHtml:[...new Set(rows.map(x=>x.htmlHash))].length,
   distinctLogoHtml:[...new Set(rows.map(x=>x.logoHtmlHash))].length,
   logoRects:rows.map(x=>x.state.logo?.rect),
   searchRects:rows.map(x=>x.state.search?.rect),
   searchHtml:rows.map(x=>x.htmlSearch),
   searchPresent:rows.map(x=>x.state.search?.found),
   bodyClasses:[...new Set(rows.map(x=>x.state.bodyClass))],
   cacheMarkers:rows.filter(x=>x.cacheMarker).length,
   cssFailures:rows.flatMap(x=>x.failed.filter(x=>/\.css(?:$|\?)/.test(x.url))),
   jsFailures:rows.flatMap(x=>x.failed.filter(x=>/\.js(?:$|\?)/.test(x.url))),
   error:rows.filter(x=>x.error).map(x=>x.error.slice(0,130))};
  console.log('HEADER_SUMMARY '+JSON.stringify(summary).slice(0,16000));
 }
}
main().catch(e=>{console.error('HEADER_FATAL '+String(e.stack||e));process.exitCode=1});
