#!/usr/bin/env python3
"""Read-only preflight for root uploads WebP negotiation migration."""
import ftplib,os,json,hashlib
from urllib.parse import urlsplit
root="/domains/ptscps.com.vn/public_html"
url=os.environ["FTP_SERVER"]; u=urlsplit(url if "://" in url else "//"+url)
f=ftplib.FTP_TLS(timeout=24);f.connect(u.hostname,u.port or 21,timeout=24)
f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p();f.set_pasv(True)
def read(path):
 b=bytearray()
 f.retrbinary("RETR "+path,b.extend)
 return bytes(b)
def opt(path):
 try:return read(path)
 except ftplib.error_perm as e:
  if str(e).startswith("550"):return None
  raise
try:
 f.cwd(root)
 found=set(x.rsplit("/",1)[-1] for x in f.nlst())
 if not {"wp-content","wp-admin","wp-includes","index.php"}.issubset(found):
  raise RuntimeError("Wrong WP root")
 paths=["wp-content/uploads/.htaccess","wp-content/uploads/2019/10/.htaccess",
        "wp-content/uploads/2025/11/.htaccess","wp-content/uploads/2026/11/.htaccess",
        "wp-content/uploads/index.php","wp-content/uploads/2019/10/banner3.jpg.webp"]
 for p in paths:
  blob=opt(root+"/"+p)
  print("WEBP_ROOT_AUDIT "+json.dumps({"path":p,"exists":blob is not None,
    "length":len(blob) if blob is not None else None,
    "sha256":hashlib.sha256(blob).hexdigest() if blob is not None else None,
    "knownPilot":b"PTSCPS_WEBP_BANNERS_PILOT_v1" in blob if blob else False,
    "hasRewrite":b"RewriteRule" in blob if blob else False},separators=(',',':')),flush=True)
finally:
 try:f.quit()
 except:f.close()
