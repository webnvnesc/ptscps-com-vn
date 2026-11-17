#!/usr/bin/env python3
"""Inspect Google Fonts response for real Exo font CSS candidates (no production writes)."""
import urllib.request,urllib.parse,json,re
css_urls={
 "css2":"https://fonts.googleapis.com/css2?family=Exo:ital,wght@0,400;0,500;0,700;1,400;1,700&display=swap",
 "legacy":"https://fonts.googleapis.com/css?family=Exo:400,400i,500,700,700i&display=swap",
 "baseline":"https://fonts.googleapis.com/css?family=Exo:regular,italic%7CExo:700,700italic,regular%7CExo:500,regular&subset=latin,latin,latin&display=swap"
}
for name,url in css_urls.items():
 for ua in ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36","Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36"]:
  try:
   req=urllib.request.Request(url,headers={"User-Agent":ua,"Accept":"text/css,*/*"})
   with urllib.request.urlopen(req,timeout=28) as r:
    b=r.read(180000).decode('utf-8','replace');status=r.status;ctype=r.headers.get('Content-Type')
   print("EXO_CSS_FETCH "+json.dumps({"name":name,"device":"mobile" if "Android" in ua else "desktop","status":status,"contentType":ctype,"length":len(b),"faces":b.count("@font-face"),"woff2":len(re.findall(r'\.woff2',b)),"sample":b[:1000],"firstURL":re.findall(r'url\(([^)]+)\)',b)[:2]}),flush=True)
  except Exception as e:
   print("EXO_CSS_ERROR "+json.dumps({"name":name,"error":str(e)[:350]}),flush=True)
