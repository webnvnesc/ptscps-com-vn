'use strict';
/** Read-only public Accessibility + SEO audit, scoped to current user Lighthouse findings. */
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const fs=require('node:fs');
const base='https://ptscps.com.vn';
const pages=['/','/dich-vu','/c/hoat-dong-cua-cong-ty','/lien-he'];
const dir='a11y-seo-baseline';
fs.mkdirSync(dir,{recursive:true});
async function inspect(browser,path) {
 const context=await browser.newContext({viewport:{width:1521,height:900},deviceScaleFactor:1});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message.slice(0,180)));
 const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:75000});
 await page.waitForTimeout(2500);
 const info=await page.evaluate(()=>{
  const el=(sel)=>document.querySelector(sel);
  const anc=(e,n)=>{const a=[];for(let x=e,i=0;x&&i<n;x=x.parentElement,i++)a.push({
   tag:x.localName,cls:String(x.className||'').slice(0,150),id:x.id||null,bg:getComputedStyle(x).backgroundColor
  });return a};
  return {
   title:document.title,lang:document.documentElement.lang,canonical:el('link[rel="canonical"]')?.href||null,
   metaDescription:el('meta[name="description" i]')?.content||null,
   descriptionCount:document.querySelectorAll('meta[name="description" i]').length,
   ogDescription:el('meta[property="og:description"]')?.content||null,
   hasAdminBar:!!el('#wpadminbar'),h1:[...document.querySelectorAll('h1')].map(e=>e.textContent.trim()).slice(0,5),
   headings:[...document.querySelectorAll('h1,h2,h3,h4')].slice(0,25).map(e=>({tag:e.tagName,text:e.textContent.trim().slice(0,70),
    class:e.className,hidden:e.getBoundingClientRect().height===0})),
   imageBoxes:[...document.querySelectorAll('.elementor-image-box-wrapper')].slice(0,22).map(x=>{
    const widget=x.closest('.elementor-widget-image-box');
    const title=x.querySelector('.elementor-image-box-title');
    const anchor=x.querySelector('figure.elementor-image-box-img a');
    const textAnchor=title?.querySelector('a');
    return {id:widget?.getAttribute('data-id')||null,class:widget?.className?.slice(0,160),
     title:title?.textContent?.trim().slice(0,120),tag:title?.tagName,
     anchor:anchor?.outerHTML.slice(0,420)||null,
     titleAnchor:textAnchor?.outerHTML.slice(0,300)||null,
     foreground:textAnchor?getComputedStyle(textAnchor).color:null,
     backgrounds:textAnchor?anc(textAnchor,9).filter(a=>a.bg!=='rgba(0, 0, 0, 0)'&&a.bg!=='transparent'):[]};
   }),
   dates:[...document.querySelectorAll('.elementor-post__meta-data .elementor-post-date')].slice(0,5).map(e=>({
    text:e.textContent.trim(),foreground:getComputedStyle(e).color,background:getComputedStyle(e.parentElement).backgroundColor
   })),
   arrowAnchors:[...document.querySelectorAll('a')].filter(e=>/^[\s»›→]+$/u.test(e.textContent.trim())&&e.textContent.trim().length>0).slice(0,8).map(e=>({
    text:e.textContent.trim(),html:e.outerHTML.slice(0,350),parent:e.parentElement?.outerHTML.slice(0,650),
    rect:(r=>({x:r.x,y:r.y,w:r.width,h:r.height}))(e.getBoundingClientRect())
   })),
   topWidget:[...document.querySelectorAll('div.stream-item-top h3.widget-title')].slice(0,4).map(e=>({
    html:e.outerHTML.slice(0,600),parent:e.parentElement?.outerHTML.slice(0,900)
   }))
  }
 });
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']).analyze();
 const violations=axe.violations.map(v=>({
  id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.length,
  targets:v.nodes.slice(0,18).map(n=>({target:n.target,html:n.html.slice(0,220),summary:n.failureSummary?.slice(0,350)}))
 }));
 const result={path,status:response?.status(),...info,axeViolations:violations,errors};
 const name=path==='/'?'home':path.replace(/\W+/g,'-').replace(/^-|-$/g,'');
 fs.writeFileSync(dir+'/'+name+'.json',JSON.stringify(result,null,2));
 console.log('A11Y_SEO_PAGE '+JSON.stringify({path,status:result.status,title:result.title,description:result.metaDescription,
  descriptionCount:result.descriptionCount,adminBar:result.hasAdminBar,h1:result.h1,
  failures:violations.map(v=>({id:v.id,nodes:v.nodes,targets:v.targets.slice(0,5)})),errors}).slice(0,12500));
 if(path==='/'){
  console.log('HOME_BOXES '+JSON.stringify(info.imageBoxes).slice(0,20000));
  console.log('HOME_ARROWS '+JSON.stringify(info.arrowAnchors).slice(0,6000));
  console.log('HOME_HEADING '+JSON.stringify(info.topWidget).slice(0,4000));
  console.log('HOME_DATES '+JSON.stringify(info.dates).slice(0,4000));
 }
 await context.close();
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{for(const path of pages) await inspect(browser,path)}
 finally{await browser.close()}
})().catch(e=>{console.error('A11Y_SEO_FATAL '+String(e.stack||e));process.exitCode=1});