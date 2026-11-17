#!/usr/bin/env python3
"""Safely prepare, enable and revert an exact-3-banner Apache WebP negotiation pilot.

Uses only FTPS secrets. Does not change original JPEGs, the homepage, WP DB,
Elementor, SR7 config, CSS, JS, or global .htaccess. Refuses unexpected files.
prepare: create only 3 exact jpg.webp copies, verify hashes via FTPS.
enable: atomically add exact-owned .htaccess to 2019/10 (must be absent).
rollback: remove owned rule first then the exact generated files, preserving
original JPGs. No other uploads touched.
"""
import ftplib,hashlib,io,os,sys,secrets
from pathlib import Path
from urllib.parse import urlsplit
from PIL import Image,ImageStat,ImageChops

ROOT="/domains/ptscps.com.vn/public_html"
DIR=ROOT+"/wp-content/uploads/2019/10"
NAMES=("ruby-banner.jpg","banner2.jpg","banner3.jpg")
MARK="# BEGIN PTSCPS_WEBP_BANNERS_PILOT_v1"
RULES=r"""# BEGIN PTSCPS_WEBP_BANNERS_PILOT_v1
# Only the exact three 2019/10 SR7 banner JPEG filenames.
# Existing JPG public URL and WP Media Library references are unchanged.
<IfModule mod_mime.c>
  AddType image/webp .webp
</IfModule>
<IfModule mod_headers.c>
  <FilesMatch "^(ruby-banner|banner2|banner3)\.jpg(\.webp)?$">
    Header merge Vary Accept
  </FilesMatch>
</IfModule>
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTP_ACCEPT} image/webp [NC]
  RewriteCond %{REQUEST_FILENAME}.webp -f
  RewriteRule ^(ruby-banner|banner2|banner3)\.jpg$ $1.jpg.webp [L,T=image/webp]
</IfModule>
# END PTSCPS_WEBP_BANNERS_PILOT_v1
"""
def sha(blob):return hashlib.sha256(blob).hexdigest()
def ftp_conn():
    host=os.environ["FTP_SERVER"]
    parsed=urlsplit(host if "://" in host else "//"+host)
    f=ftplib.FTP_TLS(timeout=30)
    f.connect(parsed.hostname,parsed.port or 21,timeout=30)
    f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
    f.prot_p();f.set_pasv(True)
    f.cwd(ROOT)
    names={p.rsplit("/",1)[-1] for p in f.nlst()}
    if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(names):
        raise RuntimeError("Unexpected WordPress webroot")
    return f
def read(f,path):
    out=bytearray()
    def receive(b):
        if len(out)+len(b)>16_000_000:raise RuntimeError("FTP file unexpectedly large")
        out.extend(b)
    f.retrbinary("RETR "+path,receive)
    return bytes(out)
def optional(f,path):
    try:return read(f,path)
    except ftplib.error_perm as e:
        if str(e).startswith("550"):return None
        raise
def atomic_write(f,path,blob):
    stage=DIR+"/.ptscps-webp-"+secrets.token_hex(5)+".tmp"
    f.storbinary("STOR "+stage,io.BytesIO(blob))
    if sha(read(f,stage))!=sha(blob):raise RuntimeError("FTP stage mismatch")
    f.rename(stage,path)
    if sha(read(f,path))!=sha(blob):raise RuntimeError("FTP deployed mismatch")
def encode(jpeg):
    im=Image.open(io.BytesIO(jpeg))
    if im.format!="JPEG" or im.width!=800 or im.height!=500:
        raise RuntimeError("Native live SR7 banner is not the audited 800x500 JPEG")
    output=io.BytesIO()
    im.convert("RGB").save(output,format="WEBP",quality=85,method=6)
    data=output.getvalue()
    if not data.startswith(b"RIFF") or data[8:12]!=b"WEBP":
        raise RuntimeError("Produced invalid WebP")
    decoded=Image.open(io.BytesIO(data)).convert("RGB")
    err=sum(ImageStat.Stat(ImageChops.difference(im.convert("RGB"),decoded)).mean)/3
    if len(data)>=len(jpeg)*0.86 or err>7.0:
        raise RuntimeError("WebP quality or size safety threshold failed")
    return data,round(err,3)
