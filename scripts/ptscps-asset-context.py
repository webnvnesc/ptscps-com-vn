#!/usr/bin/env python3
"""Read-only targeted asset management source context on FTP; no uploads/config."""
import ftplib, os, re, json
from urllib.parse import urlsplit
host=os.environ["FTP_SERVER"]
p=urlsplit(host if "://" in host else "//"+host)
f=ftplib.FTP_TLS()
f.connect(p.hostname,p.port or 21,timeout=20)
f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p()
root="/domains/ptscps.com.vn/public_html/"
targets={
"wp-content/themes/jannah/inc/theme-setup.php":[(120,320)],
"wp-content/themes/jannah/framework/classes/class-tielabs-styles.php":[(1,130),(130,250)],
"wp-content/plugins/elementor/includes/frontend.php":[(155,260)],
"wp-content/plugins/elementor/core/page-assets/loader.php":[(90,190)],
"wp-content/themes/jannah-child/functions.php":[(1,27)],
}
try:
 for name,ranges in targets.items():
  data=bytearray()
  try:
   def take(chunk):
    if len(data)+len(chunk)>240000:raise ValueError("oversize")
    data.extend(chunk)
   f.retrbinary("RETR "+root+name,take)
  except Exception as e:
   print("UNAVAILABLE",name,type(e).__name__);continue
  lines=data.decode("utf-8","replace").splitlines()
  print("FILE",name,"LINES",len(lines))
  for start,end in ranges:
   for n in range(start,min(end,len(lines))+1):
    line=lines[n-1]
    if not line.strip():continue
    if re.search(r"(password|secret|token|api.?key|authorization|license.?key|private.?key)",line,re.I):continue
    print("SOURCE",json.dumps({"file":name,"line":n,"content":line[:220]},ensure_ascii=False))
 print("DONE target context only")
finally:
 try:f.quit()
 except Exception:f.close()
