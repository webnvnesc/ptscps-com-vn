#!/usr/bin/env python3
"""Targeted FTPS source inspection for native header-logo rendering."""
import ftplib,os,re,json
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html/wp-content/themes/jannah"
u=os.environ["FTP_SERVER"];u=urlsplit(u if "://" in u else "//"+u)
f=ftplib.FTP_TLS(timeout=25);f.connect(u.hostname,u.port or 21,timeout=25);f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p();f.set_pasv(True)
folders=["","/templates","/templates/header","/inc","/framework","/framework/parts","/parts","/inc/header"]
try:
 for d in folders:
  try:
   names=[x.rsplit("/",1)[-1] for x in f.nlst(ROOT+d)]
   print("JANN_FAST_FOLDER "+json.dumps({"folder":d or "/","files":[n for n in names if "logo" in n.lower() or "header" in n.lower() or d in ("","/templates/header")][:100]}),flush=True)
   if d in ("","/templates/header") or any("logo" in n.lower() for n in names):
    selected=[n for n in names if n.endswith(".php") and (d=="/templates/header" or "logo" in n.lower() or "header" in n.lower())][:28]
    for name in selected:
     b=bytearray()
     try:f.retrbinary("RETR "+ROOT+d+"/"+name,b.extend)
     except Exception:continue
     if len(b)>220000:continue
     rows=b.decode("utf-8","replace").splitlines()
     hits=[i for i,s in enumerate(rows) if re.search(r"tie-logo-img|tie-logo-picture|logo-container|tielabs.*logo|logo.*filter|filter.*logo",s,re.I)]
     if hits:
      print("JANN_FAST_HITS "+json.dumps({"path":d+"/"+name,"hits":[{"line":i+1,"around":rows[max(0,i-3):min(len(rows),i+6)]} for i in hits[:12]]}),flush=True)
  except Exception as e:print("JANN_FAST_FAIL "+json.dumps({"folder":d,"type":type(e).__name__}),flush=True)
finally:
 try:f.quit()
 except Exception:f.close()
