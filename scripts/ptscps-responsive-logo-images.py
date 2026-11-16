#!/usr/bin/env python3
"""Create two correctly proportioned JPEG logo assets via FTPS, never overwrite unmanaged files."""
import ftplib,hashlib,io,os,sys,uuid
from urllib.parse import urlsplit
from PIL import Image,ImageOps
from pathlib import Path
ROOT="/domains/ptscps.com.vn/public_html/wp-content/uploads/2024/08"
u=os.environ["FTP_SERVER"];u=urlsplit(u if "://" in u else "//"+u)
f=ftplib.FTP_TLS(timeout=28);f.connect(u.hostname,u.port or 21,timeout=28);f.auth()
f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p();f.set_pasv(True)
names={320:"logo-2024-320x107-ptscps.jpg",640:"logo-2024-640x214-ptscps.jpg"}
def read(p):
 b=bytearray();f.retrbinary("RETR "+p,b.extend);return bytes(b)
try:
 f.cwd(ROOT)
 source=read(ROOT+"/logo-2024.jpg")
 with Image.open(io.BytesIO(source)) as im:
  if im.size!=(2126,712) or im.format!="JPEG":
   raise RuntimeError("Original logo changed dimensions or format")
  image=ImageOps.exif_transpose(im).convert("RGB")
  for width,name in names.items():
   height=round(width*image.height/image.width)
   if (width,height) not in ((320,107),(640,214)):
    raise RuntimeError("Unexpected target dimensions")
   resized=image.resize((width,height),Image.Resampling.LANCZOS)
   output=io.BytesIO()
   resized.save(output,format="JPEG",quality=86,optimize=True,progressive=True)
   data=output.getvalue()
   if len(data)>60000:
    raise RuntimeError("New image unexpectedly large")
   target=ROOT+"/"+name
   try:existing=read(target)
   except ftplib.error_perm as exc:
    if not str(exc).startswith("550"):raise
    existing=None
   if existing is not None:
    if existing!=data:raise RuntimeError("Refusing overwrite of existing different asset: "+name)
    print("LOGO_IMAGE_ALREADY_CURRENT "+name+" "+str(len(data)),flush=True)
    continue
   tmp=ROOT+"/."+name+"."+uuid.uuid4().hex[:10]+".tmp"
   f.storbinary("STOR "+tmp,io.BytesIO(data))
   if read(tmp)!=data:raise RuntimeError("Staged asset checksum mismatch")
   f.rename(tmp,target)
   if read(target)!=data:raise RuntimeError("Uploaded asset checksum mismatch")
   print("LOGO_IMAGE_CREATED "+name+" "+str(width)+"x"+str(height)+" "+str(len(data))+" sha="+hashlib.sha256(data).hexdigest()[:16],flush=True)
finally:
 try:f.quit()
 except Exception:f.close()
