#!/usr/bin/env python3
"""Atomically deploy/rollback a single owned Elementor logo dimension MU plugin via FTPS."""
import ftplib,hashlib,io,os,secrets,sys
from pathlib import Path
from urllib.parse import urlsplit
ROOT="/domains/ptscps.com.vn/public_html"
DIR=ROOT+"/wp-content/mu-plugins"
NAME="ptscps-customer-image-dimensions.php"
DEST=DIR+"/"+NAME
DISABLED=DEST+".disabled"
SOURCE=Path("deploy/ptscps-customer-image-dimensions.php").read_bytes()
MARK=b"Plugin Name: PTSCPS Elementor Customer Carousel Image Dimensions"
if MARK not in SOURCE or b"Version: 1.0.0" not in SOURCE:
    raise RuntimeError("Unexpected owner/source marker")
url=os.environ["FTP_SERVER"]
parsed=urlsplit(url if "://" in url else "//"+url)
f=ftplib.FTP_TLS(timeout=27)
f.connect(parsed.hostname,parsed.port or 21,timeout=27)
f.auth();f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
f.prot_p();f.set_pasv(True)
def read(path):
    chunks=[]
    f.retrbinary("RETR "+path,chunks.append)
    return b"".join(chunks)
def opt(path):
    try:return read(path)
    except ftplib.error_perm as e:
        if str(e).startswith("550"):return None
        raise
def same(x,y):return hashlib.sha256(x).digest()==hashlib.sha256(y).digest()
try:
    f.cwd(ROOT)
    found={x.rsplit("/",1)[-1] for x in f.nlst()}
    if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(found):
        raise RuntimeError("Not expected WordPress root")
    old=opt(DEST)
    disabled=opt(DISABLED)
    if "--rollback" in sys.argv:
        if old is None:print("LOGO_DIMS_ALREADY_INACTIVE")
        else:
            if MARK not in old:raise RuntimeError("Unowned deployed MU plugin")
            if disabled is not None:
                if MARK not in disabled:raise RuntimeError("Unowned disabled backup")
                f.delete(DISABLED)
            f.rename(DEST,DISABLED)
            if opt(DEST) is not None or not same(read(DISABLED),old):
                raise RuntimeError("Rollback check failed")
            print("LOGO_DIMS_ROLLBACK_SUCCESS")
        sys.exit(0)
    if old==SOURCE:
        print("LOGO_DIMS_ALREADY_CURRENT")
        sys.exit(0)
    if old is not None and MARK not in old:raise RuntimeError("Refusing to replace unowned file")
    if disabled is not None and MARK not in disabled:raise RuntimeError("Unknown disabled backup file")
    token=secrets.token_hex(5)
    staged=DIR+"/."+NAME+"."+token+".tmp"
    f.storbinary("STOR "+staged,io.BytesIO(SOURCE))
    if not same(read(staged),SOURCE):raise RuntimeError("Staged FTPS checksum mismatch")
    if old is None:f.rename(staged,DEST)
    else:
        parked=DIR+"/."+NAME+"."+token+".old"
        f.rename(DEST,parked)
        try:f.rename(staged,DEST)
        except Exception:
            f.rename(parked,DEST)
            raise
        backup=DIR+"/."+NAME+"."+token+".bak"
        f.rename(parked,backup)
        print("LOGO_DIMS_BACKUP "+backup.rsplit("/",1)[-1])
    if not same(read(DEST),SOURCE):raise RuntimeError("Installed file checksum mismatch")
    print("LOGO_DIMS_DEPLOYED "+hashlib.sha256(SOURCE).hexdigest())
finally:
    try:f.quit()
    except Exception:f.close()
