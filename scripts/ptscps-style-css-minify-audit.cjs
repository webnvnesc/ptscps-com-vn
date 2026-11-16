'use strict';
const {gzipSync,brotliCompressSync}=require('node:zlib');
const {transform}=require('lightningcss');
const postcss=require('postcss');
const cssnano=require('cssnano');
const fs=require('node:fs');
const BASE='https://ptscps.com.vn/wp-content/themes/jannah/assets/css/style.min.css?ver=7.6.3';
const gzip=x=>gzipSync(Buffer.from(x),{level:6}).length;
const brotli=x=>brotliCompressSync(Buffer.from(x)).length;
async function run(){
 const res=await fetch(BASE,{headers:{'user-agent':'PTSCPS CSS optimization audit/1.0'}});
 if(!res.ok)throw Error('CSS fetch HTTP '+res.status);
 const css=await res.text();
 fs.mkdirSync('style-analysis',{recursive:true});
 const root=postcss.parse(css,{from:BASE});
 const rules={count:0,atRules:{},declarations:0,important:0};
 root.walkRules(()=>rules.count++);
 root.walkAtRules(a=>{rules.atRules[a.name]=(rules.atRules[a.name]||0)+1});
 root.walkDecls(d=>{rules.declarations++;if(d.important)rules.important++});
 const variants=[{name:'original',css}];
 try {variants.push({name:'lightning',css:transform({filename:'style.min.css',code:Buffer.from(css),minify:true,errorRecovery:true}).code.toString()})}catch(e){console.log('OPTIMIZER_REJECT '+JSON.stringify({name:'lightning',reason:String(e.message).slice(0,300)}))}
 try {variants.push({name:'cssnano_conservative',css:(await postcss([cssnano({preset:['default',{mergeRules:false,mergeLonghand:false,discardUnused:false,reduceIdents:false,normalizeUrl:false,normalizeString:false,minifySelectors:false,calc:false,convertValues:false}]})]).process(css,{from:undefined,map:false})).css})}catch(e){console.log('OPTIMIZER_REJECT '+JSON.stringify({name:'cssnano_conservative',reason:String(e.message).slice(0,300)}))}
 try {variants.push({name:'cssnano_default',css:(await postcss([cssnano({preset:'default'})]).process(css,{from:undefined,map:false})).css})}catch(e){console.log('OPTIMIZER_REJECT '+JSON.stringify({name:'cssnano_default',reason:String(e.message).slice(0,300)}))}
 const results=[];
 for(const v of variants){
   const data={name:v.name,bytes:Buffer.byteLength(v.css),gzip:gzip(v.css),brotli:brotli(v.css),
     gzipSave:gzip(css)-gzip(v.css),gzipRatio:Math.round((1-gzip(v.css)/gzip(css))*1000)/10};
   results.push(data);
   console.log('VARIANT '+JSON.stringify(data));
 }
 console.log('CSS_STRUCTURE '+JSON.stringify({bytes:Buffer.byteLength(css),rules}));
 fs.writeFileSync('style-analysis/sizes.json',JSON.stringify({results,rules},null,2));
 // Save only SHA-256 hashes and metrics, never expose full theme source via artifacts.
 const crypto=require('node:crypto');
 console.log('HASHES '+JSON.stringify(variants.map(v=>({name:v.name,sha256:crypto.createHash('sha256').update(v.css).digest('hex')}))));
}
run().catch(e=>{console.error('FATAL '+String(e.stack||e));process.exitCode=1});