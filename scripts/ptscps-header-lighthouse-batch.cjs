'use strict';
const {execFileSync}=require('child_process');
const fs=require('fs');
const lighthouse=require.resolve('lighthouse/cli/index.js');
const browser=require('playwright').chromium.executablePath();
const paths=['/thu-ngo.htm','/dich-vu','/hseq','/c/co-dong','/c/co-dong/quan-he-co-dong','/c/co-dong/bao-cao-tai-chinh','/tin-tuc','/c/tin-tuc/hoat-dong-cua-cong-ty','/c/tin-tuc/dau-khi-trong-nuoc-va-khu-vuc','/thu-vien-pps','/thu-moi-chao-gia','/tuyen-dung','/lien-he','/e'];
const device=process.env.LH_DEVICE||'desktop',shard=Number(process.env.LH_SHARD||0),shards=Number(process.env.LH_SHARDS||4);
const chosen=paths.filter((_,i)=>i%shards===shard),dir='ptscps-lighthouse-'+device+'-'+shard;
fs.mkdirSync(dir,{recursive:true});
const summary=[];
for(const path of chosen){
 const label=path.slice(1).replace(/[^a-z0-9]+/ig,'-')||'home',file=dir+'/'+label+'.json',url='https://ptscps.com.vn'+path;
 try{
  const args=[lighthouse,url,'--only-categories=accessibility,seo','--chrome-path='+browser,'--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage','--max-wait-for-load=60000','--output=json','--output-path='+file,'--quiet'];
  if(device==='desktop')args.push('--preset=desktop');
  execFileSync(process.execPath,args,{timeout:180000,stdio:'pipe',env:{...process.env,CHROME_PATH:browser}});
  const j=JSON.parse(fs.readFileSync(file));
  const categories={};
  for(const key of ['accessibility','seo']){
   const c=j.categories[key];
   const failed=c.auditRefs.filter(r=>r.weight>0).map(r=>({ref:r,a:j.audits[r.id]})).filter(({a})=>a?.score!==null&&a?.score<1).map(({ref,a})=>({id:ref.id,title:a.title,score:a.score,
    items:a.details?.items?.slice(0,7)?.map(it=>({node:it.node?.snippet,selector:it.node?.selector,description:it.description,href:it.href,source:it.source?.snippet}))}));
   categories[key]={score:Math.round(c.score*100),failed};
  }
  const result={device,path,status:'ok',finalUrl:j.finalUrl,categories};
  summary.push(result);console.log('LH_PAGE_RESULT '+JSON.stringify(result).slice(0,18000));
 }catch(e){summary.push({device,path,status:'error',error:String(e.message||e).slice(0,320)});console.log('LH_PAGE_ERROR '+JSON.stringify(summary[summary.length-1]));}
}
fs.writeFileSync(dir+'/summary.json',JSON.stringify(summary,null,2));
console.log('LH_SHARD_SUMMARY '+JSON.stringify({device,shard,total:summary.length,success:summary.filter(x=>x.status==='ok').length,
 scores:summary.map(x=>({path:x.path,a11y:x.categories?.accessibility?.score,seo:x.categories?.seo?.score}))}));
if(summary.some(x=>x.status!=='ok'))process.exitCode=1;
