#!/usr/bin/env python3
"""Switch PTSCPS SR7 to scoped plugin filtering, with precise FTPS rollback.

Only 3 production paths may change:
- root .htaccess: remove EXACT legacy PTSCPS SR7 FastPath managed block
- mu-plugins/ptscps-sr7-slim-loader.php: verified version 1.1.0
- mu-plugins/ptscps-sr7-fastpath-sync.php: disable via safe .bak rename
No WordPress option is changed, no plugin is disabled globally.
"""
import ftplib,hashlib,io,os,re,sys,uuid
from pathlib import Path
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html"
MU=ROOT+"/wp-content/mu-plugins"
HT=ROOT+"/.htaccess"
SLIM=MU+"/ptscps-sr7-slim-loader.php"
SYNC=MU+"/ptscps-sr7-fastpath-sync.php"
SYNC_DISABLED=MU+"/.ptscps-sr7-fastpath-sync.retired.php.bak"
BEGIN=b"# BEGIN PTSCPS SR7 FastPath (managed; do not edit inside this block)\n"
END=b"# END PTSCPS SR7 FastPath\n"
new=Path("deploy/ptscps-sr7-slim-loader.php").read_bytes()
assert b"Version: 1.1.0" in new and b"return true;" in new
h=os.environ["FTP_SERVER"];s=urlsplit(h if "://" in h else "//"+h)
ftp=ftplib.FTP_TLS(timeout=28)
ftp.connect(s.hostname,s.port or 21,timeout=28)
ftp.auth();ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);ftp.prot_p();ftp.set_pasv(True)
uid=uuid.uuid4().hex[:12]
done=[]
def get(path,limit=160000):
 b=bytearray()
 def append(x):
  if len(b)+len(x)>limit:raise RuntimeError("file size limit exceeded")
  b.extend(x)
 ftp.retrbinary("RETR "+path,append)
 return bytes(b)
def listnames(p):
 ftp.cwd(p)
 return {i.rstrip("/").split("/")[-1] for i in ftp.nlst()}
def stage(path,data):
 folder,name=path.rsplit("/",1)
 tmp=folder+"/.ptscps-transition-"+uid+"-"+name+".tmp"
 ftp.storbinary("STOR "+tmp,io.BytesIO(data))
 if get(tmp)!=data:raise RuntimeError("Staged file checksum mismatch")
 return tmp
def swap(path,data):
 old=get(path)
 if old==data:return
 tmp=stage(path,data)
 parked=path+".ptscps-transition-"+uid+".old"
 ftp.rename(path,parked)
 try:ftp.rename(tmp,path)
 except Exception:
  ftp.rename(parked,path)
  raise
 if get(path)!=data:
  # Stop; best effort immediate restore original
  try:ftp.delete(path);ftp.rename(parked,path)
  except Exception:pass
  raise RuntimeError("Post-install mismatch")
 ftp.delete(parked)
 done.append(("write",path,old))
 print("CHANGED",path.rsplit("/",1)[-1],hashlib.sha256(data).hexdigest()[:16],flush=True)
def rollback():
 for action,path,old in reversed(done):
  try:
   if action=="write":
    tmp=stage(path,old);ftp.delete(path);ftp.rename(tmp,path)
   elif action=="rename":
    ftp.rename(path,old)
   print("ROLLBACK_OK",path.rsplit("/",1)[-1],flush=True)
  except Exception as exc:print("ROLLBACK_ERROR",path,str(exc)[:150],flush=True)
try:
 if not {"wp-admin","wp-content","wp-includes","index.php",".htaccess"}.issubset(listnames(ROOT)):
  raise RuntimeError("Incorrect WordPress docroot")
 mu_files=listnames(MU)
 if "ptscps-sr7-slim-loader.php" not in mu_files or "ptscps-sr7-fastpath-sync.php" not in mu_files:
  raise RuntimeError("Expected FastPath and canary files missing")
 old_ht=get(HT)
 old_slim=get(SLIM)
 old_sync=get(SYNC)
 if old_ht.count(BEGIN)!=1 or old_ht.count(END)!=1:
  raise RuntimeError("Legacy FastPath block not uniquely identifiable")
 if b"Version: 1.0.0-canary" not in old_slim or b"PTSCPS SR7 REST Selective Plugin Loader" not in old_slim:
  raise RuntimeError("Canary not identified; refusing overwrite")
 if b"PTSCPS Slider Revolution 7 Static FastPath Synchronizer" not in old_sync:
  raise RuntimeError("Sync ownership marker mismatch")
 if ".ptscps-sr7-fastpath-sync.retired.php.bak" in mu_files:
  raise RuntimeError("Existing retirement backup requires inspection")
 i=old_ht.index(BEGIN);j=old_ht.index(END,i)+len(END)
 # Strip one spacer newline, preserving all other .htaccess bytes exactly.
 if old_ht[j:j+1]==b"\n":j+=1
 desired_ht=old_ht[:i]+old_ht[j:]
 if b"# BEGIN WordPress" not in desired_ht or b"# END WordPress" not in desired_ht:
  raise RuntimeError("WordPress rewrite block missing after adjustment")
 Path("sr7-transition-before-root.htaccess").write_bytes(old_ht)
 Path("sr7-transition-before-slim-loader.php").write_bytes(old_slim)
 Path("sr7-transition-before-fastpath-sync.php").write_bytes(old_sync)
 # Update filter first while old FastPath remains active, so no visitor regression.
 swap(SLIM,new)
 # Switch public URL to WordPress native with slim plugin filter.
 swap(HT,desired_ht)
 # Retire unnecessary mutation hook; all slide IDs now use WordPress.
 ftp.rename(SYNC,SYNC_DISABLED)
 done.append(("rename",SYNC_DISABLED,SYNC))
 print("SR7_TRANSITION_SUCCESS",{"rewrite_removed":True,"slim_loader_version":"1.1.0","sync_retired":True},flush=True)
except Exception:
 rollback()
 raise
finally:
 try:ftp.quit()
 except Exception:ftp.close()
