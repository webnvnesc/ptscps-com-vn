#!/usr/bin/env python3
"""Stage PTSCPS conditional SR7 JavaScript canary MU plugin over verified FTPS.
No normal visitor changes: only ?ptscps_sr7_js_probe=1 triggers it.
"""
import ftplib,hashlib,io,os,uuid
from pathlib import Path
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html"
PATH=ROOT+"/wp-content/mu-plugins/ptscps-sr7-conditional-js.php"
DATA=Path("deploy/ptscps-sr7-conditional-js.php").read_bytes()
if b"Version: 0.1.0-canary" not in DATA or b"ptscps_sr7_js_probe" not in DATA:
 raise ValueError("Unexpected source; refusing deployment")
u=urlsplit(os.environ["FTP_SERVER"] if "://" in os.environ["FTP_SERVER"] else "//"+os.environ["FTP_SERVER"])
ftp=ftplib.FTP_TLS(timeout=28)
ftp.connect(u.hostname,u.port or 21,timeout=28)
ftp.auth()
ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
ftp.prot_p();ftp.set_pasv(True)
uid=uuid.uuid4().hex[:12]
def read(p):
 d=bytearray();ftp.retrbinary("RETR "+p,d.extend);return bytes(d)
try:
 ftp.cwd(ROOT)
 paths={x.rstrip("/").rsplit("/",1)[-1] for x in ftp.nlst()}
 if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(paths):
  raise RuntimeError("Unexpected WordPress root")
 ftp.cwd(ROOT+"/wp-content/mu-plugins")
 entries={x.rstrip("/").rsplit("/",1)[-1] for x in ftp.nlst()}
 if "ptscps-sr7-conditional-js.php" in entries:
  old=read(PATH)
  if old==DATA:
   print("SR7_CANARY_ALREADY_CURRENT",flush=True)
   raise SystemExit(0)
  if b"PTSCPS Conditional SR7 Frontend JS" not in old:
   raise RuntimeError("Existing plugin isn't ours")
  Path("sr7-canary-old.php").write_bytes(old)
  raise RuntimeError("Refusing to replace an existing plugin without explicit upgrade")
 temp=PATH+".ptscps-"+uid+".tmp"
 ftp.storbinary("STOR "+temp,io.BytesIO(DATA))
 if read(temp)!=DATA:raise RuntimeError("Staging hash mismatch")
 ftp.rename(temp,PATH)
 if read(PATH)!=DATA:raise RuntimeError("Installed hash mismatch")
 print("SR7_CANARY_INSTALLED "+hashlib.sha256(DATA).hexdigest(),flush=True)
finally:
 try:ftp.quit()
 except Exception:ftp.close()
