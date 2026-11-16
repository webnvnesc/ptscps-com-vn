'use strict';
/** Read-only: locate exact page-HTML image markup / widget boundaries and responsive attachment candidates. */
const urls=['https://ptscps.com.vn/','https://ptscps.com.vn/c/hoat-dong-cua-cong-ty'];
const candidates=[
 '/wp-content/uploads/2024/04/2222221z5245174915163_4145568119040ed86e3b35d70f0b52ca-768x289.jpg',
 '/wp-content/uploads/2024/04/333333z5245174082713_4252facd17ae73b1c1d1864970e283b0-768x266.jpg',
 '/wp-content/uploads/2024/04/2222221z5245174915163_4145568119040ed86e3b35d70f0b52ca-1024x385.jpg',
 '/wp-content/uploads/2024/04/333333z5245174082713_4252facd17ae73b1c1d1864970e283b0-1024x354.jpg'
];
async function main(){
 for(const url of urls){
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/154 Mobile Safari/537.36'}});
  const html=await r.text();
  const tags=[...html.matchAll(/<img\b[^>]*>/gi)].map(x=>x[0]);
  const carousel=tags.filter(x=>x.includes('swiper-slide-image'));
  const post=tags.filter(x=>x.includes('wp-post-image'));
  console.log('DOCUMENT',JSON.stringify({url,http:r.status,bytes:html.length,imgTags:tags.length,swiper:carousel.length,post:post.length}));
  for(const [kind,arr] of [['SWIPER',carousel],['POST',post]]){
   for(const tag of [arr[0],arr[1],arr[2],arr[arr.length-1]].filter(Boolean)){
    const at=html.indexOf(tag);
    const prefix=html.slice(Math.max(0,at-600),at);
    const widget=prefix.match(/data-id="([^"]+)"[^>]*data-element_type="widget"[^>]*data-widget_type="([^"]+)"/g);
    console.log(kind,JSON.stringify({tag:tag.slice(0,800),preceding:prefix.slice(-480),nearbyWidgets:widget?.slice(-3)}));
   }
  }
 }
 for(const u of candidates){
  try{const r=await fetch('https://ptscps.com.vn'+u,{method:'HEAD'});console.log('MEDIA',JSON.stringify({url:u,status:r.status,type:r.headers.get('content-type'),bytes:r.headers.get('content-length')}));}
  catch(e){console.log('MEDIA_ERROR',u,String(e).slice(0,160))}
 }
}
main().catch(e=>{console.error('FATAL',String(e.stack||e));process.exitCode=1});
