#!/usr/bin/env python3
"""Install canary-only MU plugin, with FTPS checksum and rollback.
Existing Apache FastPath remains untouched for normal visitor requests.
"""
import ftplib, hashlib, io, os, sys, uuid
from pathlib import Path
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html"
SRC=Path("deploy/ptscps-sr7-slim-loader.php").read_bytes()
if b"Version: 1.0.0-canary" not in SRC or b"ptscps_sr7_slim_probe" not in SRC:
 sys.exit("Unexpected canary plugin source")
h=os.environ["FTP_SERVER"];p=urlsplit(h if "://" in h else "//"+h)
f=ftplib.FTP_TLS(timeout=30);f.connect(p.hostname,p.port or 21,timeout=30);f.auth()
f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p();f.set_pasv(True)
name="ptscps-sr7-slim-loader.php"
uid=uuid.uuid4().hex[:12]
dir_=ROOT+"/wp-content/mu-plugins"
path=dir_+"/"+name
tmp=dir_+"/."+name+"."+uid+".tmp"
def read(x):
 buf=bytearray()
 f.retrbinary("RETR "+x,buf.extend)
 return bytes(buf)
try:
 f.cwd(ROOT)
 names={n.rstrip("/").split("/")[-1] for n in f.nlst()}
 if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(names):raise RuntimeError("Unexpected WP root")
 f.cwd(dir_)
 names={n.rstrip("/").split("/")[-1] for n in f.nlst()}
 if name in names:
  old=read(path)
  if old==SRC:
   print("CANARY_ALREADY_CURRENT");sys.exit(0)
  if b"PTSCPS SR7 REST Selective Plugin Loader" not in old:
   raise RuntimeError("Existing unrelated MU file, refuse to replace")
  Path("sr7-slim-before.php").write_bytes(old)
  backup=dir_+"/."+name+"."+uid+".bak"
  f.storbinary("STOR "+backup,io.BytesIO(old))
  if read(backup)!=old:raise RuntimeError("Backup verification failed")
 else:old=None
 f.storbinary("STOR "+tmp,io.BytesIO(SRC))
 if read(tmp)!=SRC:raise RuntimeError("staged file checksum mismatch")
 if old is not None:
  f.rename(path,path+"."+uid+".old")
 try:f.rename(tmp,path)
 except Exception:
  if old is not None:f.rename(path+"."+uid+".old",path)
  raise
 if read(path)!=SRC:raise RuntimeError("installed file mismatch")
 if old is not None:f.delete(path+"."+uid+".old")
 print("SR7_SLIM_CANARY_INSTALLED "+hashlib.sha256(SRC).hexdigest(),flush=True)
finally:
 try:f.quit()
 except:f.close()
