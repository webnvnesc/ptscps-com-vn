#!/usr/bin/env python3
"""Prepare local Exo .woff2 assets and original Google @font-face rules, verifying all bytes.

CSS and WOFF2 are publicly licensed Google Fonts resources. Never overwrite
a different preexisting file, and never modify WordPress theme/plugin files.
"""
import os,io,re,hashlib,ftplib,urllib.request,json,uuid,sys
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html/wp-content/uploads"
DEST=ROOT+"/ptscps-exo-fonts"
FONT_URL="https://fonts.googleapis.com/css2?family=Exo:ital,wght@0,400;0,500;0,700;1,400;1,700&display=swap"
AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36"
def get_http(url,limit):
 req=urllib.request.Request(url,headers={"User-Agent":AGENT,"Accept":"text/css,*/*"})
 with urllib.request.urlopen(req,timeout=36) as r:
  body=r.read(limit+1)
  if len(body)>limit:raise RuntimeError("Exceeds size limit")
  return body
css=get_http(FONT_URL,100000).decode("utf-8","strict")
if css.count("@font-face")!=15 or "@import" in css or "font-family: 'Exo'" not in css:
 raise RuntimeError("Unrecognized Google Exo CSS")
urls=list(dict.fromkeys(re.findall(r'url\((https://fonts\.gstatic\.com/s/exo/[^)]+\.woff2)\)',css)))
if len(urls)<3 or len(urls)>30:raise RuntimeError("Unexpected font asset count")
assets={}
for url in urls:
 b=get_http(url,120000)
 if not b.startswith(b"wOF2"):raise RuntimeError("Not a WOFF2 font: "+url)
 filename=hashlib.sha256(b).hexdigest()[:20]+".woff2"
 assets[filename]=b
 css=css.replace(url,filename)
if "https://" in css or "http://" in css:raise RuntimeError("External URL remained in CSS")
if len(css)>20000:raise RuntimeError("Unexpected CSS length")
cssdata=css.encode("utf-8")
host=os.environ["FTP_SERVER"];u=urlsplit(host if "://" in host else "//"+host)
f=ftplib.FTP_TLS(timeout=28);f.connect(u.hostname,u.port or 21,timeout=28)
f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p();f.set_pasv(True)
def read(p):
 data=bytearray();f.retrbinary("RETR "+p,data.extend);return bytes(data)
def verify_parent():
 f.cwd(ROOT)
 try:f.cwd(DEST)
 except ftplib.error_perm:
  f.mkd(DEST)
 f.cwd(DEST)
def send(name,body):
 full=DEST+"/"+name
 try:old=read(full)
 except ftplib.error_perm as e:
  if not str(e).startswith("550"):raise
  old=None
 if old is not None:
  if old!=body:raise RuntimeError("Conflict: asset already exists with different bytes "+name)
  print("EXO_LOCAL_EXISTING "+name+" "+str(len(body)),flush=True)
  return
 tmp=DEST+"/."+name+"."+uuid.uuid4().hex[:10]+".staged"
 f.storbinary("STOR "+tmp,io.BytesIO(body))
 if read(tmp)!=body:raise RuntimeError("Staged asset mismatch "+name)
 f.rename(tmp,full)
 if read(full)!=body:raise RuntimeError("Final asset mismatch "+name)
 print("EXO_LOCAL_UPLOAD "+name+" "+str(len(body)),flush=True)
try:
 verify_parent()
 for name,b in assets.items():send(name,b)
 send("exo-direct-v1.css",cssdata)
 print("EXO_LOCAL_READY "+json.dumps({"fonts":len(assets),"cssBytes":len(cssdata),"totalFontBytes":sum(len(v) for v in assets.values()),"sha":hashlib.sha256(cssdata).hexdigest()[:20]}),flush=True)
finally:
 try:f.quit()
 except Exception:f.close()
