#!/usr/bin/env python3
import urllib.request,re,uuid,hashlib,json
base='https://ptscps.com.vn/'
paths=['','?ptscps_image_lazy_audit='+uuid.uuid4().hex,
 '?_wpnonce_test_'+uuid.uuid4().hex+'=1','?preview_id=5&preview_nonce=none&preview=true']
for path in paths:
 try:
  req=urllib.request.Request(base+path,headers={'User-Agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/154 Mobile Safari/537.36','Cache-Control':'no-cache'})
  with urllib.request.urlopen(req,timeout=50) as f:
   raw=f.read()
   html=raw.decode('utf-8','replace')
   tags=re.findall(r'<img\b[^>]*>',html,re.I)
   logos=[x for x in tags if 'swiper-slide-image' in x]
   headers={k.lower():v for k,v in f.headers.items() if k.lower() in ['cache-control','x-cache','age','vary','server','x-litespeed-cache','cf-cache-status']}
   print('URL',json.dumps({'path':path,'status':f.status,'hash':hashlib.sha256(raw).hexdigest()[:16],
    'bytes':len(raw),'headers':headers,'logoCount':len(logos),'lazy':sum('loading="lazy"' in x for x in logos),
    'responsive':sum('768x289' in x or '1024x354' in x for x in logos),
    'cachefooter':html[-650:],'preload':logos[0][:350] if logos else None}))
 except Exception as e:print('ERROR',path,type(e).__name__,str(e)[:190])
