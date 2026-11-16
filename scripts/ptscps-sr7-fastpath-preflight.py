#!/usr/bin/env python3
"""PTSCPS SR7 fastpath preflight: read-only .htaccess + Slider Revolution hooks.

Does not write or print credentials; restricts read source to known plugin files.
"""
import ftplib,hashlib,json,os,re,urllib.request
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html"
host=os.environ["FTP_SERVER"];u=urlsplit(host if "://" in host else "//"+host)
ftp=ftplib.FTP_TLS(timeout=25)
ftp.connect(u.hostname,u.port or 21,timeout=25)
ftp.auth();ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
ftp.prot_p();ftp.set_pasv(True)
def read(path,limit=700000):
 chunks=[];size=0
 def app(b):
  nonlocal size
  size+=len(b)
  if size>limit:raise ValueError("Oversized")
  chunks.append(b)
 ftp.retrbinary("RETR "+path,app)
 return b"".join(chunks).decode("utf-8","replace")
def listdir(path):
 try:return list(ftp.mlsd(path))
 except ftplib.all_errors:return []
def sample(path,terms,maxhits=50):
 try:s=read(ROOT+"/"+path)
 except Exception as ex:
  print("FILE_UNAVAILABLE "+json.dumps({"file":path,"error":type(ex).__name__}),flush=True)
  return
 lines=s.splitlines();hits=[]
 for i,line in enumerate(lines):
  if re.search(terms,line,re.I):
   if re.search(r"secret|password|credential|license|token|api.?key|nonce",line,re.I):continue
   hits.append({"at":i+1,"code":line.strip()[:300]})
 print("SOURCE "+json.dumps({"file":path,"bytes":len(s),"lines":len(lines),"matches":len(hits),
   "hits":hits[:maxhits]},ensure_ascii=False),flush=True)
try:
 ftp.cwd(ROOT)
 names={x.rstrip("/").split("/")[-1] for x in ftp.nlst()}
 assert {"wp-content","wp-admin","wp-includes","index.php",".htaccess"}.issubset(names),"Unexpected root"
 text=read(ROOT+"/.htaccess",95000)
 lines=text.splitlines()
 print("HTACCESS "+json.dumps({"bytes":len(text),"sha256":hashlib.sha256(text.encode()).hexdigest()[:16],
   "lines":len(lines),"markers":[x for x in lines if x.startswith("# BEGIN ") or x.startswith("# END ")][:35],
   "rules":[{"ln":i+1,"code":line.strip()[:260]} for i,line in enumerate(lines)
            if re.search(r"RewriteRule|RewriteCond|RewriteEngine|IfModule|AddType|SetHandler|supercache|WordPress",line,re.I)][:105]
 },ensure_ascii=False),flush=True)
 for path in ["wp-content/plugins","wp-content/mu-plugins"]:
  listing=listdir(ROOT+"/"+path)
  print("DIR "+json.dumps({"path":path,"matches":[n for n,m in listing
                if re.search(r"rev|slider|sr7|fastpath",n,re.I)],"total":len(listing)}),flush=True)
 entries=listdir(ROOT+"/wp-content/plugins/revslider")
 print("REVSLIDER_DIR "+json.dumps({"entries":[[n,m.get("type","")] for n,m in entries][:85]}),flush=True)
 for p in [
  "wp-content/plugins/revslider/revslider.php",
  "wp-content/plugins/revslider/includes/slider.class.php",
  "wp-content/plugins/revslider/includes/slide.class.php",
  "wp-content/plugins/revslider/includes/operations.class.php",
  "wp-content/plugins/revslider/includes/functions.class.php",
  "wp-content/plugins/revslider/includes/classes/Slider.php",
  "wp-content/plugins/revslider/includes/classes/Slide.php",
  "wp-content/plugins/revslider/includes/classes/REST.php",
  "wp-content/plugins/revslider/public/revslider-front.class.php",
  "wp-content/plugins/revslider/admin/revslider-admin.class.php",
 ]:
  sample(p,r"register_rest_route|rest_api_init|do_action\s*\(|add_action\s*\(|sliderrevolution/sliders|slideid|cache|update_slide|update_slider|saveSlide|saveSlider|save_slide|save_slider|update_option",35)
 for n in [2,3]:
  url=f"https://ptscps.com.vn/wp-json/sliderrevolution/sliders/1?srengine=7&slideid={n}"
  req=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":"Mozilla/5.0 (compatible; PTSCPS-SR7-Fastpath-Preflight)"})
  try:
   with urllib.request.urlopen(req,timeout=35) as resp:
    raw=resp.read(35000);obj=json.loads(raw)
    print("PAYLOAD "+json.dumps({"id":n,"status":resp.status,"bytes":len(raw),
      "digest":hashlib.sha256(raw).hexdigest()[:16],"keys":list(obj)[:35],
      "cacheControl":resp.headers.get("Cache-Control"),
      "contentType":resp.headers.get("Content-Type"),
      "jsonType":type(obj).__name__}),flush=True)
  except Exception as e:print("PAYLOAD_ERROR "+json.dumps({"id":n,"err":str(e)[:120]}),flush=True)
finally:
 try:ftp.quit()
 except Exception:ftp.close()
