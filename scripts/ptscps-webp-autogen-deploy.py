#!/usr/bin/env python3
"""Migrate PTSCPS three-banner pilot to automatic uploads-wide WebP rewrite.

Exact current-state preconditions:
- uploads/.htaccess is EMPTY (audited)
- uploads/2019/10/.htaccess equals our owned v1 WebP pilot only
- original images and their WebP copies remain intact.
No WordPress root .htaccess, theme, image source, or DB changes.

prepare: upload a single owned MU plugin and synthetic JPG+PNG with WebP to
         uploads/2026/11 for an end-to-end HTTP rewrite smoke test.
enable: atomically replace EMPTY uploads root .htaccess with scoped rewrite;
        then remove exact owned per-banner child rules so global rule inherits.
rollback: restore old owned child rules, remove exact owned root rules, disable
          owned MU plugin, remove synthetic smoke images.
cleanup: remove synthetic smoke files only.
"""
import ftplib,hashlib,io,os,sys,secrets
from pathlib import Path
from urllib.parse import urlsplit
from PIL import Image

ROOT="/domains/ptscps.com.vn/public_html"
UPLOADS=ROOT+"/wp-content/uploads"
CHILD=UPLOADS+"/2019/10"
SMOKE_DIR=UPLOADS+"/2026/11"
SMOKE_BASE="ptscps-webp-auto-qa-20261117"
PLUGIN=ROOT+"/wp-content/mu-plugins/ptscps-webp-autogen.php"
DISABLED=PLUGIN+".disabled"
SOURCE=Path("deploy/ptscps-webp-autogen.php").read_bytes()
MARK=b"Plugin Name: PTSCPS Automatic WebP for WordPress Uploads"
if MARK not in SOURCE or b"Version: 1.0.0" not in SOURCE:
    raise RuntimeError("Unrecognized owned PHP MU plugin")
LEGACY=r"""# BEGIN PTSCPS_WEBP_BANNERS_PILOT_v1
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
""".encode()
RULES=r"""# BEGIN PTSCPS_WEBP_UPLOADS_AUTOMATIC_v1
# Dynamic WebP for existing WordPress JPG/PNG URLs, only if a sidecar exists.
# Original JPG/PNG is always served when Accept lacks image/webp.
<IfModule mod_mime.c>
  AddType image/webp .webp
</IfModule>
<IfModule mod_headers.c>
  <FilesMatch "\.(?:jpe?g|png)(?:\.webp)?$">
    Header merge Vary Accept
  </FilesMatch>
</IfModule>
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTP_ACCEPT} image/webp [NC]
  RewriteCond %{REQUEST_FILENAME}.webp -f
  RewriteRule ^(.+)\.(jpe?g|png)$ $1.$2.webp [NC,L,T=image/webp]
</IfModule>
# END PTSCPS_WEBP_UPLOADS_AUTOMATIC_v1
""".encode()

def digest(data):return hashlib.sha256(data).hexdigest()
def connect():
    raw=os.environ["FTP_SERVER"]
    parsed=urlsplit(raw if "://" in raw else "//"+raw)
    f=ftplib.FTP_TLS(timeout=29)
    f.connect(parsed.hostname,parsed.port or 21,timeout=29)
    f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
    f.prot_p();f.set_pasv(True)
    f.cwd(ROOT)
    names={x.rstrip("/").rsplit("/",1)[-1] for x in f.nlst()}
    if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(names):
        raise RuntimeError("WordPress root identity check failed")
    return f
def read(f,path):
    chunks=[];length=[0]
    def add(data):
        length[0]+=len(data)
        if length[0]>12_000_000:raise RuntimeError("Unexpected FTP file size")
        chunks.append(data)
    f.retrbinary("RETR "+path,add)
    return b"".join(chunks)
def optional(f,path):
    try:return read(f,path)
    except ftplib.error_perm as e:
        if str(e).startswith("550"):return None
        raise
def create(f,path,blob):
    if optional(f,path) is not None:raise RuntimeError("Refusing to overwrite "+path)
    stage=UPLOADS+"/.ptscps-webp-auto-"+secrets.token_hex(6)+".tmp"
    f.storbinary("STOR "+stage,io.BytesIO(blob))
    if digest(read(f,stage))!=digest(blob):raise RuntimeError("Stage integrity failure")
    f.rename(stage,path)
    if digest(read(f,path))!=digest(blob):raise RuntimeError("Final integrity failure")
def upload_plugin(f):
    current=optional(f,PLUGIN)
    if current is not None:
        if current!=SOURCE:raise RuntimeError("Refusing to replace unrelated WebP plugin")
        print("WEBP_AUTO_PLUGIN_ALREADY_CURRENT",flush=True);return
    f.storbinary("STOR "+PLUGIN,io.BytesIO(SOURCE))
    if read(f,PLUGIN)!=SOURCE:raise RuntimeError("MU plugin upload integrity failure")
    print("WEBP_AUTO_PLUGIN_INSTALLED",flush=True)
def smoke_data():
    im=Image.new("RGB",(24,18))
    for y in range(18):
        for x in range(24):
            im.putpixel((x,y),((x*11)%256,(y*13)%256,((x+y)*7)%256))
    result={}
    for ext in ("jpg","png"):
        buf=io.BytesIO()
        im.save(buf,format="JPEG" if ext=="jpg" else "PNG",quality=90)
        original=buf.getvalue()
        wp=io.BytesIO();im.save(wp,format="WEBP",quality=82,method=6)
        result[ext]=(original,wp.getvalue())
    return result
