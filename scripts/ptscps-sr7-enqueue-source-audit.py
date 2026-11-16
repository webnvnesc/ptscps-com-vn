#!/usr/bin/env python3
"""Read-only inspect current SR7 frontend asset registration and detection hooks.
Only public plugin PHP sources, no secret config or user content.
"""
import ftplib,os,json,re,collections
from urllib.parse import urlsplit
root="/domains/ptscps.com.vn/public_html"
h=os.environ["FTP_SERVER"];u=urlsplit(h if "://" in h else "//"+h)
f=ftplib.FTP_TLS(timeout=30);f.connect(u.hostname,u.port or 21,timeout=30)
f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
f.prot_p();f.set_pasv(True)
def read(p):
 b=bytearray()
 def take(x):
  if len(b)+len(x)>380000:raise ValueError("large source")
  b.extend(x)
 f.retrbinary("RETR "+root+"/"+p,take)
 return b.decode("utf-8","replace")
files=["wp-content/plugins/revslider/public/revslider-front.class.php",
       "wp-content/plugins/revslider/revslider.php",
       "wp-content/themes/jannah-child/functions.php"]
regex=re.compile(r"(wp_enqueue_scripts|wp_enqueue_script|wp_register_script|wp_dequeue_script|wp_deregister_script|sr7\.js|tptools\.js|tp-tools|revslider.*script|add_actions|enqueue.*script|js_add_header_scripts|revslider.*widget|has_shortcode|elementor|is_admin|is_front_page|is_home|wp_footer|wp_head|print.*script|script_loader_tag)",re.I)
try:
 for p in files:
  s=read(p);lines=s.splitlines()
  picks=[]
  for i,l in enumerate(lines):
   if regex.search(l):
    if re.search(r"api.?key|password|token|secret|license|authorization|wp-config",l,re.I):continue
    picks.append(i)
  indices=set()
  for i in picks:
   for k in range(max(0,i-4),min(len(lines),i+7)):indices.add(k)
  selected=sorted(indices)
  print("SR7_ASSET_SOURCE "+json.dumps({"path":p,"length":len(lines),"hitCount":len(picks),
    "lines":[{"line":i+1,"source":lines[i][:280]} for i in selected[:450]
      if not re.search(r"api.?key|password|token|secret|license|authorization|wp-config",lines[i],re.I)]},ensure_ascii=False),flush=True)
 # Discover PHP under public and includes related to enqueue, scanning at most 150.
 paths=[]
 for base in ["wp-content/plugins/revslider/public","wp-content/plugins/revslider/includes"]:
  q=[(base,0)]
  while q and len(paths)<180:
   p,depth=q.pop(0)
   try:entries=list(f.mlsd(root+"/"+p))
   except Exception:continue
   for name,meta in entries:
    if name.startswith(".") or name in ["vendor","assets","node_modules","cache","css","js","fonts"]:continue
    dest=p+"/"+name
    if meta.get("type")=="dir" and depth<2:q.append((dest,depth+1))
    elif name.endswith(".php") and int(meta.get("size",0) or 0)<380000:paths.append(dest)
 match=[]
 for p in paths:
  if p in files:continue
  try:s=read(p)
  except Exception:continue
  arr=s.splitlines()
  hits=[(i,l) for i,l in enumerate(arr) if re.search(r"tptools\.js|sr7\.js|wp_register_script|wp_enqueue_script|jquery|elementor.*slider|has_shortcode|is_singular",l,re.I)]
  if hits:match.append({"path":p,"hits":[{"line":i+1,"src":l.strip()[:220]} for i,l in hits[:18]
   if not re.search(r"api.?key|password|token|secret|license",l,re.I)]})
 print("SR7_OTHER_FILES "+json.dumps({"scanned":len(paths),"matches":match[:40]},ensure_ascii=False),flush=True)
finally:
 try:f.quit()
 except Exception:f.close()
