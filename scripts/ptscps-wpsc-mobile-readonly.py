#!/usr/bin/env python3
"""Read-only, redacted audit of WP Super Cache mobile cache selection on PTSCPS."""
import os, ftplib, re, hashlib, json
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html"
u=os.environ["FTP_SERVER"]
u=urlsplit(u if "://" in u else "//"+u)
ftp=ftplib.FTP_TLS(timeout=28);ftp.connect(u.hostname,u.port or 21,timeout=28)
ftp.auth();ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);ftp.prot_p();ftp.set_pasv(True)
files={
 "config": ROOT+"/wp-content/wp-cache-config.php",
 "advanced-cache":ROOT+"/wp-content/advanced-cache.php",
 "phase1":ROOT+"/wp-content/plugins/wp-super-cache/wp-cache-phase1.php",
 "phase2":ROOT+"/wp-content/plugins/wp-super-cache/wp-cache-phase2.php",
 "wp-cache-main":ROOT+"/wp-content/plugins/wp-super-cache/wp-cache.php",
 "htaccess":ROOT+"/.htaccess",
}
def fetch(path):
 data=bytearray()
 def read(chunk):
  if len(data)+len(chunk)>1100000:raise RuntimeError("Unexpectedly large file")
  data.extend(chunk)
 ftp.retrbinary("RETR "+path,read)
 return bytes(data)
try:
 for name,path in files.items():
  try:blob=fetch(path)
  except Exception as e:
   print("CACHE_SOURCE_MISSING "+json.dumps({"name":name,"type":type(e).__name__}),flush=True);continue
  body=blob.decode("utf-8","replace")
  output={"name":name,"size":len(blob),"sha":hashlib.sha256(blob).hexdigest()[:18]}
  if name=="config":
   safe={}
   for key in ["wp_cache_mobile_enabled","wp_cache_mobile","wp_cache_mobile_browsers","wp_cache_mobile_prefixes","wp_cache_mobile_groups","wp_cache_mod_rewrite","wp_cache_not_logged_in","cache_enabled","wp_super_cache_enabled","wp_cache_jetpack_mobile","wp_super_cache_late_init"]:
    matches=list(re.finditer(r"\$"+re.escape(key)+r"\s*=\s*([^;\r\n]+)",body))
    if matches:
     value=matches[-1].group(1).strip()
     if key in ("wp_cache_mobile_browsers","wp_cache_mobile_prefixes","wp_cache_mobile_groups"):
      safe[key]={"present":True,"length":len(value),"mentions_android":"Android" in value,"mentions_iphone":"iPhone" in value,"mentions_mobile":"Mobile" in value}
     else:safe[key]=value[:24] if re.fullmatch(r"[0-9'\"\s.\-a-zA-Z_]+",value) else "complex"
    else:safe[key]="NOT_SET"
   output["settings"]=safe
  if name in ("phase1","phase2","wp-cache-main"):
   needles=["wp_cache_check_mobile","wp_cache_mobile_enabled","wp_cache_mobile_group","wp_cache_mobile","cache_mobile","mobile device support","mobile support","cache_mobiles","mobile_enabled"]
   bits=[]
   for n,line in enumerate(body.splitlines(),1):
    if any(k in line.lower() for k in needles):
     # Redact potential unexpected literals; do not print full PHP values.
     bits.append({"line":n,"excerpt":line[:190].strip()})
   output["mobileLogic"]=bits[:48]
  if name=="advanced-cache":
   output["hasWPSC"]="wp-super-cache" in body or "wp_cache" in body
  if name=="htaccess":
   output["rewriteMobileUA"]=bool(re.search(r"HTTP_USER_AGENT|mobile",body,re.I))
   output["supercacheRules"]=body.count("WPSuperCache")+body.count("BEGIN WPSuperCache")
   output["rewritePath"]=bool(re.search(r"supercache/.+index",body,re.I))
  print("CACHE_SOURCE "+json.dumps(output,ensure_ascii=False),flush=True)
 for suffix in ("/wp-content/cache/supercache/ptscps.com.vn","/wp-content/cache/supercache/ptscps.com.vn/c"):
  try:
   names=ftp.nlst(ROOT+suffix)
   print("CACHE_DIRECTORY "+json.dumps({"path":suffix,"items":[s.rsplit("/",1)[-1] for s in names[:25]],"count":len(names)}),flush=True)
  except Exception as e:
   print("CACHE_DIRECTORY_ERROR "+json.dumps({"path":suffix,"type":type(e).__name__}),flush=True)
finally:
 try:ftp.quit()
 except:ftp.close()
