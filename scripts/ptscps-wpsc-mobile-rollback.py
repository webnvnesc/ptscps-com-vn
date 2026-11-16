#!/usr/bin/env python3
"""Restore exact previous WP Super Cache config when rollout verification fails."""
import ftplib,hashlib,io,os,uuid,re
from pathlib import Path
from urllib.parse import urlsplit
saved=Path("wpsc-config-before-device-fix.php")
if not saved.exists():
 print("WPSC_MOBILE_NO_DEPLOYMENT_TO_ROLLBACK");raise SystemExit(0)
old=saved.read_bytes()
p="/domains/ptscps.com.vn/public_html/wp-content/wp-cache-config.php"
u=os.environ["FTP_SERVER"];u=urlsplit(u if "://" in u else "//"+u)
ftp=ftplib.FTP_TLS(timeout=28);ftp.connect(u.hostname,u.port or 21,timeout=28)
ftp.auth();ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
ftp.prot_p();ftp.set_pasv(True)
def read(p):
 b=bytearray();ftp.retrbinary("RETR "+p,b.extend);return bytes(b)
try:
 curr=read(p)
 if curr==old:
  print("WPSC_MOBILE_ALREADY_ROLLED_BACK");raise SystemExit(0)
 expected,n=re.subn(rb"(?m)^([ \t]*\$wp_cache_mobile_enabled[ \t]*=[ \t]*)0([ \t]*;[ \t]*(?:\r?\n|$))",rb"\g<1>1\2",old)
 if n!=1:raise RuntimeError("Unexpected rollback source")
 if curr!=expected:raise RuntimeError("Refusing rollback: installed configuration differs from candidate")
 uid=uuid.uuid4().hex[:12]
 tmp=p+"."+uid+".restore"
 ftp.storbinary("STOR "+tmp,io.BytesIO(old))
 if read(tmp)!=old:raise RuntimeError("Rollback staging failed")
 parked=p+"."+uid+".previous"
 ftp.rename(p,parked)
 try:ftp.rename(tmp,p)
 except Exception:
  ftp.rename(parked,p)
  raise
 if read(p)!=old:raise RuntimeError("Rollback verification failed")
 ftp.delete(parked)
 print("WPSC_MOBILE_ROLLBACK_OK")
finally:
 try:ftp.quit()
 except Exception:ftp.close()
