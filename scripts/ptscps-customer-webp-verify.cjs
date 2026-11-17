'use strict';
/** Validate exactly the FTPS-created WebP sidecars, fallback and slider display. */
const fs=require('node:fs');
const state=JSON.parse(fs.readFileSync('customer-webp-created.json','utf8'));
const audit=JSON.parse(fs.readFileSync('customer-carousel-webp-readonly.json','utf8'));
if(state.marker!=='PTSCPS_CUSTOMER_WEBP_20261117_v1')throw Error('Wrong migration state');
const saved=state.created;
if(!saved.length)throw Error('No beneficial WebP produced: do not report migration as done');
const desktop=audit.full.find(x=>x.device==='desktop');
const mobile=audit.full.find(x=>x.device==='mobile');
if(!desktop||!mobile||desktop.http!==200||mobile.http!==200
  ||desktop.count<19||mobile.count<19||desktop.errors.length||mobile.errors.length)
 throw Error('Carousel rendering/JS regression');
let checked=0,totalSource=0,totalWebp=0;
for(const row of saved){
 const url='https://ptscps.com.vn/wp-content/uploads/'+row.file;
 for(const device of [mobile,desktop]){
  const target=device.items.find(i=>i.url===url);
  if(!target)throw Error('Missing customer logo from slider '+row.file);
  if(!target.webPActive||target.webp?.mime!=='image/webp'||
    !/image\/(jpeg|png)/.test(target.fallback?.mime||'')) {
    throw Error('WebP/fallback HTTP failure '+row.file+' '+device.device);
  }
  if(target.webp.bytes!==row.webpBytes || target.fallback.bytes!==row.sourceBytes)
    throw Error('Byte mismatch detected '+row.file+' '+device.device);
  checked++;
 }
 totalSource+=row.sourceBytes;
 totalWebp+=row.webpBytes;
}
const out={created:saved.length,verifiedHTTP:checked,totalSource,totalWebp,
  reductionPct:Math.round((1-totalWebp/totalSource)*1000)/10,
  stillOriginals:desktop.items.filter(x=>!x.webPActive).length,
  devices:[mobile,desktop].map(x=>({device:x.device,logos:x.count,unique:x.unique}))};
console.log('CUSTOMER_WEBP_LIVE_QA_SUCCESS '+JSON.stringify(out));
