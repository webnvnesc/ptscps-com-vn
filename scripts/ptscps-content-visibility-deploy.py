#!/usr/bin/env python3
"""Install or rollback PTSCPS offscreen content-visibility pilot.

Encrypted FTPS, exact owned file only, checksum; no other WP files modified.
Rollback disables this one MU plugin by renaming its PHP extension.
"""
import ftplib,hashlib,io,os,secrets,sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT="/domains/ptscps.com.vn/public_html"
DIR=ROOT+"/wp-content/mu-plugins"
NAME="ptscps-content-visibility-pilot.php"
PATH=DIR+"/"+NAME
DISABLED=PATH+".disabled"
SOURCE=Path("deploy/ptscps-content-visibility-pilot.php").read_bytes()
MARK=b"Plugin Name: PTSCPS Offscreen Content Visibility Pilot"
if MARK not in SOURCE or b"Version: 1.0.1" not in SOURCE:
    raise RuntimeError("Unrecognized MU plugin source")

host=os.environ["FTP_SERVER"]
parsed=urlsplit(host if "://" in host else "//"+host)
ftp=ftplib.FTP_TLS(timeout=27)
ftp.connect(parsed.hostname,parsed.port or 21,timeout=27)
ftp.auth()
ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
ftp.prot_p()
ftp.set_pasv(True)
def read(path):
    data=bytearray()
    ftp.retrbinary("RETR "+path,data.extend)
    return bytes(data)
def optional_read(path):
    try:return read(path)
    except ftplib.error_perm as e:
        if str(e).startswith("550"):return None
        raise
def same(a,b):return hashlib.sha256(a).digest()==hashlib.sha256(b).digest()

try:
    ftp.cwd(ROOT)
    root={p.rsplit("/",1)[-1] for p in ftp.nlst()}
    if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(root):
        raise RuntimeError("Unexpected WP root; abort")
    old=optional_read(PATH)
    disabled=optional_read(DISABLED)
    if "--rollback" in sys.argv:
        if old is None:
            print("CV_ROLLBACK_ALREADY_INACTIVE")
        else:
            if MARK not in old:raise RuntimeError("Refusing to disable unmanaged MU plugin")
            if disabled is not None:
                if MARK not in disabled:raise RuntimeError("Refusing to overwrite unrelated disabled file")
                ftp.delete(DISABLED)
            ftp.rename(PATH,DISABLED)
            if optional_read(PATH) is not None or not same(read(DISABLED),old):
                raise RuntimeError("Rollback verification failed")
            print("CV_ROLLBACK_SUCCESS disabled only named MU plugin")
        sys.exit(0)
    if old==SOURCE:
        print("CV_ALREADY_CURRENT sha256="+hashlib.sha256(SOURCE).hexdigest())
        sys.exit(0)
    if old is not None and MARK not in old:raise RuntimeError("Refusing to overwrite unowned plugin")
    if disabled is not None and MARK not in disabled:
        raise RuntimeError("Unrecognized rollback file")
    token=secrets.token_hex(6)
    staged=DIR+"/."+NAME+"."+token+".tmp"
    ftp.storbinary("STOR "+staged,io.BytesIO(SOURCE))
    if not same(read(staged),SOURCE):raise RuntimeError("Staged plugin differs")
    if old is None:
        ftp.rename(staged,PATH)
    else:
        parked=DIR+"/."+NAME+"."+token+".old"
        ftp.rename(PATH,parked)
        try:ftp.rename(staged,PATH)
        except Exception:
            ftp.rename(parked,PATH)
            raise
        backup=DIR+"/."+NAME+"."+token+".bak"
        ftp.rename(parked,backup)
        print("CV_PREVIOUS_BACKUP "+backup.rsplit("/",1)[-1])
    if not same(read(PATH),SOURCE):raise RuntimeError("Installed plugin mismatch")
    print("CV_ENABLED sha256="+hashlib.sha256(SOURCE).hexdigest(),flush=True)
finally:
    try:ftp.quit()
    except Exception:ftp.close()
