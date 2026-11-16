#!/usr/bin/env python3
"""Fast targeted Jannah featured figure template localization, read-only."""
import ftplib,os,re,json
from urllib.parse import urlsplit
server=os.environ["FTP_SERVER"]; u=urlsplit(server if "://" in server else "//"+server)
f=ftplib.FTP_TLS(timeout=20);f.connect(u.hostname,u.port or 21,timeout=20);f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p()
root="/domains/ptscps.com.vn/public_html/wp-content/themes/"
base=root+"jannah/"
candidates=["page.php","single.php","templates/single-post.php","templates/single-post/featured.php","templates/single-post/content.php","templates/featured.php","templates/page-head.php","templates/single-post/featured-image.php","templates/single-post/post-featured.php","templates/single-post/featured-media.php","templates/single-post/featured-area.php","templates/post-layouts/featured.php","framework/parts/post-components.php","framework/parts/single.php","inc/theme-setup.php","functions.php"]
def fetch(p):
 chunks=[];size=0
 def app(b):
  nonlocal size
  size+=len(b)
  if size>320000:raise ValueError("large")
  chunks.append(b)
 try:f.retrbinary("RETR "+p,app)
 except Exception:return None
 return b"".join(chunks).decode("utf-8","replace")
def listing(p):
 try:
  a=[(n,v.get("type")) for n,v in f.mlsd(p) if re.fullmatch("[a-zA-Z0-9._-]+",n)]
  return a
 except Exception:return []
try:
 for dir in ["jannah","jannah/templates","jannah/templates/single-post","jannah/templates/post-layouts","jannah/framework","jannah/framework/parts","jannah-child"]:
  print("FAST_LIST",json.dumps({"dir":dir,"children":listing(root+dir)[:130]}),flush=True)
 for rel in candidates:
  txt=fetch(base+rel)
  if not txt:continue
  if rel in ("templates/single-post/featured.php","templates/single-post/content.php","templates/featured.php","templates/page-head.php"):
   all_lines=txt.splitlines()
   for i,src in enumerate(all_lines):
    if rel.endswith("featured.php") and i>=175:break
    if re.search(r"password|secret|token|api.?key|license.?key",src,re.I):continue
    print("SOURCE_LINE",json.dumps({"file":rel,"n":i+1,"code":src[:260]},ensure_ascii=False),flush=True)
  terms=["single-featured-image","featured-area","hide_featured","show_featured","get_the_post_thumbnail","the_post_thumbnail","get_template_part"]
  lines=txt.splitlines()
  picks=[i for i,x in enumerate(lines) if any(term.lower() in x.lower() for term in terms)]
  print("FAST_FILE",json.dumps({"file":rel,"lines":len(lines),"hits":len(picks)}),flush=True)
  for n in picks[:24]:
   print("FAST_HIT",json.dumps({"file":rel,"line":n+1,"surrounding":[{"n":i+1,"line":lines[i][:250]} for i in range(max(0,n-3),min(len(lines),n+4))]}),flush=True)
finally:
 try:f.quit()
 except:f.close()
