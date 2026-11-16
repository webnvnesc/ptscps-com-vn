#!/usr/bin/env python3
"""Deploy exact two public Slider Revolution 7 FastPath resources.

Atomic FTPS file replacement. WordPress remains the fallback if JSON files
disappear, and all other WP REST routes are unchanged. Restrict to exact
allowlisted URLs. Existing .htaccess is preserved byte-for-byte outside
our bounded block and backed up on the server plus workflow artifact.
"""
import ftplib,hashlib,io,json,os,re,sys,urllib.request,uuid
from pathlib import Path
from urllib.parse import urlsplit

ROOT="/domains/ptscps.com.vn/public_html"
DIR="_ptscps-sr7-fastpath"
BLOCK=(
"# BEGIN PTSCPS SR7 FastPath (managed; do not edit inside this block)\n"
"<IfModule mod_rewrite.c>\n"
"RewriteEngine On\n"
"RewriteCond %{REQUEST_METHOD} ^(GET|HEAD)$\n"
"RewriteCond %{HTTP:Cookie} !wordpress_logged_in_ [NC]\n"
"RewriteCond %{HTTP:Cookie} !wordpress_sec_ [NC]\n"
"RewriteCond %{HTTP:Authorization} ^$\n"
"RewriteCond %{QUERY_STRING} ^(srengine=7&slideid=2|slideid=2&srengine=7)$\n"
"RewriteCond %{DOCUMENT_ROOT}/_ptscps-sr7-fastpath/slide-2.json -f\n"
"RewriteRule ^wp-json/sliderrevolution/sliders/1/?$ /_ptscps-sr7-fastpath/slide-2.json [L]\n"
"RewriteCond %{REQUEST_METHOD} ^(GET|HEAD)$\n"
"RewriteCond %{HTTP:Cookie} !wordpress_logged_in_ [NC]\n"
"RewriteCond %{HTTP:Cookie} !wordpress_sec_ [NC]\n"
"RewriteCond %{HTTP:Authorization} ^$\n"
"RewriteCond %{QUERY_STRING} ^(srengine=7&slideid=3|slideid=3&srengine=7)$\n"
"RewriteCond %{DOCUMENT_ROOT}/_ptscps-sr7-fastpath/slide-3.json -f\n"
"RewriteRule ^wp-json/sliderrevolution/sliders/1/?$ /_ptscps-sr7-fastpath/slide-3.json [L]\n"
"</IfModule>\n"
"# END PTSCPS SR7 FastPath\n"
)
PRIVATE_CONFIG=(
"<IfModule mod_mime.c>\n"
"AddType application/json .json\n"
"</IfModule>\n"
"<IfModule mod_headers.c>\n"
"<FilesMatch \"^slide-[23]\\.json$\">\n"
"Header always set Cache-Control \"public, max-age=30\"\n"
"Header always set X-PTSCPS-SR7-FastPath \"static\"\n"
"</FilesMatch>\n"
"</IfModule>\n"
"<FilesMatch \"^(?!slide-[23]\\.json$).+\">\n"
"<IfModule mod_authz_core.c>\n"
"Require all denied\n"
"</IfModule>\n"
"</FilesMatch>\n"
)
MARKER=b"Plugin Name: PTSCPS Slider Revolution 7 Static FastPath Synchronizer"
PLUGIN=Path("deploy/ptscps-sr7-fastpath-sync.php").read_bytes()
if MARKER not in PLUGIN or len(PLUGIN)>25000:sys.exit("INVALID plugin source")
uid=uuid.uuid4().hex[:12]
REMOTE_TMP_PREFIX=".ptscps-sr7-"+uid
host=os.environ.get("FTP_SERVER");user=os.environ.get("FTP_USERNAME");secret=os.environ.get("FTP_PASSWORD")
if not all((host,user,secret)):sys.exit("Missing FTPS secrets")
u=urlsplit(host if "://" in host else "//"+host)
ftp=ftplib.FTP_TLS(timeout=32)
ftp.connect(u.hostname,u.port or 21,timeout=32)
ftp.auth();ftp.login(user,secret);ftp.prot_p();ftp.set_pasv(True)
changed=[]
backups={}
def read(path,limit=100000):
 chunks=[];size=0
 def add(b):
  nonlocal size
  size+=len(b)
  if size>limit:raise ValueError("Unusually large remote file")
  chunks.append(b)
 ftp.retrbinary("RETR "+path,add)
 return b"".join(chunks)
def names(path):
 ftp.cwd(path)
 return {x.rstrip("/").rsplit("/",1)[-1] for x in ftp.nlst()}
def ensure_dir(path):
 try:
  ftp.mkd(path)
  print("DIR_CREATED",path.split("/")[-1],flush=True)
 except ftplib.error_perm as e:
  if "550" not in str(e):raise
  ftp.cwd(path)
