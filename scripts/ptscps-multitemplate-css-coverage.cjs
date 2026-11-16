'use strict';
// PTSCPS theme CSS selector audit: read-only on public pages; never modify PHP, CSS, WP content or admin.
const {chromium}=require('playwright');
const postcss=require('postcss');
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const BASE='https://ptscps.com.vn';
const WIDTH=Number(process.env.TEST_WIDTH||412);
const OUT='selector-audit-'+WIDTH;
const TARGET='/wp-content/themes/jannah/assets/css/style.min.css';
const EXTRA=['/wp-content/themes/jannah/assets/css/base.min.css',
 '/wp-content/themes/jannah/assets/css/widgets.min.css',
 '/wp-content/themes/jannah/assets/css/helpers.min.css'];
const CASES=[
 {kind:'homepage',url:'/'},
 {kind:'service-list',url:'/dich-vu'},
 {kind:'service-detail',url:'/dich-vu/van-hanh-va-bao-duong-fpso-fso-mopu'},
 {kind:'news-landing',url:'/tin-tuc'},
 {kind:'news-category',url:'/c/hoat-dong-cua-cong-ty'},
 {kind:'article-detail',url:'/cong-ty-pps-hanh-trinh-tri-an-nam-2026-tai-tp-ho-chi-minh.htm'},
 {kind:'contact',url:'/lien-he'},
 {kind:'introduction',url:'/thu-ngo.htm'}
];
const ensureDir=p=>fs.mkdirSync(p,{recursive:true});
function choose(entries,token){
 const matches=entries.filter(c=>c.url&&c.url.includes(token));
 if(!matches.length)return null;
 return matches.reduce((a,b)=>a.text.length>=b.text.length?a:b);
}
function mergeRanges(rr){
 const sorted=rr.map(r=>({start:r.start,end:r.end})).filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start)
 .sort((a,b)=>a.start-b.start||a.end-b.end);
 const out=[];
 for(const r of sorted){
  const last=out[out.length-1];
  if(last&&r.start<=last.end)last.end=Math.max(last.end,r.end);
  else out.push({...r});
 }
 return out;
}
function sizes(rr){return mergeRanges(rr).reduce((sum,r)=>sum+r.end-r.start,0)}
function overlaps(begin,end,rr){
 for(const r of rr){if(r.end>begin&&r.start<=end)return true;if(r.start>end)break;}
 return false;
}
function safeLen(input){return String(input??'').slice(0,120)}
function selectorFamily(sel){
 const s=sel.toLowerCase();
 if(/#main-nav|menu-item|main-menu|mobile-menu|navbar|nav-item|tie-main-header|header-layout|#theme-header|\.site-header/.test(s))return 'navigation/header';
 if(/footer|copyright|bottom-bar/.test(s))return 'footer';
 if(/lightbox|ilightbox|modal|overlay|popup|dropdown/.test(s))return 'overlay/dropdowns';
 if(/form|input|textarea|button|search-field|contact/.test(s))return 'forms/buttons';
 if(/post-content|entry-content|\.single-post|article|post-entry|\.post-title/.test(s))return 'article/single';
 if(/mag-box|post-list|\.archive|category|posts-list|blog-list/.test(s))return 'archive/listing';
 if(/sidebar|\.widget|widget-/.test(s))return 'sidebar/widgets';
 if(/\.slider|slide|carousel|\.hero|\.banner/.test(s))return 'slider/carousel';
 if(/\.social|\.share|\.pagination/.test(s))return 'social/pagination';
 return 'other/global';
}
function candidates(rows,filter,n=12){
 return rows.filter(filter).sort((a,b)=>b.length-a.length)
 .slice(0,n).map(x=>({bytes:x.length,selector:safeLen(x.selector),family:x.family,media:safeLen(x.media),initial:x.initial,full:x.full,interaction:x.interaction,types:x.types}));
}
async function doPage(browser,entry){
 const ctx=await browser.newContext({
  viewport:{width:WIDTH,height:WIDTH<650?823:900},
  isMobile:WIDTH<650,hasTouch:WIDTH<650,deviceScaleFactor:WIDTH<650?1.5:1,locale:'vi-VN',
  ...(WIDTH<650?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'}:{})});
 const page=await ctx.newPage();
 const errors=[],responses=[];
 page.on('pageerror',err=>errors.push(String(err.message).slice(0,150)));
 page.on('response',r=>{if(r.url().includes('style.min.css'))responses.push({status:r.status(),url:r.url()})});
 const p={kind:entry.kind,width:WIDTH,asked:entry.url,initial:{},scrolled:{},errors};
 try{
  await page.coverage.startCSSCoverage({resetOnNavigation:false});
  const resp=await page.goto(BASE+entry.url,{waitUntil:'domcontentloaded',timeout:67000});
  if(resp.status()>=400){p.error='HTTP '+resp.status();await page.coverage.stopCSSCoverage();return p;}
  await page.waitForTimeout(450);
  const initialCoverage=await page.coverage.stopCSSCoverage();
  const first=choose(initialCoverage,TARGET);
  if(!first){p.error='Main Jannah CSS absent from first coverage';return p;}
  p.finalUrl=page.url().replace(BASE,'');
  p.http=resp.status();
  const initial=mergeRanges(first.ranges);
  p.hash=crypto.createHash('sha256').update(first.text).digest('hex');
  p.cssLength=first.text.length;
  p.initial={ranges:initial,used:sizes(initial)};
  p.others={};
  for(const token of EXTRA){
   const row=choose(initialCoverage,token);
   if(row)p.others[path.basename(token)]={textLength:row.text.length,initialUsed:sizes(row.ranges)};
  }
  p.dom=await page.evaluate(()=>{
   const nav=performance.getEntriesByType('navigation')[0];
   const fcp=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
   return {title:document.title.slice(0,150),bodyClass:document.body.className.slice(0,300),
    firstPaint:Math.round(fcp?.startTime||0),ttfb:Math.round(nav.responseStart),
    elementorWidgets:document.querySelectorAll('.elementor-widget').length,
    headStylesheets:document.querySelectorAll('link[rel=stylesheet]').length,
    menus:document.querySelectorAll('.menu-item').length,
    pageHeight:document.documentElement.scrollHeight,
    documentWidth:document.documentElement.scrollWidth};
  });
  await page.coverage.startCSSCoverage({resetOnNavigation:false});
  // Exercise visual states without navigating or submitting forms.
  let navState='none';
  try{
   if(WIDTH>800){
    const opener=page.locator('#main-nav .menu-item-has-children > a, .main-menu .menu-item-has-children > a').first();
    if(await opener.count()&&await opener.isVisible()){await opener.hover({timeout:1800});await page.waitForTimeout(200);navState='hovered parent menu'}
   }else{
    const toggle=page.locator('#mobile-menu-icon, .mobile-menu-icon, .mobile-nav-icon, button[aria-label*="menu"], .menu-toggle').first();
    if(await toggle.count()&&await toggle.isVisible()){
     await toggle.click({timeout:1800});await page.waitForTimeout(200);navState='mobile toggle';
    }
   }
  }catch(e){navState='menu unavailable: '+String(e.message).slice(0,45)}
  // Close overlays that could prevent scroll (no form submission, no external navigation).
  try{await page.keyboard.press('Escape')}catch(e){}
  for(let i=1;i<=6;i++){
    await page.evaluate(i=>window.scrollTo({top:Math.round((document.documentElement.scrollHeight-innerHeight)*i/6),behavior:'instant'}),i);
    await page.waitForTimeout(150);
  }
  // Show any conditional hover style on cards; don't follow links.
  try{
   const card=page.locator('.post-item, .mag-box .post, .elementor-image-carousel, .post-card').first();
   if(await card.count()&&await card.isVisible()){await card.hover({timeout:1200});await page.waitForTimeout(150)}
  }catch(e){}
  try{
   const firstInput=page.locator('input[type=text], input[type=email], textarea').first();
   if(await firstInput.count()&&await firstInput.isVisible()){await firstInput.focus({timeout:1000});await page.waitForTimeout(120)}
  }catch(e){}
  const observed=await page.coverage.stopCSSCoverage();
  const after=choose(observed,TARGET);
  const dynamic=after?mergeRanges(after.ranges):[];
  p.scrolled={ranges:dynamic,used:sizes(dynamic),navState,eventsRun:6};
  p.aggregated={ranges:mergeRanges([...initial,...dynamic]),used:sizes([...initial,...dynamic])};
  p.othersFull={};
  for(const token of EXTRA){
   const row=choose(observed,token);
   if(row)p.othersFull[path.basename(token)]={textLength:row.text.length,usedAfter:sizes(row.ranges)};
  }
  p.lastState=await page.evaluate(()=>({scrollY:window.scrollY,pageHeight:document.documentElement.scrollHeight,bodyScrollWidth:document.body.scrollWidth}));
  p.responses=responses;
  p.errors=errors.slice(0,8);
  fs.writeFileSync(OUT+'/case-'+entry.kind+'-'+WIDTH+'.json',JSON.stringify({...p,cssText:undefined},null,2));
  console.log('PAGE '+JSON.stringify({kind:p.kind,url:p.finalUrl,status:p.http,width:WIDTH,
   fcp:p.dom.firstPaint,ttfb:p.dom.ttfb,styleBytes:p.cssLength,initialUsed:p.initial.used,
   usedAfterScroll:p.aggregated.used,change:p.aggregated.used-p.initial.used,
   menuTest:navState,widgets:p.dom.elementorWidgets,bodyClass:p.dom.bodyClass,
   errors:p.errors.length}));
  return {...p,cssText:first.text};
 }catch(e){p.error=String(e.stack||e).slice(0,700);console.log('PAGE_ERROR '+JSON.stringify({kind:p.kind,width:WIDTH,error:p.error}));return p}
 finally{await ctx.close()}
}
async function main(){
 ensureDir(OUT);
 const browser=await chromium.launch({headless:true});
 const results=[];
 try{
  for(const c of CASES)results.push(await doPage(browser,c));
 }finally{await browser.close()}
 const valid=results.filter(x=>x.cssText&&x.aggregated?.ranges?.length);
 if(valid.length<3)throw Error('Insufficient page coverage; only '+valid.length+' usable page templates');
 const hashes=[...new Set(valid.map(x=>x.hash))];
 if(hashes.length!==1)console.log('WARNING CSS HASH MISMATCH: interpret cross-page union cautiously '+JSON.stringify(hashes));
 const text=valid[0].cssText;
 let root;
 try{root=postcss.parse(text,{from:'jannah-style.min.css'})}catch(e){throw Error('CSS AST parse failed: '+e.message)}
 const initialAll=mergeRanges(valid.flatMap(x=>x.initial.ranges));
 const all=mergeRanges(valid.flatMap(x=>x.aggregated.ranges));
 const interactive=mergeRanges(valid.flatMap(x=>x.scrolled.ranges));
 const rules=[];
 root.walkRules(n=>{
  const start=n.source?.start?.offset,end=n.source?.end?.offset;
  if(!Number.isFinite(start)||!Number.isFinite(end))return;
  const family=selectorFamily(n.selector||'');
  const media=[];
  let ancestor=n.parent;
  while(ancestor){if(ancestor.type==='atrule'&&ancestor.name==='media')media.unshift(ancestor.params);ancestor=ancestor.parent;}
  const variants=valid.filter(x=>overlaps(start,end-1,x.aggregated.ranges));
  rules.push({start,end,length:end-start+1,selector:n.selector||'',media:media.join(' && '),family,
   initial:overlaps(start,end-1,initialAll),full:overlaps(start,end-1,all),
   interaction:!overlaps(start,end-1,initialAll)&&overlaps(start,end-1,interactive),
   types:variants.map(v=>v.kind)});
 });
 const family={};
 for(const r of rules){
  const key=r.family;
  if(!family[key])family[key]={rules:0,bytes:0,initialRules:0,allObservedRules:0,notObserved:0,
   onlyAfterAction:0,usedByOtherTemplates:0};
  const f=family[key];f.rules++;f.bytes+=r.length;f.initialRules+=Number(r.initial);
  f.allObservedRules+=Number(r.full);f.notObserved+=Number(!r.full);
  f.onlyAfterAction+=Number(r.interaction);
  if(!valid.find(x=>x.kind==='homepage'&&overlaps(r.start,r.end-1,x.aggregated.ranges))&&r.full)f.usedByOtherTemplates++;
 }
 const initialBytes=sizes(initialAll);
 const usedBytes=sizes(all);
 const report={
  width:WIDTH,source:TARGET,userAgentType:WIDTH<650?'Chrome Android':'default desktop',sourceHash:hashes[0],hashes,sourceBytes:text.length,
  sampleCount:valid.length,totalCases:CASES.length,initialUsed:initialBytes,observedAcrossAll:usedBytes,
  initialUsedPercent:Math.round(initialBytes/text.length*1000)/10,
  observedPercent:Math.round(usedBytes/text.length*1000)/10,
  additionalAfterScroll:usedBytes-initialBytes,totalRules:rules.length,
  initialRuleCount:rules.filter(r=>r.initial).length,
  observedRuleCount:rules.filter(r=>r.full).length,
  beyondInitialRuleCount:rules.filter(r=>r.interaction).length,
  neverObservedCount:rules.filter(r=>!r.full).length,
  family,
  pageTypes:valid.map(x=>({kind:x.kind,url:x.finalUrl,bodyClass:x.dom.bodyClass,
   firstPaint:x.dom.firstPaint,ttfb:x.dom.ttfb,initialUsed:x.initial.used,
   fullUsed:x.aggregated.used,usedIncrement:x.aggregated.used-x.initial.used,
   menuState:x.scrolled.navState,widgets:x.dom.elementorWidgets,errors:x.errors.length})),
  candidates:{
   observedOnlyAfterActivity:candidates(rules,x=>x.interaction),
   observedOutsideHomepage:candidates(rules,x=>x.full&&!valid.find(v=>v.kind==='homepage'&&overlaps(x.start,x.end-1,v.aggregated.ranges))),
   unobservedInSample:candidates(rules,x=>!x.full),
  },
  caveats:['Chrome CSSCoverage identifies observed rule activation, not proof of removal safety',
   'Initial snapshot is near DOMContentLoaded, not an exact measurement of rules used before FCP',
   'Scrolled/hover states are limited; authenticated Elementor editor and conditional widgets not covered',
   'No source stylesheet has been modified or removed']
 };
 fs.writeFileSync(OUT+'/summary-'+WIDTH+'.json',JSON.stringify(report,null,2));
 console.log('SUMMARY '+JSON.stringify({width:WIDTH,sampleCount:valid.length,hashes,
  sourceBytes:report.sourceBytes,initialUsed:report.initialUsed,
  observedAcrossAll:report.observedAcrossAll,usedPercent:report.observedPercent,
  ruleCounts:{all:report.totalRules,initial:report.initialRuleCount,observed:report.observedRuleCount,
    additional:report.beyondInitialRuleCount,notObserved:report.neverObservedCount},
  byFamily:report.family,pageTypes:report.pageTypes,
  samples:report.candidates}));
}
main().catch(e=>{console.error('FATAL '+e.stack);process.exitCode=1});