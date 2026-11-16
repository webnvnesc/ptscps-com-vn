'use strict';
const {chromium}=require('playwright');
const {AxeBuilder}=require('@axe-core/playwright');
const fs=require('node:fs');
const paths=[
 '/thu-ngo.htm','/dich-vu','/hseq','/c/co-dong',
 '/c/co-dong/quan-he-co-dong','/c/co-dong/bao-cao-tai-chinh',
 '/tin-tuc','/c/tin-tuc/hoat-dong-cua-cong-ty',
 '/c/tin-tuc/dau-khi-trong-nuoc-va-khu-vuc','/thu-vien-pps',
 '/thu-moi-chao-gia','/tuyen-dung','/lien-he','/e'
];
const badIds=new Set(['link-name','color-contrast','heading-order','landmark-one-main','aria-command-name','page-has-heading-one','aria-required-children','listitem','target-size']);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions','--no-sandbox']});
 const records=[];
 try{
  for(const device of ['desktop','mobile']){
   const mobile=device==='mobile';
   const context=await browser.newContext({
     viewport:mobile?{width:412,height:850}:{width:1440,height:900},
     deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',
     userAgent:mobile?
       'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36':
       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
   });
   for(const path of paths){
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e.message).slice(0,200)));
    let data={device,path,fail:[]};
    try{
     const r=await page.goto('https://ptscps.com.vn'+path,{waitUntil:'domcontentloaded',timeout:70000});
     await page.waitForTimeout(500);
     const info=await page.evaluate(()=>{
      const q=s=>[...document.querySelectorAll(s)];
      return {
       desc:q('meta[name="description" i]').map(e=>e.content),
       main:q('main,[role=main]').length,
       h1:q('h1').map(e=>e.textContent.trim()),
       invalidTel:q('a[href^="http://+84.254.3511.019"]').length,
       validTel:q('a[href="tel:+842543511019"]').length,
       galleryUnlabelled:q('a[data-elementor-open-lightbox]').filter(e=>!e.hasAttribute('aria-label')&&!e.textContent.trim()&&!e.querySelector('img[alt]:not([alt=""])')).length,
       postUnlabelled:q('article.elementor-post a.elementor-post__thumbnail__link').filter(e=>!e.hasAttribute('aria-label')&&!e.textContent.trim()&&!e.querySelector('img[alt]:not([alt=""])')).length,
       oldH3:q('article.elementor-post h3.elementor-post__title').length,
       role:document.body.classList.contains('is-mobile')?'mobile':document.body.classList.contains('is-desktop')?'desktop':'unknown',
       title:document.title,
       missingPage:q('.page-title').some(x=>x.textContent.trim()==='Không tìm thấy')
      };
     });
     const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']).analyze();
     const violations=axe.violations.map(v=>({id:v.id,nodes:v.nodes.length,targets:v.nodes.slice(0,3).map(n=>n.target)}));
     const scoring=violations.filter(v=>badIds.has(v.id));
     const fail=[];
     if(r.status()!==200)fail.push('HTTP '+r.status());
     if(info.desc.length!==1||info.desc[0].length<45)fail.push('Meta description count or length');
     if(info.role!==device)fail.push('Wrong cache device');
     if(!info.h1.some(x=>x))fail.push('Missing H1');
     if(path==='/lien-he'&&(info.invalidTel>0||info.validTel===0))fail.push('Wrong tel href');
     if(['/tuyen-dung','/thu-moi-chao-gia'].includes(path)&&(info.postUnlabelled||info.oldH3))fail.push('Unnamed post links or H3');
     if(['/hseq','/tin-tuc','/dich-vu','/lien-he'].includes(path)&&info.main!==1)fail.push('Missing main landmark');
     if(['/thu-ngo.htm','/thu-vien-pps'].includes(path)&&info.galleryUnlabelled)fail.push('Unnamed gallery');
     if(scoring.length)fail.push('Axe '+scoring.map(x=>x.id).join(','));
     if(errors.length)fail.push('JS error '+errors.join(','));
     data={device,path,http:r.status(),info,violations,fail};
    }catch(e){data.fail=['Exception '+String(e.message||e).slice(0,210)];}
    console.log('HEADER_POST_QA '+JSON.stringify(data).slice(0,10000));
    records.push(data);
    await page.close();
   }
   await context.close();
  }
 }finally{await browser.close()}
 fs.writeFileSync('ptscps-header-after-fix.json',JSON.stringify(records,null,2));
 console.log('HEADER_POST_QA_SUMMARY '+JSON.stringify({total:records.length,passed:records.filter(x=>!x.fail.length).length,
   failures:records.filter(x=>x.fail.length).map(x=>({device:x.device,path:x.path,fail:x.fail}))}));
 if(records.some(x=>x.fail.length))process.exitCode=1;
})().catch(e=>{console.error('HEADER_POST_QA_FATAL '+e.stack);process.exitCode=1});
