#!/usr/bin/env python3
"""Privacy-preserving FTPS logging capability probe, no raw logs downloaded."""
import ftplib,os,json
from urllib.parse import urlsplit
server=os.environ.get("FTP_SERVER","")
credentials=(os.environ.get("FTP_USERNAME",""),os.environ.get("FTP_PASSWORD",""))
root="/domains/ptscps.com.vn"
p=urlsplit(server if "://" in server else "//"+server)
if not p.hostname or not all(credentials):raise SystemExit("Missing FTPS credentials")
ftp=ftplib.FTP_TLS()
ftp.connect(p.hostname,p.port or 21,timeout=25)
ftp.auth();ftp.login(*credentials);ftp.prot_p();ftp.set_pasv(True)
paths=[
 root+"/logs",root+"/log",root+"/public_html/logs",root+"/public_html",
 "/logs/ptscps.com.vn"
]
report=[]
try:
 for path in paths:
  item={"location":path.replace(root,"<domain>"),"reachable":False,"error_logs":False,"access_logs":False,
        "apache_config":False}
  try:
   rows=list(ftp.mlsd(path,facts=["type","size"]))
   names={name.lower() for name,_ in rows}
   item["reachable"]=True
   item["error_logs"]=any("error" in n and ("log" in n or ".txt" in n) for n in names)
   item["access_logs"]=any("access" in n and ("log" in n or ".txt" in n) for n in names)
   item["apache_config"]=bool(names.intersection({"httpd.conf","apache2.conf"}))
  except ftplib.all_errors:
   try:
    ftp.cwd(path)
    names={x.split("/")[-1].lower() for x in ftp.nlst()}
    item["reachable"]=True
    item["error_logs"]=any("error" in n and ("log" in n or ".txt" in n) for n in names)
    item["access_logs"]=any("access" in n and ("log" in n or ".txt" in n) for n in names)
    item["apache_config"]=bool(names.intersection({"httpd.conf","apache2.conf"}))
   except ftplib.all_errors:
    pass
  report.append(item)
  print("LOG_CAPABILITY "+json.dumps(item),flush=True)
 print("SUMMARY "+json.dumps({"apache_error_log_available":any(x["error_logs"] for x in report),
                             "note":"Directory listings only; no log body, IP, cookie or secrets accessed"}))
finally:
 try:ftp.quit()
 except Exception:ftp.close()
