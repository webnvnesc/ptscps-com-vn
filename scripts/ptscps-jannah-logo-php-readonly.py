#!/usr/bin/env python3
"""Read-only source audit to locate Jannah theme logo markup and attachment hooks.

Print only safe PHP source snippets around exact logo selectors, not configuration.
"""
import ftplib,os,re,json
from urllib.parse import urlsplit
root="/domains/ptscps.com.vn/public_html/wp-content/themes/jannah"
u=os.environ["FTP_SERVER"];u=urlsplit(u if "://" in u else "//"+u)
f=ftplib.FTP_TLS(timeout=30)
f.connect(u.hostname,u.port or 21,timeout=30);f.auth()
f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
f.prot_p();f.set_pasv(True)
patterns=[re.compile(x,re.I) for x in (r"tie-logo-img",r"tie-logo-picture",r"get_custom_logo\s*\(",r"get_custom_logo_image",r"tielabs.*logo.*html",r"get.*logo.*picture")]
needles=['logo','header','theme-setup','logo-structure','tielabs']
limit=230
scanned=0
matches=[]
def safe_list(path):
 try:
  ret=list(f.mlsd(path))
  return [(a,b.get("type","")) for a,b in ret if a not in ('.','..')]
 except Exception:
  try:return [(x.rsplit("/",1)[-1], "?") for x in f.nlst(path) if x.rsplit("/",1)[-1] not in (".","..")]
  except Exception:return []
def read(path):
 b=bytearray()
 def put(chunk):
  if len(b)+len(chunk)>350000:raise ValueError("large file")
  b.extend(chunk)
 f.retrbinary("RETR "+path,put)
 return b.decode("utf-8","replace")
try:
 q=[(root,0)]
 while q and scanned<limit:
  folder,depth=q.pop(0)
  items=safe_list(folder)
  for name,typ in items:
   path=folder+"/"+name
   if typ=="dir" or (typ=="?" and "." not in name):
    if depth>=4:continue
    if depth==0 and name not in ("templates","inc","framework","parts","assets"):continue
    if depth>=1 and any(seg in path for seg in ("/assets","/vendor","/languages","/fonts")):continue
    q.append((path,depth+1))
    continue
   if not name.endswith(".php"):continue
   priority=any(n in path.lower() for n in needles)
   if not priority and scanned>100:continue
   try:
    txt=read(path);scanned+=1
   except Exception:continue
   lines=txt.splitlines()
   locs=[i for i,line in enumerate(lines) if any(p.search(line) for p in patterns)]
   if locs:
    snippets=[]
    for i in locs[:12]:
     lo=max(0,i-5);hi=min(len(lines),i+7)
     snippets.append({"line":i+1,"context":[{"line":j+1,"text":lines[j][:280]} for j in range(lo,hi)]})
    matches.append({"file":path[len(root)+1:],"hits":snippets})
    print("JANN_LOGO_SOURCE "+json.dumps(matches[-1],ensure_ascii=False),flush=True)
 print("JANN_LOGO_SUMMARY "+json.dumps({"filesScanned":scanned,"matchedFiles":len(matches)}),flush=True)
finally:
 try:f.quit()
 except Exception:f.close()
