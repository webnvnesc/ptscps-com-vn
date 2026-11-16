#!/usr/bin/env python3
"""PTSCPS header logo and alternative logo provenance (read-only).

Checks responsive images, WordPress public media metadata, HTML references,
CSS background/image references on representative pages, and available FTP
uploads derivatives. No file contents or credentials are published.
"""
import ftplib
import html
from html.parser import HTMLParser
import json
import os
from pathlib import PurePosixPath
import re
import socket
import urllib.error
import urllib.parse
import urllib.request

HOST="https://ptscps.com.vn"
BASE="/domains/ptscps.com.vn/public_html"
LOGOS=["/wp-content/uploads/2024/08/logo-2024.jpg",
       "/wp-content/uploads/2025/09/Untitled-1.jpg"]
PAGES=["/","/dich-vu","/lien-he","/c/hoat-dong-cua-cong-ty",
       "/thu-vien-pps","/hseq","/tin-tuc","/thu-ngo.htm"]
class Tags(HTMLParser):
 def __init__(self):super().__init__();self.images=[];self.styles=[]
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if tag=="img":self.images.append(d)
  if tag=="link" and "stylesheet" in (d.get("rel") or ""):
   self.styles.append(d)
def request(path,method="GET",timeout=23):
 url=HOST+path if path.startswith("/") else path
 req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; PTSCPS-LogoAudit/1.0)","Accept-Encoding":"identity"},method=method)
 try:
  with urllib.request.urlopen(req,timeout=timeout) as resp:
   data=b"" if method=="HEAD" else resp.read(1250000)
   return resp.status,dict(resp.headers.items()),data,resp.url
 except urllib.error.HTTPError as e:
  return e.code,dict(e.headers.items()),b"",e.url

def maybe_asset(path):
 status,headers,body,final=request(path,"HEAD")
 print("IMAGE_HEAD "+json.dumps({"path":path,"status":status,
  "type":headers.get("Content-Type"),"size":headers.get("Content-Length"),
  "cache":headers.get("Cache-Control"),"redirected":final!=HOST+path},ensure_ascii=False),flush=True)
 return status==200

def inspect_page(path):
 try:
  status,headers,data,final=request(path)
  text=data.decode("utf-8","replace")
  p=Tags();p.feed(text)
  logos=[{k:d.get(k) for k in ("src","srcset","sizes","width","height","alt","class","loading","fetchpriority","style")}
         for d in p.images if "tie-logo-img" in (d.get("class") or "") or any(x in (d.get("src") or "") for x in ("logo-2024","Untitled-1"))]
  result={"path":path,"http":status,"htmlBytes":len(data),
   "mentions_2024":text.lower().count("logo-2024"),
   "mentions_2025":text.lower().count("untitled-1"),
   "imageTags":logos[:6],
   "cssRefs":[d.get("href") for d in p.styles if any(x in (d.get("href") or "") for x in ("child","jannah"))][:10]}
  print("PAGE "+json.dumps(result,ensure_ascii=False),flush=True)
 except Exception as e:
  print("PAGE_ERROR "+json.dumps({"path":path,"type":type(e).__name__,"error":str(e)[:200]}),flush=True)
def query_media(term):
 qs=urllib.parse.urlencode({"search":term,"per_page":"25"})
 path="/wp-json/wp/v2/media?"+qs
 try:
  status,headers,data,final=request(path)
  if status!=200:raise RuntimeError("WP REST response "+str(status))
  items=json.loads(data)
  compact=[]
  for x in items:
   compact.append({"id":x.get("id"),"slug":x.get("slug"),
    "source_url":x.get("source_url"),"status":x.get("status"),
    "date":x.get("date"),"post":x.get("post"),
    "media_details":{"width":x.get("media_details",{}).get("width"),
     "height":x.get("media_details",{}).get("height"),
     "sizes":{k:{"width":v.get("width"),"height":v.get("height"),"url":v.get("source_url"),"file":v.get("file")}
      for k,v in x.get("media_details",{}).get("sizes",{}).items()}}})
  print("REST_MEDIA "+json.dumps({"term":term,"count":len(items),"items":compact},ensure_ascii=False),flush=True)
 except Exception as e:
  print("REST_ERROR "+json.dumps({"term":term,"type":type(e).__name__,"error":str(e)[:200]}),flush=True)
def ftp_upload_listing():
 host=os.environ.get("FTP_SERVER")
 user=os.environ.get("FTP_USERNAME")
 secret=os.environ.get("FTP_PASSWORD")
 if not host or not user or not secret:
  print("FTP_SKIPPED_NO_CREDS",flush=True);return
 loc=urllib.parse.urlsplit(host if "://" in host else "//"+host)
 ftp=ftplib.FTP_TLS(timeout=25)
 try:
  socket.getaddrinfo(loc.hostname,loc.port or 21,type=socket.SOCK_STREAM)
  ftp.connect(loc.hostname,loc.port or 21,timeout=25)
  ftp.auth();ftp.login(user,secret);ftp.prot_p();ftp.set_pasv(True)
  ftp.cwd(BASE)
  names={PurePosixPath(x).name for x in ftp.nlst()}
  if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(names):
   raise RuntimeError("Unexpected WordPress root")
  for yearmonth,pattern in (("2024/08",r"logo-2024"),("2025/09",r"Untitled-1")):
   target=BASE+"/wp-content/uploads/"+yearmonth
   ftp.cwd(target)
   names=[PurePosixPath(x).name for x in ftp.nlst()]
   matches=[x for x in names if re.search(pattern,x,re.I)]
   sizes={}
   for name in matches[:35]:
    try:sizes[name]=ftp.size(name)
    except ftplib.all_errors:pass
   print("FTP_LOGO_FILES "+json.dumps({"dir":yearmonth,"matches":matches[:70],"bytes":sizes},ensure_ascii=False),flush=True)
 except Exception as e:
  print("FTP_ERROR "+json.dumps({"type":type(e).__name__,"error":str(e)[:180]}),flush=True)
 finally:
  try:ftp.quit()
  except Exception:ftp.close()
def main():
 for path in PAGES:inspect_page(path)
 for s in ("logo-2024","Untitled-1"):query_media(s)
 for path in LOGOS:maybe_asset(path)
 for base in ("logo-2024","Untitled-1"):
  yearmonth="2024/08" if base=="logo-2024" else "2025/09"
  for suffix in ("-300x100","-600x201","-768x257","-1024x343","-1536x515"):
   path=f"/wp-content/uploads/{yearmonth}/{base}{suffix}.jpg"
   # Probe only small fixed set: 5 asset checks per image.
   maybe_asset(path)
 ftp_upload_listing()
if __name__=="__main__":main()
