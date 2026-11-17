#!/usr/bin/env python3
"""Read-only origin markup probe for SR7 first slide and possible server-side poster insertion points."""
import urllib.request,re,json,html,urllib.parse
root="https://ptscps.com.vn/"
uas={"desktop":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36","mobile":"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36"}
for kind,ua in uas.items():
 for bypass in [False,True]:
  url=root+("?ptscps_poster_inspect="+kind if bypass else "")
  with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":ua,"Accept":"text/html","Accept-Encoding":"identity"}),timeout=42) as r:
   text=r.read(4000000).decode("utf-8","replace")
   code=r.status
  allfiles=[]
  for match in re.finditer(r"(?:sr7-module|sr7-slide|sr7-img|ruby-banner\.jpg|banner2\.jpg|banner3\.jpg|SR7_1_1|rev_slider|revslider|sr7-wrap)",text,re.I):
   i=match.start()
   if any(abs(i-x[0])<750 for x in allfiles):continue
   allfiles.append((i,text[max(0,i-950):min(len(text),i+1750)]))
  print("SR7_MARKUP "+json.dumps({
   "kind":kind,"bypass":bypass,"status":code,"bytes":len(text),
   "indicators":{p:len(list(re.finditer(p,text,re.I))) for p in ["ruby-banner.jpg","banner2.jpg","banner3.jpg",r"<sr7-module",r"<sr7-slide",r"<sr7-img",r"<sr7-wrap",r"<rs-module",r"sr7-module"]},
   "samples":[{"offset":i,"content":s[:2500]} for i,s in allfiles[:19]],
   "bodyClass":(re.search(r"<body\b[^>]*>",text,re.I) or [""])[0][:450]
   },ensure_ascii=False),flush=True)
