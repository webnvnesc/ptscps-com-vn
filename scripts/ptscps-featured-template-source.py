#!/usr/bin/env python3
"""Find the exact Jannah PHP path producing the invisible home-page featured figure.

Read-only source search over allowlisted theme directories via FTPS.
Does not inspect configuration, credentials, WP database or uploads.
Outputs only concise source snippets around matching theme template hooks.
"""
import ftplib, os, re, json, sys
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html"
BASE=ROOT+"/wp-content/themes"
THEMES=["jannah","jannah-child"]
PATTERNS=[
 r"single-featured-image",r"featured-area",r"hide_featured",
 r"show_featured",r"featured_image",r"post_thumbnail_html",
 r"the_post_thumbnail",r"get_the_post_thumbnail",r"tie_post_featured",
 r"post-featured",r"featured-image",r"render_featured",
 r"page\.php",
]
REGEX=re.compile("|".join(PATTERNS),re.I)
HOST=os.environ.get("FTP_SERVER","")
USER=os.environ.get("FTP_USERNAME","")
PASS=os.environ.get("FTP_PASSWORD","")
if not (HOST and USER and PASS):sys.exit("Missing FTPS credentials")
URL=urlsplit(HOST if "://" in HOST else "//"+HOST)
ftp=ftplib.FTP_TLS(timeout=28)
ftp.connect(URL.hostname,URL.port or 21,timeout=28)
ftp.auth();ftp.login(USER,PASS);ftp.prot_p();ftp.set_pasv(True)
MAX_DIRS=75
MAX_FILES=480
files=0;dirs=0
def lsdir(path):
 try:
  rows=list(ftp.mlsd(path))
  return [(n,meta.get("type","")) for n,meta in rows if re.fullmatch(r"[A-Za-z0-9_.-]+",n or "")]
 except ftplib.all_errors:
  ftp.cwd(path)
  return [(n.rsplit("/",1)[-1], "unknown") for n in ftp.nlst()]
def read(path):
 global files
 try:
  ftp.voidcmd("TYPE I")
  size=ftp.size(path)
  if size and size>400000:return None
  chunks=[];total=0
  def add(block):
   nonlocal total
   total+=len(block)
   if total>450000:raise ValueError("Too large")
   chunks.append(block)
  ftp.retrbinary("RETR "+path,add)
  files+=1
  return b"".join(chunks).decode("utf-8","replace")
 except (ftplib.all_errors,ValueError):
  return None
try:
 ftp.cwd(ROOT)
 names={x.rstrip("/").split("/")[-1] for x in ftp.nlst()}
 if not {"wp-content","wp-admin","wp-includes","index.php"}.issubset(names):
  sys.exit("Invalid WordPress root")
 queue=[(BASE+"/"+theme,theme,0) for theme in THEMES]
 while queue and dirs<MAX_DIRS and files<MAX_FILES:
  path,short,depth=queue.pop(0);dirs+=1
  try:entries=lsdir(path)
  except ftplib.all_errors as e:
   print("LIST_FAIL",short,type(e).__name__,flush=True);continue
  if depth<=1:print("DIR",json.dumps({"path":short,"files":[n for n,t in entries if n.endswith(".php")][:70],"subdirs":[n for n,t in entries if not n.endswith(".php")][:70]}),flush=True)
  for name,typ in entries:
   if name.startswith(".") or name in ("vendor","node_modules","assets","languages","css","js","fonts","images","img","lib","admin","includes/admin","docs"):continue
   if typ=="dir" or (typ=="unknown" and not "." in name):
    if depth<5:queue.append((path+"/"+name,short+"/"+name,depth+1))
    continue
   if not name.endswith(".php"):continue
   src=read(path+"/"+name)
   if src is None:continue
   lines=src.splitlines()
   matched=[i for i,line in enumerate(lines) if REGEX.search(line)]
   if not matched:continue
   print("FILE_HITS",json.dumps({"path":short+"/"+name,"matches":len(matched),"totalLines":len(lines)}),flush=True)
   for i in matched[:26]:
    low=max(0,i-4);high=min(len(lines),i+5)
    excerpt=[]
    for k in range(low,high):
     s=lines[k].strip()
     if not s:continue
     if re.search(r"password|auth_key|nonce_key|secret|token|api.?key",s,re.I):continue
     excerpt.append({"line":k+1,"text":s[:240]})
    print("MATCH",json.dumps({"file":short+"/"+name,"line":i+1,"excerpt":excerpt},ensure_ascii=False),flush=True)
 print("SOURCE_SEARCH_SUMMARY",json.dumps({"dirs":dirs,"files":files,"remainingDirs":len(queue)}),flush=True)
finally:
 try:ftp.quit()
 except Exception:ftp.close()
