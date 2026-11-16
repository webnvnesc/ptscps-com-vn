#!/usr/bin/env python3
"""Read-only PTSCPS llms.txt preflight: canonical public URLs and existing root file.

No FTP writes or changes to site. Display only non-secret metadata.
"""
import ftplib
import html
from html.parser import HTMLParser
import json
import os
import re
import urllib.error
import urllib.request
from urllib.parse import urlsplit

HOST="https://ptscps.com.vn"
PATHS=[
"/","/llms.txt","/robots.txt","/sitemap","/sitemap_index.xml","/wp-sitemap.xml",
"/thu-ngo.htm","/dich-vu","/dich-vu/van-hanh-va-bao-duong-fpso-fso-mopu",
"/dich-vu/cung-ung-nhan-luc-ky-thuat-van-hanh-va-bao-duong",
"/dich-vu/dich-vu-thiet-ke-mua-sam-gia-cong-che-tao%e2%80%8b",
"/dich-vu/dich-vu-sua-chua-bao-duong-cac-thiet-bi-va-cong-trinh-cong-nghiep",
"/hseq","/hseq/chinh-sach-skatmtcl","/co-dong",
"/c/co-dong/quan-he-co-dong","/c/co-dong/bao-cao-tai-chinh",
"/tin-tuc","/c/hoat-dong-cua-cong-ty","/c/tin-tuc/hoat-dong-cua-cong-ty",
"/c/tin-tuc/dau-khi-trong-nuoc-va-khu-vuc","/thu-vien-pps",
"/thu-moi-chao-gia","/c/tuyen-dung","/lien-he"
]
class Page(HTMLParser):
 def __init__(self):
  super().__init__()
  self.tag=""
  self.title=[]
  self.h1=[]
  self.h1_in=False
  self.title_in=False
  self.canonical=None
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  self.title_in=tag=="title"
  if tag=="h1": self.h1_in=True
  if tag=="link" and (attrs.get("rel") or "").lower()=="canonical":
   self.canonical=attrs.get("href")
 def handle_endtag(self,tag):
  if tag=="title": self.title_in=False
  if tag=="h1": self.h1_in=False
 def handle_data(self,data):
  if self.title_in:self.title.append(data)
  if self.h1_in:self.h1.append(data)
def inspect(path):
 req=urllib.request.Request(HOST+path,headers={
  "User-Agent":"Mozilla/5.0 (compatible; PTSCPS-llms-preflight/1.0)",
  "Accept":"text/html,text/plain,application/xml;q=0.8,*/*;q=0.5"})
 try:
  with urllib.request.urlopen(req,timeout=25) as resp:
   body=resp.read(400000).decode("utf-8","replace")
   status=resp.status
   final=resp.url
   ctype=resp.headers.get("Content-Type","")
 except urllib.error.HTTPError as e:
  status=e.code
  final=e.url
  ctype=e.headers.get("Content-Type","")
  body=e.read(6000).decode("utf-8","replace")
 p=Page()
 if "html" in ctype:p.feed(body)
 title=html.unescape(" ".join(p.title).strip())
 h1=html.unescape(" ".join(p.h1).strip())
 notfound=bool(re.search(r"(Không tìm thấy trang|# Không tìm thấy|Page not found|404 Not Found)",body,re.I))
 result={"path":path,"status":status,"finalPath":urlsplit(final).path,
 "contentType":ctype.split(";")[0],"title":title[:120],
 "h1":h1[:140],"notFoundText":notfound,"canonical":p.canonical}
 print("PAGE "+json.dumps(result,ensure_ascii=False),flush=True)
 return result
results=[]
for path in PATHS:
 try:results.append(inspect(path))
 except Exception as e:
  print("PAGE_ERROR "+json.dumps({"path":path,"error":type(e).__name__,"message":str(e)[:180]},ensure_ascii=False),flush=True)
root="/domains/ptscps.com.vn/public_html"
h=os.environ.get("FTP_SERVER","")
u=os.environ.get("FTP_USERNAME","")
pwd=os.environ.get("FTP_PASSWORD","")
if all((h,u,pwd)):
 ftp=ftplib.FTP_TLS(timeout=25)
 try:
  loc=urlsplit(h if "://" in h else "//"+h)
  ftp.connect(loc.hostname,loc.port or 21,timeout=25)
  ftp.auth();ftp.login(u,pwd);ftp.prot_p();ftp.set_pasv(True)
  ftp.cwd(root)
  files={x.rstrip("/").rsplit("/",1)[-1] for x in ftp.nlst()}
  assert {"wp-content","index.php","wp-admin","wp-includes"}.issubset(files)
  print("ROOT_LLMS "+json.dumps({"exists":"llms.txt" in files},ensure_ascii=False),flush=True)
 finally:
  try:ftp.quit()
  except Exception:ftp.close()
else:print("ROOT_LLMS "+json.dumps({"unverified":"missing FTPS credentials"}),flush=True)
print("PREFLIGHT_SUMMARY "+json.dumps({"checked":len(results),
 "good":[x["path"] for x in results if x["status"]==200 and not x["notFoundText"]],
 "bad":[x["path"] for x in results if x["status"]>=400 or x["notFoundText"]]},ensure_ascii=False),flush=True)
