#!/usr/bin/env python3
"""Read-only exact SR7 model code excerpts for first-slide background. No secrets logged."""
import ftplib,os,re,json
from urllib.parse import urlsplit
u=urlsplit(os.environ["FTP_SERVER"] if "://" in os.environ["FTP_SERVER"] else "//"+os.environ["FTP_SERVER"])
f=ftplib.FTP_TLS(timeout=30);f.connect(u.hostname,u.port or 21);f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p()
root="/domains/ptscps.com.vn/public_html/wp-content/plugins/revslider/includes/"
targets=[
 ("slide.class.php",[r"function get_slides_by_slider_id",r"function get_bg",r"function get_image",r"function get_slide_image",r"function get_background"]),
 ("slider.class.php",[r"function get_slides_for_output",r"function get_parent_slides",r"function get_param",r"function get_slides\("]),
 ("output.class.php",[r"function get_slide_bg",r"function get_slides\(",r"get_param\(\['bg'",r"get_param\('bg'",r"bg.*image",r"image.*bg",r"noscript"])
]
try:
 for name,patterns in targets:
  b=bytearray();f.retrbinary("RETR "+root+name,lambda x:b.extend(x))
  lines=b.decode('utf8','replace').splitlines()
  marks=[]
  for p in patterns:
   matches=[i for i,l in enumerate(lines) if re.search(p,l,re.I)]
   for i in matches[:4]:
    if any(abs(i-o)<18 for o in marks):continue
    marks.append(i)
    print("SR7_SOURCE "+json.dumps({"file":name,"pattern":p,"line":i+1,"text":"\n".join(f"{j+1}: {lines[j]}" for j in range(max(0,i-7),min(len(lines),i+42)))[:6200]},ensure_ascii=False),flush=True)
finally:
 try:f.quit()
 except:f.close()
