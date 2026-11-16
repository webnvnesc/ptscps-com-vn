#!/usr/bin/env python3
"""Atomically replace the tested SR7 canary MU plugin with production mode.

This changes ONLY a verified owned file under MU plugins, keeps a reversible
backup on the runner and FTP server, and does not modify Jannah, Elementor,
Slider Revolution, .htaccess or WordPress options.
"""
import ftplib,hashlib,io,os,uuid,sys
from pathlib import Path
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html"
MU=ROOT+"/wp-content/mu-plugins"
FILE="ptscps-sr7-conditional-js.php"
PATH=MU+"/"+FILE
SRC=Path("deploy/ptscps-sr7-conditional-js.php").read_bytes()
if b"Version: 1.0.0" not in SRC or b"return true;" not in SRC or b"ptscps_sr7_js_gate_safe" not in SRC:
 sys.exit("Invalid production PHP source")
host=os.environ["FTP_SERVER"]
u=urlsplit(host if "://" in host else "//"+host)
f=ftplib.FTP_TLS(timeout=28);f.connect(u.hostname,u.port or 21,timeout=28)
f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
f.prot_p();f.set_pasv(True)
id_=uuid.uuid4().hex[:12]
def get(path):
 d=bytearray();f.retrbinary("RETR "+path,d.extend);return bytes(d)
try:
 f.cwd(ROOT);listing={p.rstrip("/").rsplit("/",1)[-1] for p in f.nlst()}
 if not {"index.php","wp-admin","wp-content","wp-includes"}.issubset(listing):
  raise RuntimeError("Unexpected WordPress root")
 old=get(PATH)
 if SRC==old:
  print("SR7_JS_PRODUCTION_ALREADY_CURRENT")
  raise SystemExit(0)
 if b"Version: 0.1.0-canary" not in old or b"PTSCPS Conditional SR7 Frontend JS" not in old:
  raise RuntimeError("Refusing overwrite, installed canary ownership/version mismatch")
 Path("sr7-js-before-live.php").write_bytes(old)
 backup=MU+"/.ptscps-sr7-conditional-js-"+id_+".bak"
 f.storbinary("STOR "+backup,io.BytesIO(old))
 if get(backup)!=old:raise RuntimeError("Backup verification failed")
 tmp=MU+"/.ptscps-sr7-conditional-js-"+id_+".tmp"
 f.storbinary("STOR "+tmp,io.BytesIO(SRC))
 if get(tmp)!=SRC:raise RuntimeError("Staged new file differs")
 parked=MU+"/.ptscps-sr7-conditional-js-"+id_+".old"
 f.rename(PATH,parked)
 try:f.rename(tmp,PATH)
 except Exception:
  f.rename(parked,PATH)
  raise
 if get(PATH)!=SRC:
  f.delete(PATH);f.rename(parked,PATH)
  raise RuntimeError("Post-rename checksum mismatch; restored original")
 f.delete(parked)
 print("SR7_JS_PRODUCTION_ENABLED "+hashlib.sha256(SRC).hexdigest(),flush=True)
 print("SR7_JS_ROLLBACK_BACKUP "+backup.rsplit("/",1)[-1],flush=True)
finally:
 try:f.quit()
 except Exception:f.close()
