#!/usr/bin/env python3
"""Emergency SR7 migration rollback restoring the *actual* previous files."""
import ftplib,io,os,sys,uuid
from pathlib import Path
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html"
MU=ROOT+"/wp-content/mu-plugins"
files={
 ROOT+"/.htaccess":Path("sr7-transition-before-root.htaccess"),
 MU+"/ptscps-sr7-slim-loader.php":Path("sr7-transition-before-slim-loader.php"),
}
for p in files.values():
 if not p.exists():sys.exit("Missing validated before-file "+str(p))
baseline=files[ROOT+"/.htaccess"].read_bytes()
if b"# BEGIN PTSCPS SR7 FastPath" not in baseline or b"# BEGIN WordPress" not in baseline:
 sys.exit("Unrecognized old htaccess; refusing rollback")
oldslim=files[MU+"/ptscps-sr7-slim-loader.php"].read_bytes()
if b"Version: 1.0.0-canary" not in oldslim:
 sys.exit("Unrecognized original canary")
host=os.environ["FTP_SERVER"];u=urlsplit(host if "://" in host else "//"+host)
f=ftplib.FTP_TLS(timeout=28);f.connect(u.hostname,u.port or 21,timeout=28)
f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
f.prot_p();f.set_pasv(True)
id_=uuid.uuid4().hex[:10]
def read(path):
 data=bytearray();f.retrbinary("RETR "+path,data.extend);return bytes(data)
def reset(path,data):
 folder,name=path.rsplit("/",1);staged=folder+"/.ptscps-sr7-rollback-"+id_+"-"+name
 f.storbinary("STOR "+staged,io.BytesIO(data))
 if read(staged)!=data:raise RuntimeError("Rollback staging incorrect")
 parked=path+".ptscps-sr7-rollback-"+id_+".old"
 f.rename(path,parked)
 try:f.rename(staged,path)
 except Exception:
  f.rename(parked,path)
  raise
 if read(path)!=data:raise RuntimeError("Rollback post-install checksum failed")
 f.delete(parked)
 print("SR7_RESTORED",name,flush=True)
try:
 f.cwd(ROOT)
 if not {"index.php","wp-admin","wp-content","wp-includes"}.issubset(
  {x.rstrip("/").rsplit("/",1)[-1] for x in f.nlst()}):
  raise RuntimeError("Wrong root")
 # Recover old working static FastPath first, then revert canary config.
 reset(ROOT+"/.htaccess",baseline)
 reset(MU+"/ptscps-sr7-slim-loader.php",oldslim)
 try:
  f.rename(MU+"/.ptscps-sr7-fastpath-sync.retired.php.bak",
           MU+"/ptscps-sr7-fastpath-sync.php")
  print("SR7_RESTORED fastpath sync",flush=True)
 except ftplib.error_perm as e:
  print("SR7_SYNC_RESTORE_NOTE",str(e)[:140],flush=True)
 print("SR7_ROLLBACK_SUCCESS",flush=True)
finally:
 try:f.quit()
 except:f.close()
