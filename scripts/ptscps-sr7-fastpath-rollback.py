#!/usr/bin/env python3
"""Emergency rollback for failed PTSCPS SR7 fastpath postdeploy QA.
Restore exact original root .htaccess only if managed block is present.
Never remove arbitrary plugins or change other WordPress configuration.
"""
import ftplib,io,os,sys
from pathlib import Path
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html"
old=Path("sr7-before--htaccess")
if not old.exists():sys.exit("ROLLBACK_NOT_NEEDED_NO_BACKUP")
data=old.read_bytes()
if b"# BEGIN WordPress" not in data or b"# BEGIN PTSCPS SR7 FastPath" in data:
 sys.exit("FAIL: invalid rollback baseline")
h=os.environ["FTP_SERVER"];u=urlsplit(h if "://" in h else "//"+h)
ftp=ftplib.FTP_TLS(timeout=28)
ftp.connect(u.hostname,u.port or 21,timeout=28)
ftp.auth();ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);ftp.prot_p();ftp.set_pasv(True)
try:
 ftp.cwd(ROOT)
 present=bytearray()
 ftp.retrbinary("RETR .htaccess",present.extend)
 if b"# BEGIN PTSCPS SR7 FastPath" not in present:
  print("ROLLBACK_NOT_REQUIRED_REWRITE_ALREADY_DISABLED");sys.exit(0)
 tmp=".ptscps-sr7-rollback.htaccess.tmp"
 ftp.storbinary("STOR "+tmp,io.BytesIO(data))
 check=bytearray();ftp.retrbinary("RETR "+tmp,check.extend)
 if bytes(check)!=data:sys.exit("ROLLBACK_SHA_MISMATCH")
 ftp.rename(".htaccess",".ptscps-sr7-rollback-before.htaccess.bak")
 ftp.rename(tmp,".htaccess")
 done=bytearray();ftp.retrbinary("RETR .htaccess",done.extend)
 if bytes(done)!=data:sys.exit("ROLLBACK_FINAL_MISMATCH")
 print("FASTPATH_REWRITE_ROLLBACK_SUCCESS",flush=True)
finally:
 try:ftp.quit()
 except:ftp.close()
