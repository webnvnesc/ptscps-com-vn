#!/usr/bin/env python3
import urllib.request,re,json
root="https://ptscps.com.vn/"
uas={"desktop":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36","mobile":"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36"}
for device,ua in uas.items():
 with urllib.request.urlopen(urllib.request.Request(root,headers={"User-Agent":ua}),timeout=45) as r:html=r.read(500000).decode("utf-8","replace")
 results={}
 for key,p in {"module":"<sr7-module","first-slide":"<sr7-slide","ruby":"ruby-banner.jpg","image-list":"<image_lists","lazy":"<sr7-prl","wrap":"<sr7-wrap"}.items():
  m=re.search(re.escape(p),html,re.I)
  if m:
   i=m.start()
   # emit targeted snippet near the known markup (module and ruby adjacent)
   results[key]={"offset":i,"excerpt":html[max(0,i-850):i+2550][:3350]}
 for key,p in {"slide-tags":r'<sr7-slide\b[^>]*>',"first-module-tag":r'<sr7-module\b[^>]*>',"all-image-list-items":r'<img\b[^>]*data-src=["\'][^"\']*ruby-banner\.jpg[^>]*>'}.items():
  results[key]=re.findall(p,html,re.I)[:6]
 print("SR7_EXACT "+json.dumps({"device":device,"data":results},ensure_ascii=False),flush=True)
