#!/usr/bin/env python3
"""Manual rollback of the successful 2026-11-17 PTSCPS Elementor icons/frontend CSS trial.
Only remove 3 precisely named and SHA-256 verified files; refuse on mismatch.
Original theme and CSS source files are not touched.
"""
import ftplib
import hashlib
import os
from urllib.parse import urlsplit

ROOT="/domains/ptscps.com.vn/public_html"
TARGETS=[
 (ROOT+"/wp-content/mu-plugins/ptscps-elementor-icons-frontend-bundle.php",
  "820f2b0564471589491251bbf9ee5ac91f6e376c7a3ceffddb6452e35a2d9f16"),
 (ROOT+"/wp-content/themes/jannah-child/ptscps-elementor-icons-frontend-20261118-v1.json",
  "46f5b4b2d3e723a229bca03a2caf796fb345196aabe6219d268b6c108b0ede34"),
 (ROOT+"/wp-content/themes/jannah-child/ptscps-elementor-icons-frontend-20261118-v1.css",
  "6ac680c5b8730d6fdcc8c53b5f6221ba746716a5d6e363240996c9d5b6880522")
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
            print("EIF_MANUAL_REMOVED "+name,flush=True)
    print("EIF_MANUAL_ROLLBACK_OK",flush=True)
finally:
    try:ftp.quit()
    except Exception:ftp.close()
