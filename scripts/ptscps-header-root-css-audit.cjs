'use strict';
const {chromium}=require('playwright');
const path=require('node:path');
const fs=require('node:fs');
const out='ptscps-logo-root-audit';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']});
 try{
  for (const width of [1707,1440,412]){
   const context=await browser.newContext({viewport:{width,height:950},deviceScaleFactor:1,isMobile:width===412,hasTouch:width===412,serviceWorkers:'block'});
   const page=await context.newPage();
   const bad=[];
   page.on('requestfailed',r=>bad.push({url:r.url(),error:r.failure()?.errorText}));
   const resp=await page.goto('https://ptscps.com.vn/',{waitUntil:'domcontentloaded',timeout:75000});
   await page.waitForTimeout(1200);
   const capture=async()=>{
    return page.evaluate(()=>{
      const qs=s=>document.querySelector(s);
      const targets={logo:qs('#theme-header img.tie-logo-img-default'),column:qs('#theme-header .logo-container'),logoNode:qs('#theme-header #logo'),picture:qs('#theme-header picture.tie-logo-picture'),header:qs('#theme-header'),row:qs('#theme-header .logo-row')};
      const props=['width','height','max-width','max-height','float','flex','display','position','box-sizing','padding-left','padding-right','margin-left','margin-right'];
      const compute=e=>{if(!e)return null;const s=getComputedStyle(e),r=e.getBoundingClientRect(),obj={className:e.className,id:e.id,rect:[r.x,r.y,r.width,r.height].map(Math.round)};for(const p of props)obj[p]=s.getPropertyValue(p);return obj;};
      const rules={},errs=[];
      for (const key of ['logo','column','logoNode']){
       let matches=[];
       for(const sheet of document.styleSheets){
        try{
         const name=sheet.href?sheet.href.split('?')[0].split('/').slice(-3).join('/'):(sheet.ownerNode?.id||'inline');
         const walk=(arr)=>{
          for(const rule of arr){
           if(rule.type===4 && !matchMedia(rule.conditionText).matches)continue;
           if(rule.selectorText&&rule.style){
            let ok=false;try{ok=targets[key]?.matches(rule.selectorText);}catch{}
            if(ok){
             const p={};for(const k of props){const v=rule.style.getPropertyValue(k);if(v)p[k]=v+(rule.style.getPropertyPriority(k)?' !important':'');}
             if(Object.keys(p).length)matches.push({source:name,selector:rule.selectorText,styles:p});
            }
           }
           if(rule.cssRules)walk(rule.cssRules);
          }
         };walk(sheet.cssRules);
        }catch(e){errs.push((sheet.href||'inline')+' '+String(e.message).slice(0,100));}
       }
       rules[key]=matches.slice(-50);
      }
      return {
       viewport:innerWidth,bodyClass:document.body.className,headerOuter:targets.header?.outerHTML.slice(0,450),
       headerClass:targets.header?.className,
       metrics:Object.fromEntries(Object.entries(targets).map(([k,e])=>[k,compute(e)])),
       guard:!!document.querySelector('#ptscps-header-logo-safety-css'),
       cssSheets:[...document.styleSheets].map(s=>({href:s.href||s.ownerNode?.id,disabled:s.disabled,ruleCount:(()=>{try{return s.cssRules.length}catch{return -1}})()})).filter(s=>/jannah|base\.min\.css|logo|tie-theme-child/i.test(s.href||'')),
       rules,errors:errs.slice(0,12)
      };
    });
   };
   const guarded=await capture();
   await page.screenshot({path:path.join(out,'logo-'+width+'-with-guard.png'),fullPage:false});
   await page.evaluate(()=>document.querySelector('#ptscps-header-logo-safety-css')?.remove());
   await page.waitForTimeout(350);
   const without=await capture();
   await page.screenshot({path:path.join(out,'logo-'+width+'-without-guard.png'),fullPage:false});
   console.log('ROOT_LOGO_'+width+' '+JSON.stringify({status:resp.status(),failures:bad,with:guarded,without}).slice(0,30000));
   fs.writeFileSync(path.join(out,'logo-'+width+'.json'),JSON.stringify({status:resp.status(),failures:bad,with:guarded,without},null,2));
   await context.close();
  }
 }finally{await browser.close();}
})().catch(err=>{console.error('ROOT_AUDIT_FATAL '+String(err.stack||err));process.exitCode=1});