def clean(f):
    deleted=0
    for ext,pair in smoke_data().items():
        for suf,data in [("."+ext,pair[0]),("."+ext+".webp",pair[1])]:
            path=SMOKE_DIR+"/"+SMOKE_BASE+suf
            old=optional(f,path)
            if old is None:continue
            if digest(old)!=digest(data):raise RuntimeError("Unmanaged smoke test artifact "+path)
            f.delete(path)
            deleted+=1
    print("WEBP_AUTO_SMOKE_CLEAN "+str(deleted),flush=True)
def prepare(f):
    root=optional(f,UPLOADS+"/.htaccess")
    child=optional(f,CHILD+"/.htaccess")
    if root!=b"":raise RuntimeError("Root uploads .htaccess no longer empty; abort")
    if child!=LEGACY:raise RuntimeError("Existing per-banner pilot changed; abort")
    upload_plugin(f)
    samples=smoke_data()
    for ext,pair in samples.items():
        for suffix,data in [("."+ext,pair[0]),("."+ext+".webp",pair[1])]:
            path=SMOKE_DIR+"/"+SMOKE_BASE+suffix
            old=optional(f,path)
            if old is None:create(f,path,data)
            elif digest(old)!=digest(data):raise RuntimeError("Unmanaged smoke file "+path)
    print("WEBP_AUTO_PREPARED smoke JPG+PNG and sidecars, original banners unchanged",flush=True)
def enable(f):
    root=optional(f,UPLOADS+"/.htaccess")
    child=optional(f,CHILD+"/.htaccess")
    if root!=b"":raise RuntimeError("Global upload rules no longer empty; abort")
    if child!=LEGACY:raise RuntimeError("Child image rules no longer our legacy pilot")
    if optional(f,PLUGIN)!=SOURCE:raise RuntimeError("Autogen plugin not installed")
    # Stage new rule in same FTP directory. Remove original empty target first,
    # then atomic rename; never edit global WordPress root .htaccess.
    tmp=UPLOADS+"/.ptscps-webp-root-"+secrets.token_hex(6)+".tmp"
    f.storbinary("STOR "+tmp,io.BytesIO(RULES))
    if read(f,tmp)!=RULES:raise RuntimeError("Rule staged mismatch")
    f.delete(UPLOADS+"/.htaccess")
    try:f.rename(tmp,UPLOADS+"/.htaccess")
    except Exception:
        f.storbinary("STOR "+UPLOADS+"/.htaccess",io.BytesIO(b""))
        raise
    if read(f,UPLOADS+"/.htaccess")!=RULES:raise RuntimeError("Rule verification failure")
    # Child-specific rewrite overrides or competes with generic rules. Remove
    # only if original content equals exact generated v1 policy.
    f.delete(CHILD+"/.htaccess")
    if optional(f,CHILD+"/.htaccess") is not None:
        raise RuntimeError("Legacy child rewrite still installed")
    print("WEBP_AUTO_ENABLED generic uploads rewrite, old child pilot disabled",flush=True)
def rollback(f):
    # First restore the known-good old child rule, then disable new parent.
    child=optional(f,CHILD+"/.htaccess")
    if child is None:create(f,CHILD+"/.htaccess",LEGACY)
    elif child!=LEGACY:raise RuntimeError("Refusing to touch unrelated child rewrite")
    root=optional(f,UPLOADS+"/.htaccess")
    if root==RULES:
        f.delete(UPLOADS+"/.htaccess")
        f.storbinary("STOR "+UPLOADS+"/.htaccess",io.BytesIO(b""))
        if read(f,UPLOADS+"/.htaccess")!=b"":
            raise RuntimeError("Root rollback failed")
    elif root!=b"":raise RuntimeError("Refusing to alter non-owned root rules")
    current=optional(f,PLUGIN)
    if current is not None:
        if current!=SOURCE:raise RuntimeError("Refusing to disable unknown plugin")
        old=optional(f,DISABLED)
        if old is not None:
            if old!=SOURCE:raise RuntimeError("Refusing to overwrite non-owned disabled plugin")
            f.delete(DISABLED)
        f.rename(PLUGIN,DISABLED)
        if optional(f,PLUGIN) is not None or read(f,DISABLED)!=SOURCE:
            raise RuntimeError("Plugin disable verification failed")
    clean(f)
    print("WEBP_AUTO_ROLLBACK_SUCCESS owned global rule reset; child pilot restored; plugin disabled",flush=True)
def main():
    if len(sys.argv)!=2 or sys.argv[1] not in ("prepare","enable","rollback","cleanup"):
        raise RuntimeError("Usage prepare|enable|rollback|cleanup")
    f=connect()
    try:
        if sys.argv[1]=="prepare":prepare(f)
        elif sys.argv[1]=="enable":enable(f)
        elif sys.argv[1]=="rollback":rollback(f)
        else:clean(f)
    finally:
        try:f.quit()
        except Exception:f.close()
if __name__=="__main__":
    try:main()
    except Exception as e:
        print("WEBP_AUTO_ERROR "+type(e).__name__+" "+str(e)[:260],flush=True)
        sys.exit(1)
