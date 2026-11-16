'use strict';
/* Production anonymous accessibility+SEO follow-up audit.
   Scoped checks, no page edits. Lighthouse score is NOT inferred from axe results. */
const {chromium}=require('playwright');
const {AxeBuilder}=require('@axe-core/playwright');
const fs=require('node:fs');
const pages=['/','/dich-vu','/lien-he','/c/hoat-dong-cua-cong-ty'];
const mobile=process.env.QA_MOBILE==='1';
const prefix=mobile?'mobile':'desktop';
const out='a11y-seo-postdeploy-'+prefix;
fs.mkdirSync(out,{recursive:true});
async function run(browser,path){
 const context=await browser.newContext({
  viewport:{width:mobile?412:1440,height:mobile?823:900},
  isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1
 });
 const page=await context.newPage();
 const errs=[];page.on('pageerror',e=>errs.push(e.message.slice(0,190)));
 const uri='https://ptscps.com.vn'+path+(path.includes('?')?'&':'?')+'ptscps_a11y_seo_qa='+Date.now()+'_'+Math.floor(Math.random()*100000);
 const response=await page.goto(uri,{waitUntil:'domcontentloaded',timeout:75000});
 await page.waitForTimeout(1000);
 const state=await page.evaluate(()=>{
  const first=[...document.querySelectorAll('meta[name="description" i]')];
  const imageBoxes=[...document.querySelectorAll('.elementor-image-box-wrapper')];
  const missing=imageBoxes.filter(w=>{
   const a=w.querySelector('figure.elementor-image-box-img a');
   if(!a)return false;
   const label=(a.getAttribute('aria-label')||'').trim();
   const imgAlt=(a.querySelector('img')?.getAttribute('alt')||'').trim();
   return !label&&!imgAlt&&!a.textContent.trim();
  });
  const emptyHeading=[...document.querySelectorAll('.stream-item-top .sc-widget > h3.widget-title')].filter(e=>!e.textContent.trim()&&!e.hidden);
  const badPostRoles=[...document.querySelectorAll('article.elementor-post[role="listitem"]')];
  const tinyArrow=[...document.querySelectorAll('a')].filter(e=>e.textContent.trim()==='»');
  const h1=[...document.querySelectorAll('h1')].map(e=>e.textContent.trim());
  const styles=getComputedStyle(document.querySelector('.elementor-element-caa4541 > .elementor-widget-container')||document.body);
  return {metaCount:first.length,metaDescription:first[0]?.getAttribute('content')||'',
   missingImageLinks:missing.length,boxes:imageBoxes.length,emptyHeadings:emptyHeading.length,
   badPostRoles:badPostRoles.length,tinyArrows:tinyArrow.length,h1,hasAdminBar:!!document.querySelector('#wpadminbar'),
   homeContrastBackground:styles.backgroundColor};
 });
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']).analyze();
 const violations=axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,
  samples:v.nodes.slice(0,3).map(n=>({target:n.target,html:n.html.slice(0,200)}))}));
 const bad=['color-contrast','link-name','aria-allowed-role','heading-order','target-size','empty-heading','page-has-heading-one'];
 const unresolved=violations.filter(v=>bad.includes(v.id));
 const failures=[];
 if(response.status()!==200)failures.push('http-not-200');
 if(state.metaCount!==1||state.metaDescription.length<50)failures.push('missing-or-duplicate-meta-description');
 if(path==='/'&&state.missingImageLinks>0)failures.push('unnamed-image-box-links');
 if(path==='/'&&state.badPostRoles>0)failures.push('invalid-article-roles');
 if(path==='/'&&state.tinyArrows>0)failures.push('tiny-duplicate-arrow');
 if((path==='/lien-he'||path==='/dich-vu')&&!state.h1.some(x=>x))failures.push('missing-h1');
 if(state.emptyHeadings>0)failures.push('visible-empty-heading');
 if(unresolved.length)failures.push('axe:'+unresolved.map(v=>v.id).join(','));
 const result={path,mobile,http:response.status(),state,violations,jsErrors:errs,failures};
 fs.writeFileSync(out+'/'+(path==='/'?'home':path.replace(/[^a-z0-9]+/ig,'_'))+'.json',JSON.stringify(result,null,2));
 console.log('QA_A11Y_SEO '+JSON.stringify(result).slice(0,12000));
 await context.close();
 return result;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 const results=[];
 try{for(const path of pages)results.push(await run(browser,path))}
 finally{await browser.close()}
 const issues=results.filter(r=>r.failures.length>0);
 console.log('QA_SUMMARY '+JSON.stringify({mobile,total:results.length,passed:results.length-issues.length,
  issues:issues.map(r=>({path:r.path,failures:r.failures}))}));
 if(issues.length)process.exitCode=1;
})().catch(e=>{console.error('QA_FATAL '+String(e.stack||e));process.exitCode=1});