#!/usr/bin/env python3
"""Manual rollback of the successful 2026-11-17 PTSCPS Elementor homepage widget CSS trial.
Only remove 3 precisely named and SHA-256 verified files; refuse on mismatch.
Original theme and CSS source files are not touched.
"""
import ftplib
import hashlib
import os
from urllib.parse import urlsplit

ROOT="/domains/ptscps.com.vn/public_html"
TARGETS=[
 (ROOT+"/wp-content/mu-plugins/ptscps-elementor-home-widgets-bundle.php",
  "967811f57514ce11814343e7fd3e8be31be1348b6db14103fb109243ac6e3d59"),
 (ROOT+"/wp-content/themes/jannah-child/ptscps-elementor-home-widgets-20261117-v1.json",
  "6e42f080d9ce9bbc0261014fe2f69db497c8533300188b2e4d98a9d318fde40c"),
 (ROOT+"/wp-content/themes/jannah-child/ptscps-elementor-home-widgets-20261117-v1.css",
  "0c0ab22e2c81e032fa734ab72efb097d7debeef4599148bc5686fcdd0ffffafa")
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
            print("EHW_MANUAL_REMOVED "+name,flush=True)
    print("EHW_MANUAL_ROLLBACK_OK",flush=True)
finally:
    try:ftp.quit()
    except Exception:ftp.close()
