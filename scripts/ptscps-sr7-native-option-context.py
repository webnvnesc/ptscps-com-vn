#!/usr/bin/env python3
"""Inspect exact native SR7 option loading and PHP enqueue condition, no writes."""
import ftplib,os,json,re
from urllib.parse import urlsplit
u=urlsplit(os.environ["FTP_SERVER"] if "://" in os.environ["FTP_SERVER"] else "//"+os.environ["FTP_SERVER"])
f=ftplib.FTP_TLS(timeout=25);f.connect(u.hostname,u.port or 21,timeout=25)
f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p();f.set_pasv(True)
p="/domains/ptscps.com.vn/public_html/"
paths={
 "wp-content/plugins/revslider/public/revslider-front.class.php":[(175,214),(664,685)],
 "wp-content/plugins/revslider/includes/functions.class.php":[(1,150)],
 "wp-content/plugins/revslider/includes/functions.class.php":[(1210,1360)],
 "wp-content/plugins/revslider/includes/framework.class.php":[(1,180)],
}
try:
 for name,ranges in paths.items():
  data=bytearray()
  try:f.retrbinary("RETR "+p+name,lambda b:data.extend(b) if len(data)<500000 else None)
  except ftplib.all_errors:continue
  lines=data.decode("utf-8","replace").splitlines()
  for start,end in ranges:
   print("CODE "+json.dumps({"file":name,"start":start,"end":end,"text":"\n".join(
    f"{i+1:04d} "+lines[i] for i in range(start-1,min(end,len(lines)))
    if not re.search(r"password|secret|license|token|authorization|api.?key",lines[i],re.I)
   )[:22000]},ensure_ascii=False),flush=True)
finally:
 try:f.quit()
 except:f.close()
