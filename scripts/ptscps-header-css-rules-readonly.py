#!/usr/bin/env python3
"""Read-only live stylesheet analysis for the intermittent Jannah header problem."""
import urllib.request,urllib.parse,json,hashlib,re,time
root="https://ptscps.com.vn/wp-content/"
files=[
"themes/jannah/assets/css/base.min.css?ver=7.6.3",
"themes/jannah/assets/css/style.min.css?ver=7.6.3",
"themes/jannah/assets/css/widgets.min.css?ver=7.6.3",
"themes/jannah/assets/css/helpers.min.css?ver=7.6.3",
"themes/jannah-child/style.css?ver=7.1.3",
]
pats=["tie-col-md-4","tie-col-md-8","logo-container","logo-row","image-logo","tie-logo-img","\\.tie-col-md-"]
for cycle in range(1,4):
 for item in files:
  url=root+item
  req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) Chrome/154.0.0.0 Safari/537.36","Cache-Control":"no-cache","Accept":"text/css,*/*"})
  try:
   with urllib.request.urlopen(req,timeout=22) as resp:
    body=resp.read(1500000)
    headers=dict(resp.headers.items())
    status=resp.status
   s=body.decode("utf-8","replace")
   clips={}
   for pat in pats:
    hits=list(re.finditer(pat,s,re.I))
    clips[pat]={"count":len(hits),"excerpts":[s[max(0,x.start()-100):x.end()+170] for x in hits[:3]]}
   print("CSS_FILE "+json.dumps({"cycle":cycle,"name":item,"status":status,"bytes":len(body),
        "sha":hashlib.sha256(body).hexdigest()[:16],"type":headers.get("Content-Type"),
        "content_encoding":headers.get("Content-Encoding"),"matches":clips},ensure_ascii=False),flush=True)
  except Exception as e:
   print("CSS_FILE_ERROR "+json.dumps({"cycle":cycle,"name":item,"error":str(e)[:250]}),flush=True)
 time.sleep(0.8)
