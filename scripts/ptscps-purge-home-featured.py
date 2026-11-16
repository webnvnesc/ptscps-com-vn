#!/usr/bin/env python3
"""Purge only PTSCPS anonymous homepage HTML cache after Jannah page option changes."""
import ftplib,os,re,sys
from urllib.parse import urlsplit
root="/domains/ptscps.com.vn/public_html"
target=root+"/wp-content/cache/supercache/ptscps.com.vn"
allowed=re.compile(r"^(?:index-https\.html(?:\.gz)?|index\.html(?:\.gz)?|(?:meta-)?wp-cache-[0-9a-f]{32}\.php)$")
h=os.environ.get("FTP_SERVER","");u=os.environ.get("FTP_USERNAME","");p=os.environ.get("FTP_PASSWORD","")
if not all((h,u,p)):sys.exit("FAIL: credentials missing")
parsed=urlsplit(h if "://" in h else "//"+h)
f=ftplib.FTP_TLS(timeout=25)
try:
 f.connect(parsed.hostname,parsed.port or 21,timeout=25)
 f.auth();f.login(u,p);f.prot_p();f.set_pasv(True)
 f.cwd(root)
 names={x.rstrip("/").split("/")[-1] for x in f.nlst()}
 if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(names):
  sys.exit("FAIL: root not WordPress")
 try:rows=list(f.mlsd(target))
 except ftplib.error_perm:
  print("HOME_CACHE_ABSENT");sys.exit(0)
 files=[name for name,facts in rows if facts.get("type")=="file" and allowed.fullmatch(name)]
 if len(files)>40:sys.exit("FAIL: unexpected homepage cache file count")
 f.cwd(target)
 for name in files:f.delete(name)
 print("HOME_CACHE_PURGED",len(files),flush=True)
finally:
 try:f.quit()
 except Exception:f.close()
