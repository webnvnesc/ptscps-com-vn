#!/usr/bin/env python3
"""Narrow WP Super Cache invalidation for two audited public pages.

Deletes only cache artifacts in the exact homepage and news category directories.
Never reads cache payloads, WordPress configs, uploads, or any other paths.
"""
import ftplib,os,re,sys,uuid,json
from urllib.parse import urlsplit

root='/domains/ptscps.com.vn/public_html'
targets=[
 root+'/wp-content/cache/supercache/ptscps.com.vn',
 root+'/wp-content/cache/supercache/ptscps.com.vn/c/hoat-dong-cua-cong-ty'
]
allowed=re.compile(r'^(?:index-https\.html(?:\.gz)?|index\.html(?:\.gz)?|(?:meta-)?wp-cache-[0-9a-f]{32}\.php)$')
v=os.environ.get('FTP_SERVER','')
user=os.environ.get('FTP_USERNAME','')
password=os.environ.get('FTP_PASSWORD','')
if not (v and user and password):sys.exit('FAIL: missing credentials')
host=urlsplit(v if '://' in v else '//'+v)
ftp=ftplib.FTP_TLS(timeout=25)
ftp.connect(host.hostname,host.port or 21,timeout=25);ftp.auth();ftp.login(user,password);ftp.prot_p();ftp.set_pasv(True)
try:
 ftp.cwd(root)
 names={x.rsplit('/',1)[-1] for x in ftp.nlst()}
 if not {'index.php','wp-admin','wp-content','wp-includes'}.issubset(names):
  sys.exit('FAIL: unexpected WordPress root')
 total=0
 for directory in targets:
  files=[]
  for name,meta in ftp.mlsd(directory):
   if name in ('.','..') or meta.get('type')!='file':continue
   if allowed.fullmatch(name):files.append(name)
  if not files or len(files)>35:
   sys.exit('FAIL: empty or unexpected cache-file count at '+directory)
  # The two exact, non-recursive directories are the entire deletion scope.
  print('CACHE_PURGE_TARGET',json.dumps({'dir':directory.replace(root,''),
       'matchedFiles':len(files),'names':files},ensure_ascii=False),flush=True)
  ftp.cwd(directory)
  for filename in files:
   try:
    ftp.delete(filename)
    total+=1
   except ftplib.error_perm as e:
    # A simultaneous cache regeneration may race; report instead of falling back.
    print('CACHE_DELETE_ERROR',filename,type(e).__name__,flush=True)
    raise
  print('CACHE_PURGED',directory.replace(root,''),len(files),flush=True)
 print('CACHE_PURGE_SUCCESS',total,flush=True)
finally:
 try:ftp.quit()
 except:ftp.close()
