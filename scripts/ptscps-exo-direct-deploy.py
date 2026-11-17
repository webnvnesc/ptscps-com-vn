#!/usr/bin/env python3
"""Deploy owned Jannah responsive logo MU plugin by FTPS with exact SHA verification."""
import ftplib,hashlib,io,os,sys,uuid
from pathlib import Path
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html"
MU=ROOT+"/wp-content/mu-plugins"
NAME="ptscps-exo-css-direct.php"
PATH=MU+"/"+NAME
SRC=Path("deploy/ptscps-exo-css-direct.php").read_bytes()
if b"Plugin Name: PTSCPS Exo Font CSS Direct" not in SRC or b"Version: 1.0.2" not in SRC:
 raise RuntimeError("Unrecognized source plugin")
u=os.environ["FTP_SERVER"];u=urlsplit(u if "://" in u else "//"+u)
f=ftplib.FTP_TLS(timeout=28);f.connect(u.hostname,u.port or 21,timeout=28)
f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p();f.set_pasv(True)
def read(p):
 b=bytearray();f.retrbinary("RETR "+p,b.extend);return bytes(b)
try:
 f.cwd(ROOT)
 listing={x.rstrip("/").rsplit("/",1)[-1] for x in f.nlst()}
 if not {"index.php","wp-admin","wp-content","wp-includes"}.issubset(listing):
  raise RuntimeError("Unexpected WordPress root")
 try:old=read(PATH)
 except ftplib.error_perm as e:
  if not str(e).startswith("550"):raise
  old=None
 if old==SRC:
  print("EXO_DIRECT_PLUGIN_ALREADY_CURRENT")
  sys.exit(0)
 if old is not None and b"Plugin Name: PTSCPS Exo Font CSS Direct" not in old:
  raise RuntimeError("Refusing to overwrite unmanaged plugin")
 if old is not None:
  Path("exo-direct-before.php").write_bytes(old)
  backup=MU+"/."+NAME+"."+uuid.uuid4().hex[:12]+".bak"
  f.storbinary("STOR "+backup,io.BytesIO(old))
  if read(backup)!=old:raise RuntimeError("Backup mismatch")
  print("EXO_DIRECT_BACKUP "+backup.rsplit("/",1)[-1],flush=True)
 tmp=MU+"/."+NAME+"."+uuid.uuid4().hex[:12]+".tmp"
 f.storbinary("STOR "+tmp,io.BytesIO(SRC))
 if read(tmp)!=SRC:raise RuntimeError("Staged plugin differs")
 if old is None:f.rename(tmp,PATH)
 else:
  parked=PATH+"."+uuid.uuid4().hex[:12]+".old"
  f.rename(PATH,parked)
  try:f.rename(tmp,PATH)
  except Exception:
   f.rename(parked,PATH)
   raise
  f.delete(parked)
 if read(PATH)!=SRC:raise RuntimeError("Installed plugin differs")
 print("EXO_DIRECT_ENABLED "+hashlib.sha256(SRC).hexdigest(),flush=True)
finally:
 try:f.quit()
 except Exception:f.close()
