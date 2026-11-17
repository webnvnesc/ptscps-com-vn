#!/usr/bin/env python3
"""Inspect SR7 PHP classes over existing read-only FTPS to find first live slide (never writes)."""
import os,ftplib,re,json
from urllib.parse import urlsplit
root="/domains/ptscps.com.vn/public_html/wp-content/plugins/revslider/"
u=urlsplit(os.environ["FTP_SERVER"] if "://" in os.environ["FTP_SERVER"] else "//"+os.environ["FTP_SERVER"])
f=ftplib.FTP_TLS(timeout=30);f.connect(u.hostname,u.port or 21,timeout=30);f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p();f.set_pasv(True)
dirs=["","includes/","public/","admin/","includes/objects/","includes/classes/"]
try:
 for d in dirs:
  try:
   files=f.nlst(root+d)
   print("SR7_LIST "+json.dumps({"dir":d,"files":[x.split("/")[-1] for x in files][:85]}),flush=True)
  except Exception as e:print("SR7_LIST_ERR "+json.dumps({"dir":d,"error":str(e)[:140]}),flush=True)
 targets=["includes/slider.class.php","includes/slide.class.php","includes/output.class.php","includes/functions.class.php","public/revslider-front.class.php","includes/framework.class.php","includes/objects.class.php"]
 patt=re.compile(r"(function\s+(?:get_slides|get_slide|initByID|get_params|get_param|get_slide_order|get_slider_order|get_bg|get_data|get_slides_for_output|get_slides_for_id|get_slides_from_posts|get_slider_by_alias|get_all_slides|load_by_id|load_by_alias|get_slides_sortby|set_slides|init_by_id|get_slider))\b",re.I)
 for name in targets:
  data=bytearray()
  try:f.retrbinary("RETR "+root+name,lambda b: data.extend(b) if len(data)<800000 else None)
  except Exception as e:
   print("SR7_MISSING "+json.dumps({"path":name,"error":str(e)[:120]}));continue
  lines=data.decode('utf-8','replace').splitlines()
  matches=[]
  for i,line in enumerate(lines):
   if patt.search(line):
    excerpt="\n".join(str(j+1)+": "+lines[j] for j in range(max(0,i-2),min(len(lines),i+22)))
    matches.append({"line":i+1,"snippet":excerpt[:4100]})
  print("SR7_CLASS "+json.dumps({"path":name,"bytes":len(data),"matches":matches[:18]},ensure_ascii=False),flush=True)
finally:
 try:f.quit()
 except:f.close()
