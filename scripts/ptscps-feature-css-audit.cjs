'use strict';
// Inspect potential feature-only Jannah CSS reductions; this script is read-only.
const postcss=require('postcss');
const selectorParser=require('postcss-selector-parser');
const crypto=require('node:crypto');
const {gzipSync,brotliCompressSync}=require('node:zlib');
const fs=require('node:fs');
const URL='https://ptscps.com.vn/wp-content/themes/jannah/assets/css/style.min.css?ver=7.6.3';
const OUTPUT='feature-css-audit';
fs.mkdirSync(OUTPUT,{recursive:true});
const gzip=x=>gzipSync(Buffer.from(x),{level:6}).length;
const brotli=x=>brotliCompressSync(Buffer.from(x)).length;
const CLASSIFIERS={
 jannah_sliders: classes=>classes.some(c=>/^tie-slider(?:-\d+)?$/.test(c)||/^tie-slider-/.test(c)),
 dark_skin:classes=>classes.includes('dark-skin'),
 alternate_block_heads:classes=>classes.some(c=>/^block-head-(?:1|2|3|4|5|6|8|9|10|11)$/.test(c))&&!classes.includes('block-head-7')
};
function eligible(rule,key){
 if(rule.type!=='rule'||!rule.selector)return false;
 let every=true,count=0;
 try{
  selectorParser(ast=>ast.each(s=>{
   const classes=[];let bad=false;
   s.walkClasses(n=>classes.push(n.value));
   // Guard against selectors that match broadly via :is/:not and could have
   // a matching feature class only in one branch.
   s.walkPseudos(p=>{if(/^:(?:is|where|not|has|matches)$/.test(p.value))bad=true});
   if(!classes.length||bad||!CLASSIFIERS[key](classes))every=false;
   count++;
  })).processSync(rule.selector);
 }catch(e){return false}
 return count>0&&every;
}
const classify=root=>{
 const record={};
 for(const k of Object.keys(CLASSIFIERS))record[k]=[];
 root.walkRules(rule=>{
  for(const k of Object.keys(CLASSIFIERS)){
   if(eligible(rule,k))record[k].push({offset:rule.source?.start?.offset||0,
      selector:rule.selector||'',bytes:Buffer.byteLength(rule.toString())});
  }
 });
 return record;
};
async function main(){
 const res=await fetch(URL,{headers:{'User-Agent':'PTSCPS-feature-CSS-audit/1.0'}});
 if(!res.ok)throw Error('HTTP '+res.status);
 const css=await res.text();
 const original=postcss.parse(css,{from:URL});
 const groups=classify(original);
 const combos={
  original:[],
  jannah_sliders:['jannah_sliders'],
  dark_skin:['dark_skin'],
  alternate_block_heads:['alternate_block_heads'],
  slider_and_dark:['jannah_sliders','dark_skin'],
  all_three:['jannah_sliders','dark_skin','alternate_block_heads']
 };
 const result={origin:URL,sha256:crypto.createHash('sha256').update(css).digest('hex'),rules:0,
  original:{raw:Buffer.byteLength(css),gzip:gzip(css),brotli:brotli(css)},groups:{},variants:{}};
 original.walkRules(()=>result.rules++);
 for(const [key,rows]of Object.entries(groups)){
  result.groups[key]={rules:rows.length,sourceTextBytes:rows.reduce((s,x)=>s+x.bytes,0),
   exampleSelectors:rows.sort((a,b)=>b.bytes-a.bytes).slice(0,8).map(x=>x.selector.slice(0,170))};
 }
 for(const [name,remove]of Object.entries(combos)){
  const root=postcss.parse(css,{from:URL});
  let count=0;
  if(remove.length){
   root.walkRules(r=>{if(remove.some(key=>eligible(r,key))){r.remove();count++}});
   root.walkAtRules(a=>{
    if(a.nodes&&a.nodes.length===0&&['media','supports','container','layer'].includes(a.name))a.remove()
   });
  }
  const candidate=root.toString();
  const sizes={raw:Buffer.byteLength(candidate),gzip:gzip(candidate),brotli:brotli(candidate),
   savedGzip:result.original.gzip-gzip(candidate),savedBrotli:result.original.brotli-brotli(candidate),
   rulesRemoved:count,hash:crypto.createHash('sha256').update(candidate).digest('hex')};
  result.variants[name]=sizes;
  console.log('VARIANT '+JSON.stringify({name,...sizes}));
 }
 console.log('GROUPS '+JSON.stringify(result.groups));
 fs.writeFileSync(OUTPUT+'/summary.json',JSON.stringify(result,null,2));
}
main().catch(e=>{console.error('FATAL '+e.stack);process.exitCode=1});
