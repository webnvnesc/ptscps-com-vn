#!/usr/bin/env python3
"""Restore exact opt-in SR7 canary MU plugin if production QA fails."""
import ftplib,os,io,sys,uuid
from pathlib import Path
from urllib.parse import urlsplit
file=Path("sr7-js-before-live.php")
if not file.exists():sys.exit("No rollback required (deployment not installed)")
old=file.read_bytes()
if b"Version: 0.1.0-canary" not in old or b"PTSCPS Conditional SR7 Frontend JS" not in old:
 sys.exit("Rollback source isn't the previously tested canary")
ROOT="/domains/ptscps.com.vn/public_html"
remote=ROOT+"/wp-content/mu-plugins/ptscps-sr7-conditional-js.php"
host=os.environ["FTP_SERVER"];u=urlsplit(host if "://" in host else "//"+host)
f=ftplib.FTP_TLS(timeout=28);f.connect(u.hostname,u.port or 21,timeout=28);f.auth()
f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p();f.set_pasv(True)
uid=uuid.uuid4().hex[:12]
try:
 now=bytearray();f.retrbinary("RETR "+remote,now.extend)
 if old==bytes(now):
  print("SR7_JS_ALREADY_ROLLED_BACK");sys.exit(0)
 if b"Version: 1.0.0" not in bytes(now):
  sys.exit("Installed file changed since deploy; refusing blind rollback")
 staged=remote+".rollback-"+uid+".tmp"
 f.storbinary("STOR "+staged,io.BytesIO(old))
 check=bytearray();f.retrbinary("RETR "+staged,check.extend)
 if old!=bytes(check):raise RuntimeError("Rollback staged checksum mismatch")
 parked=remote+".rollback-"+uid+".old"
 f.rename(remote,parked)
 try:f.rename(staged,remote)
 except Exception:
  f.rename(parked,remote)
  raise
 current=bytearray();f.retrbinary("RETR "+remote,current.extend)
 if old!=bytes(current):raise RuntimeError("Rollback postinstall checksum mismatch")
 f.delete(parked)
 print("SR7_JS_ROLLBACK_SUCCESS",flush=True)
finally:
 try:f.quit()
 except Exception:f.close()
