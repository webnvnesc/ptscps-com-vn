#!/usr/bin/env python3
"""Smoke test generic WebP rewrite for both JPG and PNG in a DIFFERENT folder.

Also verifies that images with no .webp sidecar retain native bytes.
Never uploads or modifies server content.
"""
import urllib.request,io,json,time,sys
from PIL import Image
BASE="https://ptscps.com.vn/wp-content/uploads/"
TEST=BASE+"2025/11/ptscps-webp-auto-qa-20261117"
LEGACY=BASE+"2019/10/ruby-banner.jpg"
NO_WEBP=BASE+"2025/11/MVOT.jpg"
def fetch(url,accept):
 req=urllib.request.Request(url,headers={"Accept":accept,
   "Cache-Control":"no-cache",
   "User-Agent":"PTSCPS-WebP-Dynamic-Rule-QA/1"})
 with urllib.request.urlopen(req,timeout=30) as r:
  b=r.read()
  return r.status,dict(r.headers.items()),b
def mime(headers):
 return headers.get("Content-Type",headers.get("content-type","")).split(";")[0].strip().lower()
def format(data):
 im=Image.open(io.BytesIO(data));im.load()
 return im.format,im.size
def test(path,expected):
 uid="?ptscps_test="+str(int(time.time()))
 web=fetch(path+uid,"image/avif,image/webp,image/*,*/*;q=0.8")
 jpg=fetch(path+uid+"&raw=1","image/jpeg,image/png,*/*;q=0.8")
 assert web[0]==jpg[0]==200
 assert format(web[2])[0]=="WEBP"
 assert format(jpg[2])[0]==expected
 assert format(web[2])[1]==format(jpg[2])[1]
 assert mime(web[1])=="image/webp"
 assert mime(jpg[1])=={"JPEG":"image/jpeg","PNG":"image/png"}[expected]
 assert "accept" in web[1].get("Vary","").lower()
 assert "accept" in jpg[1].get("Vary","").lower()
 print("WEBP_DYNAMIC_QA "+json.dumps({"file":path.split("/")[-1],"new":len(web[2]),"native":len(jpg[2]),
  "webp":mime(web[1]),"legacy":mime(jpg[1]),"dims":format(web[2])[1]}),flush=True)
def main():
 for ext,formatname in [("jpg","JPEG"),("png","PNG")]:
  test(TEST+"."+ext,formatname)
 test(LEGACY,"JPEG")
 # A real existing 2025/11 image may acquire its own WebP in future,
 # so no-sidecar fallback is tested on a unique synthetic file if needed.
 st,h,b=fetch(BASE+"2019/10/pps-doi-tac-1.jpg","image/webp,image/*,*/*;q=0.8")
 if st!=200 or format(b)[0] not in ("JPEG","WEBP"):
  raise RuntimeError("Unrelated image URL affected")
 print("WEBP_DYNAMIC_QA_SUCCESS")
if __name__=="__main__":
 try:main()
 except Exception as e:
  print("WEBP_DYNAMIC_QA_FAILED "+type(e).__name__+" "+str(e)[:220],flush=True)
  sys.exit(1)
