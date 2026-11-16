#!/usr/bin/env python3
"""Find native Jannah Page 5 'hide featured image' setting, no writes.

Read-only WordPress admin HTML inspection (must have valid credentials)
and narrow FTPS theme source snippet around tie_get_postdata.
Never logs cookies, passwords, nonces, tokens or post editor content.
"""
import ftplib, http.cookiejar, json, os, re, ssl, urllib.parse, urllib.request
from html.parser import HTMLParser
HOST="https://ptscps.com.vn"
ROOT="/domains/ptscps.com.vn/public_html/"
class Fields(HTMLParser):
 def __init__(self):super().__init__();self.controls=[];self.labels=[]
 def handle_starttag(self,t,attrs):
  a=dict(attrs)
  if t in ("input","select","textarea"):
   name=a.get("name","");id_=a.get("id","")
   if any(s in (name+" "+id_).lower() for s in ("featured","tie_","post_featured")):
    self.controls.append({k:v for k,v in a.items() if k in ("name","id","type","checked","class")})
  if t in ("label",) and ("featured" in (a.get("for","")).lower()):
   self.labels.append({"for":a.get("for","")})
def wp_admin():
 user=os.environ.get("WP_ADMIN_USERNAME","");secret=os.environ.get("WP_ADMIN_PASSWORD","")
 if not user or not secret:
  print("WP_ADMIN",json.dumps({"status":"no_admin_credentials"}));return
 jar=http.cookiejar.CookieJar()
 opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar),urllib.request.HTTPSHandler(context=ssl.create_default_context()))
 def get(path):
  with opener.open(urllib.request.Request(HOST+path,headers={"User-Agent":"Mozilla/5.0 (compatible; PTSCPS-FeaturedOptionAudit/1.0)"}),timeout=28) as r:
   return r.url,r.read(1700000).decode("utf-8","replace")
 try:
  get("/wp-login.php")
  body=urllib.parse.urlencode({"log":user,"pwd":secret,"wp-submit":"Log In","redirect_to":HOST+"/wp-admin/post.php?post=5&action=edit","testcookie":"1"}).encode("utf-8")
  url,res=get("/wp-admin/") if False else (None,None)
  req=urllib.request.Request(HOST+"/wp-login.php",data=body,headers={"Content-Type":"application/x-www-form-urlencoded","User-Agent":"Mozilla/5.0"})
  with opener.open(req,timeout=30) as response:response.read(350000)
  url,html=get("/wp-admin/post.php?post=5&action=edit")
  if not url.startswith(HOST+"/wp-admin/post.php"):
   print("WP_ADMIN",json.dumps({"status":"login_or_access_restricted","finalPath":urllib.parse.urlsplit(url).path}));return
  p=Fields();p.feed(html)
  keys=["tie_hide_page_featured","tie_hide_title","tie_post_options","tie-hide-page-featured"]
  result={"status":"accessible","finalPath":urllib.parse.urlsplit(url).path,
   "isPageEditor":"id=\"post\"" in html and "id=\"post_ID\"" in html,
   "flagMentions":{k:html.lower().count(k.lower()) for k in keys},
   "featureControls":p.controls[:85],"featuredLabels":p.labels[:25],
   "gutenberg":"wp-edit-post" in html,"classicEditor":"id=\"poststuff\"" in html}
  print("WP_ADMIN",json.dumps(result,ensure_ascii=False),flush=True)
 except Exception as e:
  print("WP_ADMIN",json.dumps({"status":"exception","type":type(e).__name__,"error":str(e)[:150]}),flush=True)
def inspect_source():
 host=os.environ.get("FTP_SERVER","");user=os.environ.get("FTP_USERNAME");pw=os.environ.get("FTP_PASSWORD")
 if not all((host,user,pw)):
  print("THEME_SOURCE",json.dumps({"status":"no_ftps_creds"}));return
 u=urllib.parse.urlsplit(host if "://" in host else "//"+host)
 f=ftplib.FTP_TLS(timeout=26)
 try:
  f.connect(u.hostname,u.port or 21,timeout=26);f.auth();f.login(user,pw);f.prot_p()
  for rel in ["wp-content/themes/jannah/framework/functions/post-functions.php",
             "wp-content/themes/jannah/framework/classes/class-tielabs-filters.php",
             "wp-content/themes/jannah/templates/page-head.php"]:
   data=bytearray()
   try:
    def add(b):
     if len(data)+len(b)>380000:raise ValueError("oversized")
     data.extend(b)
    f.retrbinary("RETR "+ROOT+rel,add)
   except Exception:continue
   lines=data.decode("utf-8","replace").splitlines()
   hits=[i for i,x in enumerate(lines) if "function tie_get_postdata" in x or "tie_hide_page_featured" in x or "hide_page_featured" in x]
   for i in hits[:12]:
    span=[{"line":j+1,"code":lines[j][:260]} for j in range(max(0,i-8),min(i+25,len(lines))) if not re.search("password|secret|api.?key|authorization",lines[j],re.I)]
    print("THEME_SOURCE",json.dumps({"file":rel,"hitAt":i+1,"snippet":span},ensure_ascii=False),flush=True)
 finally:
  try:f.quit()
  except Exception:f.close()
if __name__=="__main__":
 wp_admin()
 inspect_source()
