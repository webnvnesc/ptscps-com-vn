#!/usr/bin/env python3
"""Read-only SR7 exact image extraction source excerpt."""
import ftplib,os,json
from urllib.parse import urlsplit
u=urlsplit(os.environ["FTP_SERVER"] if "://" in os.environ["FTP_SERVER"] else "//"+os.environ["FTP_SERVER"])
f=ftplib.FTP_TLS(timeout=30);f.connect(u.hostname,u.port or 21);f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p()
try:
 for name,a,b in [("includes/output.class.php",1320,1390),("includes/slider.class.php",130,172),("includes/slide.class.php",2200,2255)]:
  data=bytearray();f.retrbinary("RETR /domains/ptscps.com.vn/public_html/wp-content/plugins/revslider/"+name,data.extend);lines=data.decode('utf8','replace').splitlines()
  print("SR7_EXCERPT "+json.dumps({"file":name,"lines":"\n".join(f"{i+1}: {lines[i]}" for i in range(a-1,min(b,len(lines))))},ensure_ascii=False),flush=True)
finally:
 try:f.quit()
 except:f.close()