def ensure_images(f):
    rows=[]
    for name in NAMES:
        native=read(f,DIR+"/"+name)
        webp,mae=encode(native)
        dest=DIR+"/"+name+".webp"
        old=optional(f,dest)
        if old is not None and sha(old)!=sha(webp):
            raise RuntimeError("Refusing to overwrite existing non-pilot WebP asset "+name)
        if old is None:atomic_write(f,dest,webp)
        if sha(read(f,dest))!=sha(webp):raise RuntimeError("Invalid output "+name)
        rows.append({"image":name,"original":len(native),"webp":len(webp),
                     "savingPct":round((1-len(webp)/len(native))*100,2),
                     "mae":mae})
    return rows
def rollback(f):
    ht=optional(f,DIR+"/.htaccess")
    if ht is not None:
        if ht!=RULES.encode("utf-8"):
            raise RuntimeError("Unmanaged .htaccess exists: refusing to touch pilot files")
        f.delete(DIR+"/.htaccess")
        if optional(f,DIR+"/.htaccess") is not None:
            raise RuntimeError("Could not disable image-rewrite rule")
        print("WEBP_PILOT_RULES_DISABLED",flush=True)
    count=0
    for name in NAMES:
        jpeg=read(f,DIR+"/"+name)
        expected,_=encode(jpeg)
        dest=DIR+"/"+name+".webp"
        existing=optional(f,dest)
        if existing is None:continue
        if sha(existing)!=sha(expected):
            raise RuntimeError("Unmanaged WebP asset - refusing delete "+name)
        f.delete(dest);count+=1
    print("WEBP_PILOT_ROLLBACK_SUCCESS "+str(count)+" generated WebP assets removed",flush=True)
def main():
    if len(sys.argv)!=2 or sys.argv[1] not in ("prepare","enable","rollback"):
        raise RuntimeError("Usage: prepare | enable | rollback")
    mode=sys.argv[1]
    f=ftp_conn()
    try:
        # This fixed-three-banner utility is obsolete after the successful
        # uploads-wide WebP deployment. Prevent accidental deletion of
        # 3 banner sidecars while the global rewrite is active.
        uploads_rules=optional(f,ROOT+"/wp-content/uploads/.htaccess")
        if uploads_rules and b"PTSCPS_WEBP_UPLOADS_AUTOMATIC_v1" in uploads_rules:
            raise RuntimeError(
                "Dynamic WebP is active; use ptscps-webp-autogen-deploy.py rollback instead"
            )
        ht=optional(f,DIR+"/.htaccess")
        if mode=="rollback":return rollback(f)
        if ht is not None and ht!=RULES.encode("utf-8"):
            raise RuntimeError("Non-pilot .htaccess present, abort and preserve it")
        if mode=="prepare":
            if ht is not None:raise RuntimeError("Pilot already enabled; refusing prepare")
            rows=ensure_images(f)
            print("WEBP_PILOT_PREPARED "+str(rows),flush=True)
            return
        if mode=="enable":
            for name in NAMES:
                original=read(f,DIR+"/"+name)
                expected,_=encode(original)
                existing=optional(f,DIR+"/"+name+".webp")
                if existing is None or sha(existing)!=sha(expected):
                    raise RuntimeError("WebP output missing or not matching source")
            if ht is None:atomic_write(f,DIR+"/.htaccess",RULES.encode("utf-8"))
            if read(f,DIR+"/.htaccess")!=RULES.encode("utf-8"):
                raise RuntimeError("Pilot rule did not verify")
            print("WEBP_PILOT_ENABLED exact 3 banners, source JPGs unchanged",flush=True)
    finally:
        try:f.quit()
        except Exception:f.close()
if __name__=="__main__":
    try:main()
    except Exception as e:
        print("WEBP_PILOT_FAILED "+type(e).__name__+" "+str(e)[:220],flush=True)
        sys.exit(1)
