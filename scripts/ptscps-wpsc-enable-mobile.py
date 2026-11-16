#!/usr/bin/env python3
"""Enable native WP Super Cache mobile-aware cache keys, with reversible exact backup.

Never touch theme, plugins, htaccess, WP options, or cached file directories.
Requires known previously inspected config and changes exactly one assignment.
"""
import ftplib,hashlib,io,os,re,sys,uuid
from pathlib import Path
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html"
PATH=ROOT+"/wp-content/wp-cache-config.php"
EXPECTED_SHA="a5741fe74aa33016fa"
host=os.environ["FTP_SERVER"]
u=urlsplit(host if "://" in host else "//"+host)
f=ftplib.FTP_TLS(timeout=28)
f.connect(u.hostname,u.port or 21,timeout=28)
f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
f.prot_p();f.set_pasv(True)
def fetch(p):
 b=bytearray();f.retrbinary("RETR "+p,b.extend);return bytes(b)
def sha(b):return hashlib.sha256(b).hexdigest()
try:
 f.cwd(ROOT)
 if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset({s.rsplit("/",1)[-1] for s in f.nlst()}):
  raise RuntimeError("Unexpected WordPress root")
 old=fetch(PATH)
 if not old.startswith(b"<?php"):raise RuntimeError("Unexpected configuration format")
 pattern=rb"(?m)^([ \t]*\$wp_cache_mobile_enabled[ \t]*=[ \t]*)0([ \t]*;[ \t]*(?:\r?\n|$))"
 if len(re.findall(pattern,old))!=1:raise RuntimeError("Expected exactly one disabled mobile-cache assignment")
 if sha(old)[:18]!=EXPECTED_SHA:raise RuntimeError("Config changed since preflight; refuse unexpected edit")
 if not re.search(rb"(?m)^\$wp_cache_mod_rewrite[ \t]*=[ \t]*0[ \t]*;",old):
  raise RuntimeError("Require WP Super Cache simple mode, not rewrite")
 if not re.search(rb"\$wp_cache_mobile_browsers\s*=\s*['\"][^'\"]*(?:Android|android)[^'\"]*['\"]\s*;",old):
  raise RuntimeError("Mobile UA list does not include Android; refuse")
 updated,n=re.subn(pattern,rb"\g<1>1\2",old)
 if n!=1 or len(updated)!=len(old):raise RuntimeError("Unexpected config diff")
 Path("wpsc-config-before-device-fix.php").write_bytes(old)
 uid=uuid.uuid4().hex[:12]
 backup=ROOT+"/wp-content/.ptscps-wpsc-mobile-"+uid+".bak"
 f.storbinary("STOR "+backup,io.BytesIO(old))
 if fetch(backup)!=old:raise RuntimeError("Remote backup failed")
 tmp=PATH+"."+uid+".staged"
 f.storbinary("STOR "+tmp,io.BytesIO(updated))
 if fetch(tmp)!=updated:raise RuntimeError("Staged config mismatch")
 parked=PATH+"."+uid+".old"
 f.rename(PATH,parked)
 try:f.rename(tmp,PATH)
 except Exception:
  f.rename(parked,PATH)
  raise
 try:
  if fetch(PATH)!=updated:raise RuntimeError("Installed configuration differs")
 except Exception:
  f.delete(PATH);f.rename(parked,PATH)
  raise
 f.delete(parked)
 print("WPSC_MOBILE_CACHE_ENABLED "+sha(updated),flush=True)
 print("WPSC_MOBILE_ROLLBACK_SAVED "+backup.rsplit("/",1)[-1],flush=True)
finally:
 try:f.quit()
 except Exception:f.close()
