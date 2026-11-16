#!/usr/bin/env python3
"""Rollback only the exactly known installed logo MU plugin, never alter the theme."""
import ftplib,hashlib,io,os,uuid
from pathlib import Path
from urllib.parse import urlsplit
p="/domains/ptscps.com.vn/public_html/wp-content/mu-plugins/ptscps-responsive-logo.php"
expected=Path("deploy/ptscps-responsive-logo.php").read_bytes()
u=os.environ["FTP_SERVER"];u=urlsplit(u if "://" in u else "//"+u)
f=ftplib.FTP_TLS(timeout=28);f.connect(u.hostname,u.port or 21,timeout=28);f.auth()
f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p();f.set_pasv(True)
def read(path):
 b=bytearray();f.retrbinary("RETR "+path,b.extend);return bytes(b)
try:
 try:current=read(p)
 except ftplib.error_perm:
  print("LOGO_RESPONSIVE_NOT_INSTALLED");raise SystemExit(0)
 if current!=expected:raise RuntimeError("Refusing to undo different installed file")
 prior=Path("logo-responsive-before.php")
 if prior.exists():
  old=prior.read_bytes()
  if b"Plugin Name: PTSCPS Responsive Jannah Logo" not in old:raise RuntimeError("Bad previous plugin")
  tmp=p+"."+uuid.uuid4().hex[:12]+".tmp"
  f.storbinary("STOR "+tmp,io.BytesIO(old))
  if read(tmp)!=old:raise RuntimeError("Restore staged checksum mismatch")
  parked=p+"."+uuid.uuid4().hex[:12]+".old"
  f.rename(p,parked)
  try:f.rename(tmp,p)
  except Exception:
   f.rename(parked,p)
   raise
  if read(p)!=old:raise RuntimeError("Restore final checksum mismatch")
  f.delete(parked)
  print("LOGO_RESPONSIVE_PREVIOUS_RESTORED",flush=True)
 else:
  f.delete(p)
  print("LOGO_RESPONSIVE_PLUGIN_REMOVED",flush=True)
finally:
 try:f.quit()
 except Exception:f.close()
