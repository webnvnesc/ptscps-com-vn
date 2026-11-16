#!/usr/bin/env python3
"""Read-only FTPS directory names for narrowly targeted WP Super Cache invalidation."""
import os,ftplib,json
from urllib.parse import urlsplit
host=os.environ['FTP_SERVER'];user=os.environ['FTP_USERNAME'];password=os.environ['FTP_PASSWORD']
root='/domains/ptscps.com.vn/public_html/wp-content/cache'
url=urlsplit(host if '://' in host else '//'+host)
ftp=ftplib.FTP_TLS(timeout=25)
ftp.connect(url.hostname,url.port or 21,timeout=25);ftp.auth();ftp.login(user,password);ftp.prot_p();ftp.set_pasv(True)
paths=['','/supercache','/supercache/ptscps.com.vn','/supercache/ptscps.com.vn/c','/supercache/ptscps.com.vn/c/hoat-dong-cua-cong-ty','/wp-cache']
try:
 for p in paths:
  try:
   rows=[]
   for name,meta in ftp.mlsd(root+p):
    if name in ('.','..'):continue
    # Log file and directory names only, no sensitive contents.
    rows.append({'name':name[:90],'type':meta.get('type'),'size':meta.get('size')})
   print('DIR',json.dumps({'path':p,'entries':rows[:45],'total':len(rows)},ensure_ascii=False),flush=True)
  except Exception as e:
   print('DIR_ERROR',json.dumps({'path':p,'errorType':type(e).__name__}),flush=True)
finally:
 try: ftp.quit()
 except:ftp.close()