def put_atomic(path,data,require_source_marker=None):
 folder,name=path.rsplit("/",1)
 existing=None
 if name in names(folder):
  existing=read(path,120000)
  if existing==data:
   print("FILE_ALREADY_CURRENT",name,flush=True)
   return
  if require_source_marker and require_source_marker not in existing:
   raise RuntimeError("Existing managed file conflicts: "+name)
  local=Path("sr7-before-"+name.replace(".","-"))
  local.write_bytes(existing)
  backup=name+".ptscps-backup-"+uid+".bak"
  ftp.storbinary("STOR "+folder+"/"+backup,io.BytesIO(existing))
  if read(folder+"/"+backup)!=existing:raise RuntimeError("Backup validation failed")
  backups[name]=backup
 tmp=folder+"/"+REMOTE_TMP_PREFIX+"-"+name+".tmp"
 ftp.storbinary("STOR "+tmp,io.BytesIO(data))
 if hashlib.sha256(read(tmp)).digest()!=hashlib.sha256(data).digest():
  raise RuntimeError("Staging SHA mismatch "+name)
 retired=None
 if existing is not None:
  retired=folder+"/"+REMOTE_TMP_PREFIX+"-"+name+".old"
  ftp.rename(path,retired)
 try:
  ftp.rename(tmp,path)
 except Exception:
  if retired:ftp.rename(retired,path)
  raise
 if read(path,120000)!=data:
  raise RuntimeError("Installed hash differs: "+name)
 if retired:ftp.delete(retired)
 changed.append((path,existing))
 print("INSTALLED",name,"BYTES",len(data),"SHA256",hashlib.sha256(data).hexdigest(),flush=True)
def acquire_json(slide):
 url=f"https://ptscps.com.vn/wp-json/sliderrevolution/sliders/1?srengine=7&slideid={slide}"
 req=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":"Mozilla/5.0 (compatible; PTSCPS-SR7-FastPath-Deploy)"})
 with urllib.request.urlopen(req,timeout=40) as resp:
  if resp.status!=200:raise RuntimeError("Native endpoint non-200")
  b=resp.read(75000)
  obj=json.loads(b)
  if not isinstance(obj,dict) or obj.get("success") is not True or not isinstance(obj.get("slides"),(list,dict)) or "addOns" not in obj:
   raise RuntimeError("Invalid slide payload")
  if len(b)<100 or len(b)>20000:raise RuntimeError("Unexpected JSON size")
  return b
try:
 if not {"wp-admin","wp-content","wp-includes","index.php",".htaccess"}.issubset(names(ROOT)):
  raise RuntimeError("Unexpected server root")
 current=read(ROOT+"/.htaccess",120000)
 if b"# BEGIN WordPress" not in current or b"# END WordPress" not in current:
  raise RuntimeError("Unexpected root htaccess")
 if b"# BEGIN PTSCPS SR7 FastPath" in current:
  raise RuntimeError("FastPath already present; refuse blind overwrite")
 if b"\r\n" in current:raise RuntimeError("CRLF .htaccess requires preservation handling")
 html=current.decode("utf-8")
 patched=(BLOCK+"\n"+html).encode("utf-8")
 for slide in (2,3):
  body=acquire_json(slide)
  # Native payload is checked again before/after upload.
  if not isinstance(json.loads(body).get("slides"),(list,dict)):raise RuntimeError("Invalid JSON")
  ensure_dir(ROOT+"/"+DIR)
  put_atomic(ROOT+"/"+DIR+f"/slide-{slide}.json",body)
 put_atomic(ROOT+"/"+DIR+"/.htaccess",PRIVATE_CONFIG.encode())
 ensure_dir(ROOT+"/wp-content/mu-plugins")
 put_atomic(ROOT+"/wp-content/mu-plugins/ptscps-sr7-fastpath-sync.php",PLUGIN,MARKER)
 put_atomic(ROOT+"/.htaccess",patched)
 print("FASTPATH_DEPLOY_SUCCESS",json.dumps({"slides":[2,3],"rewrite":"enabled","fallback":"native REST when static JSON missing"}),flush=True)
except Exception as e:
 print("FASTPATH_DEPLOY_ERROR",type(e).__name__,str(e)[:400],flush=True)
 # Roll back anything changed to preserve the exact previous WP state.
 for path,old in reversed(changed):
  try:
   if old is None:
    ftp.delete(path)
   else:
    folder,name=path.rsplit("/",1)
    rescue=folder+"/"+REMOTE_TMP_PREFIX+"-rollback"
    ftp.storbinary("STOR "+rescue,io.BytesIO(old))
    ftp.delete(path)
    ftp.rename(rescue,path)
  except Exception as rollback_error:
   print("ROLLBACK_ERROR",path,str(rollback_error)[:120],flush=True)
 raise
finally:
 try:ftp.quit()
 except Exception:ftp.close()
