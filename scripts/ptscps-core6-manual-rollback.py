#!/usr/bin/env python3
"""Manual rollback of the successful 2026-11-17 PTSCPS core6 release.
Only remove 3 precisely named and SHA-256 verified files; refuse on mismatch.
Original theme and CSS source files are not touched.
"""
import ftplib
import hashlib
import os
from urllib.parse import urlsplit

ROOT="/domains/ptscps.com.vn/public_html"
TARGETS=[
 (ROOT+"/wp-content/mu-plugins/ptscps-jannah-core6-bundle.php",
  "d3b0ee3f615aeb338abdedbdd3f8b3afcdaa2e45d5e9223e9de7cfa8b5832bb1"),
 (ROOT+"/wp-content/themes/jannah-child/ptscps-jannah-core6-20261117-v1.json",
  "a261a1d1aec0da82dd58c569fcea72739e167dbe9441d6389686385492ccc87a"),
 (ROOT+"/wp-content/themes/jannah-child/ptscps-jannah-core6-20261117-v1.css",
  "e5aebeb1434c9b902bb57b23db5d4716e480102d84592af770fbf976f52e2363")
]
raw=os.environ["FTP_SERVER"]
u=urlsplit(raw if "://" in raw else "//"+raw)
ftp=ftplib.FTP_TLS(timeout=30)
ftp.connect(u.hostname,u.port or 21,timeout=30)
ftp.auth()
ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
ftp.prot_p()
ftp.set_pasv(True)
def fetch(name):
    buf=bytearray()
    try:
        ftp.retrbinary("RETR "+name,buf.extend)
    except ftplib.error_perm as e:
        if str(e).startswith("550"):
            return None
        raise
    return bytes(buf)
try:
    ftp.cwd(ROOT)
    names={x.rstrip("/").split("/")[-1] for x in ftp.nlst()}
    if not {"wp-admin","wp-content","wp-includes","index.php"}.issubset(names):
        raise RuntimeError("Not the expected production document root")
    # Verify ALL existing files before deleting any.
    for name,expected in TARGETS:
        contents=fetch(name)
        if contents is None:
            continue
        if hashlib.sha256(contents).hexdigest()!=expected:
            raise RuntimeError("Refuse deletion: changed or unrelated file "+name)
    for name,expected in TARGETS:
        if fetch(name) is not None:
            ftp.delete(name)
            if fetch(name) is not None:
                raise RuntimeError("File still present after deletion "+name)
            print("CORE6_MANUAL_REMOVED "+name,flush=True)
    print("CORE6_MANUAL_ROLLBACK_OK",flush=True)
finally:
    try:ftp.quit()
    except Exception:ftp.close()
